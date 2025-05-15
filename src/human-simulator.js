/**
 * Human Simulator - Module to simulate human-like typing behavior
 */
class HumanSimulator {
  constructor() {
    this.config = CONFIG.AI.humanSimulation;
    this.recentMessages = [];
    this.maxRecentMessages = 10;
  }

  /**
   * Processes a message naturally (with typing indicators, etc.)
   * @param {string} message - The message to process
   * @returns {Promise<boolean>} Success status of send
   */
  async processMessageNaturally(message) {
    try {
      // Start typing indicator
      await this.startTypingIndicator();

      // Calculate typing time
      const typingTime = this.calculateTypingTime(message);

      // Wait for the calculated time
      await delay(typingTime);

      // Stop typing indicator
      await this.stopTypingIndicator();

      // Determine if the message should be split
      if (this.shouldSplitMessage(message)) {
        return await this.sendSplitMessage(message);
      } else {
        // Insert and send normally
        const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
        if (!inputField) throw new Error("Input field not found");

        await this.insertTextNaturally(inputField, message);
        await this.sendViaEnter(inputField);

        // Record message length for statistics
        this.recordMessageLength(message);

        return true;
      }
    } catch (error) {
      logger.error(`Error processing message: ${error.message}`);
      await this.stopTypingIndicator();
      return false;
    }
  }

