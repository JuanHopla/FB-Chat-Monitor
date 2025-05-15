// ----- OPENAI INTEGRATION -----

/**
 * OpenAI Manager - Handles OpenAI API integration with assistant selection based on role
 */
class OpenAIManager {
  constructor() {
    // Use storageUtils as the primary data source
    this.apiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '') || '';
    this.model = "gpt-4.1-mini"; // Fixed to gpt-4.1-mini
    this.isInitialized = false;
    this.activeThreads = new Map(); // Store active threads by chatId
    this.threadTTL = 30 * 60 * 1000; // 30 minutes

    // Assistant IDs by role
    this.assistants = {
      seller: storageUtils.get('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', ''),
      buyer: storageUtils.get('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', ''),
      default: storageUtils.get('FB_CHAT_MONITOR_DEFAULT_ASSISTANT_ID', '')
    };

    // Performance metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokensUsed: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };
  }

  /**
   * Initialize the OpenAI Manager with API key and model
   * This is a critical method that must work properly
   * @param {string} apiKey - OpenAI API key
   */
  initialize(apiKey = null) {
    try {
      // Update if new API key provided
      if (apiKey) {
        this.apiKey = apiKey;
        CONFIG.AI.apiKey = apiKey;
        storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);

        // Also update the API key for audio transcription
        if (CONFIG.audioTranscription) {
          CONFIG.audioTranscription.apiKey = apiKey;
        }
      }

      // The model is always fixed
      this.model = "gpt-4.1-mini";
      CONFIG.AI.model = "gpt-4.1-mini";

      // If we have an API key, we should always be initialized
      if (this.apiKey) {
        this.isInitialized = true;
        logger.debug('initialize(): API key present, setting isInitialized=true');
      } else {
        this.isInitialized = false;
        logger.debug('initialize(): No API key, setting isInitialized=false');
      }
      
      logger.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);

      // Schedule thread cleanup
      setInterval(() => this.cleanupOldThreads(), 15 * 60 * 1000); // Every 15 minutes

      // Schedule periodic service verification
      this.schedulePeriodicChecks();

      return this.isInitialized;
    } catch (error) {
      logger.error(`Error initializing OpenAI Manager: ${error.message}`);
      return false;
    }
  }

  /**
   * Alias for initialize() to maintain compatibility with existing code
   * @param {string} apiKey - Optional API key to use
   * @returns {boolean} - Whether the initialization was successful
   */
  loadConfig(apiKey = null) {
    logger.debug('loadConfig() called - redirecting to initialize()');
    return this.initialize(apiKey);
  }

  /**
   * Set a new API key, persist it and validate it
   * @param {string} apiKey
   * @returns {Promise<boolean>} true if the key is valid
   */
  async setApiKey(apiKey) {
    // update in-memory and storage
    this.apiKey = apiKey;
    CONFIG.AI.apiKey = apiKey;

    // Save in storageUtils for greater persistence
    storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);

    // run real validation against OpenAI
    const valid = await this.validateApiKey();
    this.isInitialized = valid;
    return valid;
  }

  /**
   * Verifies the status of the OpenAI service and corrects problems if possible
   * @returns {boolean} If the service is available and operational
   */
  verifyServiceState() {
    logger.log('Verifying OpenAI service status...');
    
    // Additional verification: ensure that "this" is the correct instance
    if (this !== window.openaiManager) {
      logger.warn('Incorrect openaiManager instance, correcting reference...');
      // This could happen if there are multiple instances or lost context
      Object.assign(this, window.openaiManager);
    }
    
    // Verify if it is initialized, and if not, try to initialize it
    if (!this.isInitialized || !this.apiKey) {
      logger.debug('OpenAI Manager is not initialized, attempting to recover state');
      
      // Try with API key from CONFIG
      if (CONFIG?.AI?.apiKey) {
        logger.debug('Using API key from CONFIG to initialize OpenAI Manager');
        this.apiKey = CONFIG.AI.apiKey;
        this.isInitialized = true; // Force initialization if we have a key
      } 
      // Try with localStorage as a backup
      else {
        const storedApiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '');
        if (storedApiKey) {
          logger.debug('Using API key from localStorage to initialize OpenAI Manager');
          this.apiKey = storedApiKey;
          this.isInitialized = true; // Force initialization if we have a key
        }
      }
    }
    
    // Highest priority: having an API key should mean we are ready
    const isReady = !!this.apiKey;
    
    // Ensure that isInitialized matches our definition of "ready"
    if (isReady && !this.isInitialized) {
      this.isInitialized = true;
      logger.debug('Correcting isInitialized to TRUE because we have apiKey');
    }
    
    // Verify final status
    logger.log(`Final status of OpenAI Manager: ${isReady ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    logger.debug(`Details: apiKey exists=${!!this.apiKey}, isInitialized=${this.isInitialized}, isReady()=${isReady}`);
    
    return isReady;
  }
  
  /**
   * Schedules periodic checks to keep the service in good condition
   */
  schedulePeriodicChecks() {
    // No need to verify immediately, as initialize() already does it
    // Schedule periodic checks
    setInterval(() => this.verifyServiceState(), 60000); // Every minute
    logger.debug('Periodic service checks scheduled');
  }
  
  /**
   * Improved isReady method to properly check availability
   * @returns {boolean} True if the manager is ready to use
   */
  isReady() {
    // Most reliable check: having an API key is the primary requirement
    const hasApiKey = !!this.apiKey;
    
    if (hasApiKey) {
      // Auto-correct inconsistent state
      if (!this.isInitialized) {
        this.isInitialized = true;
        logger.debug('Auto-corrected isInitialized to true since API key exists');
      }
      return true;
    }
    
    return false;
  }

  /**
   * Validate the API key with OpenAI
   * @returns {Promise<boolean>} True if the key is valid
   */
  async validateApiKey() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        logger.log('API key validated successfully');
        return true;
      } else {
        const error = await response.json();
        logger.error(`API key validation failed: ${error.error?.message || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      logger.error(`API key validation error: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate a response using OpenAI API
   * @param {Object} context - Context data including role, messages, and product details
   * @returns {Promise<Object>} Generated response text and metadata
   */
  async generateResponse(context) {
    // If we are not ready, initialize first
    if (!this.isReady()) {
      this.verifyServiceState();
      
      // If we are still not ready after attempting to recover
      if (!this.isReady()) {
        logger.warn('OpenAI Manager is not ready to generate responses');
        return {
          text: "I'm sorry, I can't generate a response because I don't have access to the OpenAI API. Please verify your API key in the configuration.",
          error: true
        };
      }
    }
    
    // Existing code continues here...
    const startTime = Date.now();
    this.metrics.totalCalls++;

    try {
      // Clear the input field before generating the response
      this.clearInputField();

      // Determine which assistant to use based on role
      const assistantId = this.getAssistantIdForRole(context.role);
      if (!assistantId) {
        throw new Error(`No assistant configured for role: ${context.role}`);
      }

      logger.debug(`Using assistant ${assistantId} for role ${context.role}`);

      // Get or create a thread for this chat
      const thread = await this.getOrCreateThread(context.chatId);

      // Add message to the thread with context
      await this.addMessageToThread(thread.id, context);

      // Run the assistant on the thread
      const response = await this.runAssistant(thread.id, assistantId);

      // Update metrics
      this.metrics.successfulCalls++;
      const responseTime = Date.now() - startTime;
      this.metrics.totalResponseTime += responseTime;
      this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.successfulCalls;

      logger.debug(`Response generated in ${responseTime}ms`);

      return response;
    } catch (error) {
      this.metrics.failedCalls++;
      logger.error(`Error generating response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clears the chat input field
   * @returns {boolean} True if it could be cleared, false if the field was not found
   */
  clearInputField() {
    try {
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (!inputField) {
        logger.error('Message input field to clear not found');
        return false;
      }

      // IMPROVED: First check if there is already content in the field
      const isContentEditable = inputField.getAttribute('contenteditable') === 'true';
      const currentContent = isContentEditable ? 
        (inputField.textContent || '').trim() : 
        (inputField.value || '').trim();
        
      if (currentContent) {
        logger.debug(`Field has previous content (${currentContent.length} chars): "${currentContent.substring(0, 30)}..."`);
      } else {
        logger.debug('Field is already empty, no cleaning needed');
        return true; // Already clean, no processing needed
      }

      // PHASE 1: Preserve the current focus
      const activeElement = document.activeElement;

      // PHASE 2: Multiple cleaning strategies
      if (isContentEditable) {
        // Clean directly and aggressively for contenteditable
        inputField.innerHTML = '';
        inputField.textContent = '';
        
        // Use selection and delete
        inputField.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // ADDITIONAL TECHNIQUE: Range API for selection and deletion
        const range = document.createRange();
        range.selectNodeContents(inputField);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        selection.deleteFromDocument();
        
        // ADDITIONAL TECHNIQUE: Set empty text via textContent and innerHTML
        setTimeout(() => {
          inputField.textContent = '';
          inputField.innerHTML = '';
        }, 0);
      } 
      // For standard input/textarea fields
      else if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
        inputField.value = '';
        // Also try with all possible techniques
        inputField.setAttribute('value', '');
      }
      
      // PHASE 3: Trigger multiple events to notify changes
      const events = ['input', 'change', 'keyup', 'keydown'];
      events.forEach(eventType => {
        inputField.dispatchEvent(new Event(eventType, { bubbles: true }));
      });

      // PHASE 4: Verify if it was actually cleaned
      setTimeout(() => {
        const postCleanContent = isContentEditable ? 
          (inputField.textContent || '').trim() : 
          (inputField.value || '').trim();
          
        if (postCleanContent) {
          logger.warn(`Cleaning not effective, remaining content: "${postCleanContent.substring(0, 30)}..."`);
          
          // EMERGENCY CLEANING
          try {
            if (isContentEditable) {
              inputField.innerHTML = '';
              const parent = inputField.parentNode;
              if (parent) {
                const clone = inputField.cloneNode(false);
                parent.replaceChild(clone, inputField);
                clone.dispatchEvent(new Event('input', { bubbles: true }));
              }
            } else if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
                .set.call(inputField, '');
              inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } catch (e) {
            logger.debug(`Error in emergency cleaning: ${e.message}`);
          }
        } else {
          logger.debug('Verification: Field clean after process');
        }
      }, 50);

      // PHASE 5: Restore focus if it was different
      if (activeElement !== inputField && activeElement) {
        try {
          activeElement.focus();
        } catch (e) {
          // Ignore focus errors
        }
      }
      
      logger.debug('Aggressive cleaning of the input field completed');
      return true;
    } catch (error) {
      logger.error(`Error in clearInputField: ${error.message}`, {}, error);
      return false;
    }
  }

  /**
   * Get the appropriate assistant ID for the given role
   * @param {string} role - 'seller' or 'buyer'
   * @returns {string} Assistant ID
   */
  getAssistantIdForRole(role) {
    // First try to get the role-specific assistant
    let assistantId = this.assistants[role];

    // If not found, fall back to default assistant
    if (!assistantId) {
      assistantId = this.assistants.default;
      logger.debug(`No assistant for role ${role}, using default assistant`);
    }

    // If still not found, use the configuration
    if (!assistantId) {
      if (role === 'seller' && CONFIG.AI?.assistants?.seller?.id) {
        assistantId = CONFIG.AI.assistants.seller.id;
      } else if (role === 'buyer' && CONFIG.AI?.assistants?.buyer?.id) {
        assistantId = CONFIG.AI.assistants.buyer.id;
      }
    }

    return assistantId;
  }

  /**
   * Get or create a thread for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} Thread data
   */
  async getOrCreateThread(chatId) {
    // Check if we already have a thread for this chat
    const existingThread = this.activeThreads.get(chatId);
    if (existingThread && (Date.now() - existingThread.lastUsed < this.threadTTL)) {
      // Update last used timestamp
      existingThread.lastUsed = Date.now();
      this.activeThreads.set(chatId, existingThread);
      return existingThread;
    }

    // Create a new thread
    try {
      const response = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create thread');
      }

      const thread = await response.json();
      this.activeThreads.set(chatId, {
        id: thread.id,
        lastUsed: Date.now()
      });

      logger.debug(`Created new thread ${thread.id} for chat ${chatId}`);
      return thread;
    } catch (error) {
      logger.error(`Error creating thread: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a message with context to a thread
   * @param {string} threadId - Thread ID
   * @param {Object} context - Context including messages and product details
   */
  async addMessageToThread(threadId, context) {
    try {
      // Prepare the message content
      const messageContent = this.prepareMessageContent(context);

      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        },
        body: JSON.stringify({
          role: 'user',
          content: messageContent
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add message to thread');
      }

      logger.debug(`Added message to thread ${threadId}`);
      return await response.json();
    } catch (error) {
      logger.error(`Error adding message to thread: ${error.message}`);
      throw error;
    }
  }

  /**
   * Prepare the message content with context for the AI
   * @param {Object} context - Context data
   * @returns {Array} Message content array for OpenAI API
   */
  prepareMessageContent(context) {
    const { role, messages, productDetails, analysis } = context;

    // Start with a text part containing the JSON context
    const content = [{
      type: 'text',
      text: JSON.stringify({
        role: role,
        product: productDetails ? {
          id: productDetails.id,
          title: productDetails.title,
          price: productDetails.price,
          description: productDetails.description,
          condition: productDetails.condition,
          location: productDetails.location,
          category: productDetails.category,
          imageUrls: productDetails.imageUrls || [] // Include product image URLs
        } : null,
        // Take last N messages for context (use config or default)
        conversation: messages.slice(-(CONFIG.AI.messageHistoryLimit || 100)).map(msg => {
          // Ensure msg and msg.content exist
          if (!msg || !msg.content) {
            return { fromUser: !msg?.sentByUs, error: "Invalid message structure" };
          }

          const messageEntry = {
            fromUser: !msg.sentByUs,
            timestamp: msg.timestamp // Keep timestamp if available
          };
          // Add text content if present
          if (msg.content.text) {
            messageEntry.text = msg.content.text;
          }
          // Add transcribed audio if present and valid
          if (msg.content.transcribedAudio && typeof msg.content.transcribedAudio === 'string' && !msg.content.transcribedAudio.startsWith('[')) { // Avoid sending error placeholders
            messageEntry.transcribedAudio = msg.content.transcribedAudio;
          } else if (msg.content.audioUrl) {
            // Indicate audio presence if transcription failed, disabled, or not available
            messageEntry.hasAudio = true;
            // Optionally include the error/status message if available and starts with '['
            if (typeof msg.content.transcribedAudio === 'string' && msg.content.transcribedAudio.startsWith('[')) {
              messageEntry.audioStatus = msg.content.transcribedAudio;
            }
          }
          // Add image URLs if present
          if (msg.content.imageUrls && Array.isArray(msg.content.imageUrls) && msg.content.imageUrls.length > 0) {
            messageEntry.imageUrls = msg.content.imageUrls;
          }
          return messageEntry;
        }),
        analysis: analysis || null
      })
    }];

    // Note: Assistants API v2 currently doesn't directly support image URLs within the
    // message content array like the Chat Completions API vision models do.
    // We are including image URLs within the JSON text context for the assistant to reference.
    // If direct image analysis is needed later, the approach might need adjustment
    // (e.g., using Chat Completions with vision or waiting for Assistants API updates).

    logger.debug('[OpenAIManager] Prepared message content for API:', { textLength: content[0].text.length });
    // Log the actual content being sent (or a snippet) for debugging
    // logger.debug('[OpenAIManager] Content Snippet:', content[0].text.substring(0, 500) + (content[0].text.length > 500 ? '...' : ''));


    return content; // Return array with single text object containing JSON
  }


  /**
   * Run an assistant on a thread and get the response
   * @param {string} threadId - Thread ID
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<string>} Response text
   */
  async runAssistant(threadId, assistantId) {
    try {
      // Start a run
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        },
        body: JSON.stringify({
          assistant_id: assistantId
        })
      });

      if (!runResponse.ok) {
        const error = await runResponse.json();
        throw new Error(error.error?.message || 'Failed to start run');
      }

      const run = await runResponse.json();
      logger.debug(`Started run ${run.id} on thread ${threadId}`);

      // Poll for completion with exponential backoff
      const result = await this.pollRunUntilComplete(threadId, run.id);

      // Get the assistant's message
      const response = await this.getAssistantResponseFromRun(threadId, run.id);
      return response;
    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`);
      throw error;
    }
  }

  /**
   * Poll a run until it's completed or failed
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @returns {Promise<Object>} Final run status
   */
  async pollRunUntilComplete(threadId, runId) {
    const maxAttempts = 60; // Maximum attempts to avoid infinite polling
    const timeout = 30000; // 30 second timeout
    let attempts = 0;
    let status = null;
    let delay = 1000; // Start with 1s delay

    const startTime = Date.now();

    while (attempts < maxAttempts && (Date.now() - startTime < timeout)) {
      attempts++;

      // Check the run status
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to check run status');
      }

      status = await response.json();

      // If completed or failed, break the loop
      if (['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
        break;
      }

      // If still running, wait with exponential backoff
      logger.debug(`Run ${runId} status: ${status.status}, attempt ${attempts}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 5000); // Increase delay up to 5s max
    }

    if (status.status !== 'completed') {
      throw new Error(`Run failed with status: ${status.status}`);
    }

    return status;
  }

  /**
   * Get the assistant's response from a completed run
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @returns {Promise<string>} Response text
   */
  async getAssistantResponseFromRun(threadId, runId) {
    try {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to retrieve messages');
      }

      const messages = await response.json();

      // Find the first assistant message (should be the newest one)
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

      if (!assistantMessage) {
        throw new Error('No assistant message found');
      }

      // Extract the text content
      if (assistantMessage.content && assistantMessage.content.length > 0) {
        const textContent = assistantMessage.content.find(content => content.type === 'text');
        if (textContent) {
          return textContent.text.value;
        }
      }

      throw new Error('No text content found in assistant message');
    } catch (error) {
      logger.error(`Error retrieving assistant response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set the assistant ID for a specific role
   * @param {string} role - Role ('seller' or 'buyer')
   * @param {string} assistantId - Assistant ID
   */
  setAssistantForRole(role, assistantId) {
    if (!['seller', 'buyer', 'default'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    this.assistants[role] = assistantId;

    // Use storageUtils for greater persistence
    storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);

    logger.log(`Set assistant ${assistantId} for role ${role}`);
  }

  /**
   * Create or update a wizard with name and instructions.
   * @param {'seller'|'buyer'} role
   * @param {string} name
   * @param {string} instructions
   * @returns {Promise<string>} assistantId
   */
  async createOrUpdateAssistant(role, name, instructions) {
    if (!this.isInitialized) throw new Error('API key not initialized');
    let assistantId = this.assistants[role];
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'  // Updated to v2
    };
    // Upgrade existing
    if (assistantId) {
      const res = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, instructions })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to update assistant');
      }
    } else {
      // Create new
      const res = await fetch('https://api.openai.com/v1/assistants', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, instructions })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create assistant');
      }
      const data = await res.json();
      assistantId = data.id;
    }
    this.assistants[role] = assistantId;
    return assistantId;
  }

  /**
   * Get all available assistants from OpenAI
   * @returns {Promise<Array>} List of assistants
   */
  async listAssistants() {
    try {
      const response = await fetch('https://api.openai.com/v1/assistants?limit=100', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to list assistants');
      }

      const assistants = await response.json();
      return assistants.data;
    } catch (error) {
      logger.error(`Error listing assistants: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up old threads to prevent memory leaks
   */
  cleanupOldThreads() {
    const now = Date.now();
    let count = 0;

    for (const [chatId, threadData] of this.activeThreads.entries()) {
      if (now - threadData.lastUsed > this.threadTTL) {
        this.activeThreads.delete(chatId);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Cleaned up ${count} expired threads`);
    }
  }

  /**
   * Get metrics about API usage
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeThreads: this.activeThreads.size
    };
  }
}

// expose
const openAIManager = new OpenAIManager();
window.openaiManager = openAIManager;
// Ensure that openaiManager is globally accessible
console.log('[OpenAI Manager] Instance exposed globally as window.openaiManager');

// Add a checker that will run after the DOM is loaded AND when the script is executed
(function ensureGlobalOpenAIManager() {
  // Run immediately
  if (!window.openaiManager || !window.openaiManager.isReady) {
    console.warn('[OpenAI Manager] OpenAI Manager not available or missing necessary methods, reinstalling...');
    window.openaiManager = openAIManager;
    
    // Verify that critical methods exist
    if (typeof window.openaiManager.initialize !== 'function') {
      console.error('[OpenAI Manager] CRITICAL ERROR! The initialize method is not available after reinstalling');
      // Add the method if missing
      window.openaiManager.initialize = function(apiKey = null) {
        return openAIManager.initialize(apiKey);
      };
    }
    
    if (typeof window.openaiManager.isReady !== 'function') {
      window.openaiManager.isReady = function() {
        return !!window.openaiManager.apiKey;
      };
    }
    
    if (typeof window.openaiManager.verifyServiceState !== 'function') {
      window.openaiManager.verifyServiceState = function() {
        return openAIManager.verifyServiceState();
      };
    }
  }

  // Verify that the API key is correctly assigned
  if (CONFIG?.AI?.apiKey && !window.openaiManager.apiKey) {
    window.openaiManager.apiKey = CONFIG.AI.apiKey;
    window.openaiManager.isInitialized = true;
  }
  
  console.log('[OpenAI Manager] Status after global verification:', 
              `apiKey=${!!window.openaiManager.apiKey}`,
              `isInitialized=${window.openaiManager.isInitialized}`,
              `isReady=${typeof window.openaiManager.isReady === 'function' ? window.openaiManager.isReady() : 'method not available'}`);
})();

// Also attach to the DOMContentLoaded event for added security
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    if (!window.openaiManager) {
      console.error('[OpenAI Manager] Error: openaiManager not detected in window after DOMContentLoaded. Reinstalling...');
      window.openaiManager = openAIManager;
    }
    
    // Also verify the assistants if we have a valid API key
    if (window.openaiManager.isReady() && typeof window.openaiManager.listAssistants === 'function') {
      console.log('[OpenAI Manager] Starting automatic loading of assistants...');
      window.openaiManager.listAssistants()
        .then(assistants => {
          console.log(`[OpenAI Manager] ${assistants.length} assistants found automatically`);
          // If there is a UI handler for assistants, update the interface
          if (window.updateAssistantsList) {
            window.updateAssistantsList(assistants);
          }
        })
        .catch(err => {
          console.warn('[OpenAI Manager] Error loading assistants automatically:', err.message);
        });
    }
  }, 1000);
});