  /**
   * Inserts text simulating natural typing
   * @param {HTMLElement} inputField - The input field
   * @param {string} text - The text to insert
   * @returns {Promise<boolean>} Success status
   */
  async insertTextNaturally(inputField, text) {
    if (!inputField || !text) return false;

    try {
      // First, completely clear the field
      inputField.focus();

      // Clear field with multiple methods
      inputField.innerText = '';
      inputField.textContent = '';
      if (document.execCommand) {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      }
      inputField.dispatchEvent(new Event('input', { bubbles: true }));

      // Small pause before starting to type
      await this.delay(200);

      // Try multiple insertion methods for maximum compatibility
      let success = false;

      // Method 1: Direct innerText for contentEditable elements
      if (inputField.contentEditable === "true") {
        inputField.innerText = text;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        success = true;
        logger.debug("Text inserted using contentEditable innerText method");
      }

      // Method 2: Using execCommand
      if (!success && document.execCommand) {
        try {
          document.execCommand('insertText', false, text);
          success = true;
          logger.debug("Text inserted using execCommand method");
        } catch (e) {
          logger.debug(`execCommand failed: ${e.message}`);
        }
      }

      // Method 3: Using value property for traditional inputs
      if (!success && 'value' in inputField) {
        inputField.value = text;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        success = true;
        logger.debug("Text inserted using value property method");
      }

      // Method 4: DOM insertion
      if (!success) {
        // Clear existing content
        while (inputField.firstChild) {
          inputField.removeChild(inputField.firstChild);
        }

        const textNode = document.createTextNode(text);
        inputField.appendChild(textNode);
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        success = true;
        logger.debug("Text inserted using DOM manipulation method");
      }

      // Final verification
      if (inputField.innerText && inputField.innerText.trim() !== '') {
        logger.debug(`Text verification: field contains "${inputField.innerText.substring(0, 30)}..."`);
      } else {
        logger.warn("Text insertion succeeded but field appears empty");

        // Last resort attempt
        inputField.textContent = text;
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return true;
    } catch (error) {
      logger.error(`Error in insertTextNaturally: ${error.message}`);
      return false;
    }
  }

  /**
   * Creates a version of the text with a typographical error
   * @param {string} text - Original text
   * @returns {string} Text with a typo
   */
  createTypoVersion(text) {
    if (text.length < 10) return text;

    const pos = Math.floor(Math.random() * (text.length - 3) + 1);
    const typoType = Math.random();

    if (typoType < 0.33) {
      // Duplicated character
      return text.substring(0, pos) + text[pos] + text.substring(pos);
    } else if (typoType < 0.66) {
      // Incorrect character
      const nearbyKeys = {
        'a': 'sqzw', 'b': 'vghn', 'c': 'xdfv', 'd': 'serfcx',
        'e': 'wsrdf', 'f': 'drtgv', 'g': 'ftyhb', 'h': 'gyujn',
        'i': 'ujko', 'j': 'hyuikn', 'k': 'jiol', 'l': 'kop',
        'm': 'njk', 'n': 'bhjm', 'o': 'iklp', 'p': 'ol',
        'q': 'wa', 'r': 'edft', 's': 'awedxz', 't': 'rfgy',
        'u': 'yhji', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc',
        'y': 'tghu', 'z': 'asx'
      };

      const char = text[pos].toLowerCase();
      if (nearbyKeys[char]) {
        const wrong = nearbyKeys[char][Math.floor(Math.random() * nearbyKeys[char].length)];
        return text.substring(0, pos) + wrong + text.substring(pos + 1);
      }
    } else {
      // Omitted character
      return text.substring(0, pos) + text.substring(pos + 1);
    }

    return text;
  }

  /**
   * Sends a message by pressing Enter
   * @param {HTMLElement} inputField - The input field
   */
  async sendViaEnter(inputField) {
    try {
      inputField.focus();

      // Simulate Enter key events
      const enterEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      });
      inputField.dispatchEvent(enterEvent);

      // Alternative: find and click the send button
      setTimeout(() => {
        if (inputField.innerText && inputField.innerText.trim() !== '') {
          const sendButton = document.querySelector(CONFIG.selectors.activeChat.sendButton);
          if (sendButton) {
            sendButton.click();
          }
        }
      }, 200);

      return true;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      return false;
    }
  }

  /**
   * Determines if a message should be split
   * @param {string} text - The message text
   * @returns {boolean}
   */
  shouldSplitMessage(text) {
    if (!this.config.fragmentMessages) return false;

    // Always split very long messages
    if (text && text.length > this.config.fragmentThreshold * 2) {
      return true;
    }

    // For medium messages, decide randomly
    if (text && text.length > this.config.fragmentThreshold) {
      return Math.random() < 0.7; // 70% chance
    }

    return false;
  }

  /**
   * Splits and sends a message in fragments
   * @param {string} text - Full message
   * @returns {Promise<boolean>}
   */
  async sendSplitMessage(text) {
    try {
      const fragments = this.splitTextIntoFragments(text);

      for (let i = 0; i < fragments.length; i++) {
        // For fragments after the first, wait
        if (i > 0) {
          const interval = this.calculateFragmentInterval();
          await delay(interval);

          // Briefly trigger typing indicator for subsequent fragments
          await this.startTypingIndicator();
          await delay(Math.min(fragments[i].length * 30, 1500));
          await this.stopTypingIndicator();
        }

        // Send this fragment
        const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
        if (!inputField) throw new Error("Input field not found");

        await this.insertTextNaturally(inputField, fragments[i]);
        await this.sendViaEnter(inputField);
      }

      // Record as a single message for statistics
      this.recordMessageLength(text);

      return true;
    } catch (error) {
      logger.error(`Error sending split message: ${error.message}`);
      return false;
    }
  }

  /**
   * Splits text into natural fragments
   * @param {string} text - Text to split
   * @returns {string[]}
   */
  splitTextIntoFragments(text) {
    if (!text) return [text];

    // Try splitting by paragraphs first
    if (text.includes('\n\n')) {
      return text.split(/\n\n+/).filter(p => p.trim());
    }

    // Split by sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    // Group sentences into more natural fragments
    const fragments = [];
    let currentFragment = '';
    let sentenceCount = 0;

    for (const sentence of sentences) {
      // If this sentence would make the fragment too long, start a new one
      if (currentFragment.length + sentence.length > this.config.fragmentThreshold ||
        (sentenceCount >= 2 && Math.random() < 0.5)) {
        if (currentFragment) {
          fragments.push(currentFragment.trim());
        }
        currentFragment = sentence;
        sentenceCount = 1;
      } else {
        currentFragment += sentence;
        sentenceCount++;
      }
    }

    if (currentFragment) {
      fragments.push(currentFragment.trim());
    }

    return fragments.length > 0 ? fragments : [text];
  }

  /**
   * Calculates interval between fragments
   * @returns {number}
   */
  calculateFragmentInterval() {
    const minDelay = this.config.fragmentDelay[0];
    const maxDelay = this.config.fragmentDelay[1];

    // Sometimes add extra pause to simulate thinking
    const extraThinking = Math.random() < 0.3 ?
      1000 + Math.random() * 2000 : 0;

    return Math.floor(minDelay + Math.random() * (maxDelay - minDelay) + extraThinking);
  }

  /**
   * Calculates typing time based on length and complexity
   * @param {string} message - The message
   * @returns {number}
   */
  calculateTypingTime(message) {
    if (!message) return this.config.minResponseDelay;

    // Basic calculation
    let baseTime = message.length * (this.config.baseTypingSpeed / 1000);

    // Add natural variation
    const variation = Math.random() * this.config.typingVariation * message.length / 100;

    // Apply constraints
    return Math.max(
      this.config.minResponseDelay,
      Math.min(baseTime + variation, this.config.maxResponseDelay)
    );
  }

  /**
   * Records message length for statistics
   * @param {string} message - The message
   */
  recordMessageLength(message) {
    if (!message) return;

    this.recentMessages.push(message);
    if (this.recentMessages.length > this.maxRecentMessages) {
      this.recentMessages.shift();
    }
  }

  /**
   * Gets average length of recent messages
   * @returns {number}
   */
  getAverageMessageLength() {
    if (this.recentMessages.length === 0) return 50;

    const totalLength = this.recentMessages.reduce((sum, msg) => sum + msg.length, 0);
    return totalLength / this.recentMessages.length;
  }

  /**
   * Starts typing indicator
   * @returns {Promise<boolean>}
   */
  async startTypingIndicator() {
    try {
      // Find input field to trigger typing indicator
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (!inputField) {
        logger.debug('Input field not found for typing indicator');
        return false;
      }

      // Focus to start typing session
      inputField.focus();

      return true;
    } catch (error) {
      logger.debug(`Error activating indicator: ${error.message}`);
      return false;
    }
  }

  /**
   * Stops typing indicator
   * @returns {Promise<boolean>}
   */
  async stopTypingIndicator() {
    try {
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (inputField && inputField.innerText) {
        inputField.innerText = '';
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    } catch (error) {
      logger.debug(`Error deactivating indicator: ${error.message}`);
      return false;
    }
  }
}

// Create and expose a singleton instance
const humanSimulator = new HumanSimulator();
// only one global instance:
window.humanSimulator = humanSimulator;
