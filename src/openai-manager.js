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
   * @returns {Promise<Object>} Generated structured response object or an error object
   */
  async generateResponse(context) {
    // If we are not ready, initialize first
    if (!this.isReady()) {
      this.verifyServiceState();
      
      // If we are still not ready after attempting to recover
      if (!this.isReady()) {
        logger.warn('OpenAI Manager is not ready to generate responses');
        return {
          // Consistent structured error
          responseText: "I'm sorry, I can't generate a response because I don't have access to the OpenAI API. Please verify your API key in the configuration.",
          buyerIntent: "error",
          suggestedAction: "check_config",
          sentiment: "error",
          isSafeResponse: false,
          refusalReason: "OpenAI Manager not ready.",
          error: true 
        };
      }
    }
    
    const startTime = Date.now();
    this.metrics.totalCalls++;

    try {
      // Clear the input field before generating the response
      // this.clearInputField(); // This might be better handled by ChatManager after receiving the response

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

      // Run the assistant on the thread, requesting JSON output
      // The actual schema adherence will depend on the assistant's instructions
      const structuredResponse = await this.runAssistant(thread.id, assistantId);

      // Update metrics
      this.metrics.successfulCalls++;
      const responseTime = Date.now() - startTime;
      this.metrics.totalResponseTime += responseTime;
      this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.successfulCalls;

      logger.debug(`Structured response generated in ${responseTime}ms`);

      return structuredResponse; // This is now an object
    } catch (error) {
      this.metrics.failedCalls++;
      logger.error(`Error generating structured response: ${error.message}`);
      // Return a structured error
      return {
        responseText: `Error generating response: ${error.message}`,
        buyerIntent: "error",
        suggestedAction: "retry_or_check_logs",
        sentiment: "error",
        isSafeResponse: false,
        refusalReason: `Internal error: ${error.message}`,
        error: true
      };
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

    // Construct the main payload object
    const jsonPayload = {
      role: role, // This is the role the AI should assume (e.g., "seller", "buyer")
      product: productDetails ? {
        id: productDetails.id,
        title: productDetails.title,
        price: productDetails.price,
        description: productDetails.description,
        condition: productDetails.condition,
        location: productDetails.location,
        category: productDetails.category,
        imageUrls: productDetails.imageUrls || []
      } : null,
      // Take last N messages for context (use config or default)
      conversation: messages.slice(-(CONFIG.AI.messageHistoryLimit || 100)).map(msg => {
        // Ensure msg and msg.content exist
        if (!msg || !msg.content) {
          // Fallback for invalid structure, less likely if extractChatHistory is robust
          return { role: msg?.sentByUs ? "assistant" : "user", content: "[Invalid message structure]", error: "Invalid message structure" };
        }

        const messageEntry = {
          // Key change: Use "user" for messages from the other person, "assistant" for messages from our user.
          role: msg.sentByUs ? "assistant" : "user", 
          // Construct a content string that can include text and references to media.
          // The assistant will be instructed that this 'content' field for conversation messages is a string.
          // For a more structured approach for media within conversation history (if Assistants API evolves):
          // content: [{type: "text", text: msg.content.text}, {type: "image_url", image_url: {url: "..."}}]
          // For now, we'll embed media info into a text string or keep it as separate properties if preferred by assistant instructions.
        };
        
        let messageContentString = "";

        if (msg.content.text) {
          messageContentString += msg.content.text;
          messageEntry.text = msg.content.text; // Keep separate text field for easier access
        }

        if (msg.content.transcribedAudio && typeof msg.content.transcribedAudio === 'string' && !msg.content.transcribedAudio.startsWith('[')) {
          messageContentString += (messageContentString ? " " : "") + `[Transcribed Audio: ${msg.content.transcribedAudio}]`;
          messageEntry.transcribedAudio = msg.content.transcribedAudio;
        } else if (msg.content.audioUrl) {
          messageContentString += (messageContentString ? " " : "") + "[Audio message present]";
          messageEntry.hasAudio = true;
          if (typeof msg.content.transcribedAudio === 'string' && msg.content.transcribedAudio.startsWith('[')) {
            messageEntry.audioStatus = msg.content.transcribedAudio;
          }
        }

        if (msg.content.imageUrls && Array.isArray(msg.content.imageUrls) && msg.content.imageUrls.length > 0) {
          messageContentString += (messageContentString ? " " : "") + `[${msg.content.imageUrls.length} image(s) sent]`;
          messageEntry.imageUrls = msg.content.imageUrls; // Keep for assistant to reference
        }
        
        // Add other media types from msg.content.media if they exist
        if (msg.content.media) {
            if (msg.content.media.video) {
                messageContentString += (messageContentString ? " " : "") + "[Video present]";
                messageEntry.video = msg.content.media.video;
            }
            if (msg.content.media.files && msg.content.media.files.length > 0) {
                messageContentString += (messageContentString ? " " : "") + `[${msg.content.media.files.length} file(s) present]`;
                messageEntry.files = msg.content.media.files;
            }
            if (msg.content.media.location) {
                messageContentString += (messageContentString ? " " : "") + "[Location shared]";
                messageEntry.location = msg.content.media.location;
            }
            if (msg.content.media.gif) {
                messageContentString += (messageContentString ? " " : "") + "[GIF/Sticker present]";
                messageEntry.gif = msg.content.media.gif;
            }
        }


        // The 'content' field for the OpenAI message object should be a string or an array of content blocks.
        // We are creating a single text block that summarizes the message.
        // The detailed structured parts (like imageUrls, transcribedAudio) are also included
        // at the same level as 'role' for the assistant to potentially use if its instructions guide it.
        // However, the primary 'content' for the API call for each message in the history will be this string.
        // This might need adjustment based on how well the assistant model parses this structure.
        // A simpler approach for the assistant might be to just pass `messageEntry.text` or `messageContentString`
        // as the content, and rely on the assistant to understand the other fields.
        // For now, let's provide both a summary string and the discrete fields.
        // The OpenAI API expects `content` for each message in the history.
        // We will use the `messageContentString` for that.
        messageEntry.content = messageContentString || "[Media message without text]";


        // Add timestamp if available
        if (msg.timestamp) {
          messageEntry.timestamp = msg.timestamp;
        }
        
        return messageEntry;
      }),
      analysis: analysis || null
    };

    // Log the complete JSON payload object before stringifying
    logger.debug('[OpenAIManager] JSON Payload to be sent to Assistant:', jsonPayload);

    // Start with a text part containing the JSON context
    const content = [{
      type: 'text',
      text: JSON.stringify(jsonPayload) // The entire jsonPayload is stringified and sent as the text of the *current* user message to the thread.
                                        // The 'conversation' array within this JSON is the history.
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
   * @returns {Promise<Object>} Parsed JSON structured response object
   */
  async runAssistant(threadId, assistantId) {
    try {
      // Start a run
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          assistant_id: assistantId,
          response_format: { type: "json_object" } // Request JSON output
        })
      });

      if (!runResponse.ok) {
        const errorData = await runResponse.json().catch(() => ({ error: { message: runResponse.statusText } }));
        throw new Error(`Failed to start run: ${errorData.error?.message || runResponse.statusText}`);
      }

      const run = await runResponse.json();
      logger.debug(`Started run ${run.id} on thread ${threadId} with response_format: json_object`);

      // Poll for completion
      // Ensure 'this' context is correct if pollRunUntilComplete is not an arrow function or bound
      await this.pollRunUntilComplete(threadId, run.id);

      // Get the assistant's message (which should be a JSON string)
      const jsonStringResponse = await this.getAssistantResponseFromRun(threadId, run.id);
      
      // Parse the JSON string
      try {
        const parsedResponse = JSON.parse(jsonStringResponse);
        // Basic validation of the expected structure (can be expanded)
        if (typeof parsedResponse.responseText !== 'string') {
            logger.warn('Parsed response is missing "responseText" or it is not a string. This may indicate the assistant instructions need adjustment to enforce the JSON schema.', { parsedResponse });
            // Fallback or throw more specific error
            return {
                responseText: jsonStringResponse, // return raw string if parsing gives unexpected structure
                buyerIntent: "parse_error",
                suggestedAction: "review_assistant_instructions",
                sentiment: "unknown",
                isSafeResponse: true, 
                refusalReason: "Response structure mismatch after parsing. Ensure assistant instructions enforce the desired JSON schema.",
                parsingError: true,
                rawResponse: jsonStringResponse // Include raw response for debugging
            };
        }
        logger.debug("Successfully parsed assistant's JSON response.");
        return parsedResponse;
      } catch (parseError) {
        logger.error(`Error parsing assistant's JSON response: ${parseError.message}`, { jsonStringResponse });
        throw new Error(`Failed to parse assistant's JSON response: ${parseError.message}. Raw response: ${jsonStringResponse.substring(0,200)}...`);
      }

    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`);
      throw error; 
    }
  }

  /**
   * Polls a run until it's completed, failed, or cancelled.
   * @param {string} threadId - The ID of the thread.
   * @param {string} runId - The ID of the run.
   * @returns {Promise<void>} Resolves when the run is in a terminal state.
   * @throws {Error} If the run fails or is cancelled, or if polling times out.
   */
  async pollRunUntilComplete(threadId, runId) {
    const pollInterval = 1000; // Poll every 1 second
    const maxAttempts = 60; // Max 60 attempts (e.g., 60 seconds)
    let attempts = 0;

    logger.debug(`[pollRunUntilComplete] Starting polling for run ${runId} on thread ${threadId}`);

    return new Promise(async (resolve, reject) => {
      const checkStatus = async () => {
        try {
          attempts++;
          if (attempts > maxAttempts) {
            logger.error(`[pollRunUntilComplete] Polling timed out for run ${runId} after ${maxAttempts} attempts.`);
            reject(new Error(`Polling timed out for run ${runId}`));
            return;
          }

          const runStatusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            }
          });

          if (!runStatusResponse.ok) {
            const errorData = await runStatusResponse.json().catch(() => ({ error: { message: runStatusResponse.statusText } }));
            logger.error(`[pollRunUntilComplete] Error fetching run status for ${runId}: ${errorData.error?.message || runStatusResponse.statusText}`);
            // Depending on the error, you might want to retry or reject immediately.
            // For now, let's retry a few times for transient network issues.
            if (attempts < 5 && (runStatusResponse.status === 500 || runStatusResponse.status === 503)) {
                logger.warn(`[pollRunUntilComplete] Retrying due to server error (status ${runStatusResponse.status}). Attempt ${attempts}/5.`);
                setTimeout(checkStatus, pollInterval * attempts); // Exponential backoff might be better
                return;
            }
            reject(new Error(`Failed to fetch run status: ${errorData.error?.message || runStatusResponse.statusText}`));
            return;
          }

          const runStatus = await runStatusResponse.json();
          logger.debug(`[pollRunUntilComplete] Run ${runId} status: ${runStatus.status} (Attempt: ${attempts})`);

          switch (runStatus.status) {
            case 'queued':
            case 'in_progress':
            case 'requires_action': // If you implement function calling, you'd handle this. For now, we wait.
              setTimeout(checkStatus, pollInterval);
              break;
            case 'completed':
              logger.log(`[pollRunUntilComplete] Run ${runId} completed successfully.`);
              resolve();
              break;
            case 'failed':
              logger.error(`[pollRunUntilComplete] Run ${runId} failed. Reason: ${runStatus.last_error?.message || 'Unknown error'}`);
              reject(new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`));
              break;
            case 'cancelled':
              logger.warn(`[pollRunUntilComplete] Run ${runId} was cancelled.`);
              reject(new Error('Run was cancelled'));
              break;
            case 'expired':
              logger.error(`[pollRunUntilComplete] Run ${runId} expired.`);
              reject(new Error('Run expired'));
              break;
            default:
              logger.error(`[pollRunUntilComplete] Unknown run status for ${runId}: ${runStatus.status}`);
              reject(new Error(`Unknown run status: ${runStatus.status}`));
          }
        } catch (error) {
          logger.error(`[pollRunUntilComplete] Error during polling for run ${runId}: ${error.message}`);
          // Retry for a few attempts in case of network errors
          if (attempts < 5) {
            logger.warn(`[pollRunUntilComplete] Retrying due to polling error. Attempt ${attempts}/5.`);
            setTimeout(checkStatus, pollInterval * attempts);
            return;
          }
          reject(error);
        }
      };

      checkStatus(); // Start the polling
    });
  }

  /**
   * Get the assistant's response from a completed run
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID (Note: runId is not strictly needed if fetching latest messages)
   * @returns {Promise<string>} Raw JSON string response text from the assistant
   */
  async getAssistantResponseFromRun(threadId, runId) { // runId kept for context, though messages are fetched for thread
    try {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1&order=desc`, { // Fetch latest message
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Failed to retrieve messages: ${errorData.error?.message || response.statusText}`);
      }

      const messagesResponse = await response.json();

      const assistantMessage = messagesResponse.data && messagesResponse.data.length > 0 ? messagesResponse.data[0] : null;

      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        logger.error('No assistant message found as the latest message, or latest message not from assistant.', { messagesData: messagesResponse.data });
        throw new Error('No assistant message found as the latest message in the thread.');
      }

      if (assistantMessage.content && assistantMessage.content.length > 0) {
        const textContentItem = assistantMessage.content.find(contentItem => contentItem.type === 'text');
        if (textContentItem && textContentItem.text && typeof textContentItem.text.value === 'string') {
          logger.debug("Retrieved assistant's message content (expected to be JSON string).");
          return textContentItem.text.value;
        }
      }

      logger.error('No text content found in assistant message or content is not in expected format.', { assistantMessage });
      throw new Error('No text content found in assistant message or content is not in expected format.');
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
   * The instructions should guide the assistant to output JSON matching the desired schema.
   * @param {'seller'|'buyer'|'default'} role
   * @param {string} name
   * @param {string} instructions - These instructions MUST guide the assistant to produce JSON.
   * @returns {Promise<string>} assistantId
   */
  async createOrUpdateAssistant(role, name, instructions) {
    if (!this.isInitialized && !this.apiKey) {
        logger.error('API key not initialized. Cannot create or update assistant.');
        throw new Error('API key not initialized');
    }
    let assistantId = this.assistants[role];
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    const modelToUse = this.model || "gpt-4o-mini"; 

    const assistantBody = {
        name,
        instructions, // Crucial: these instructions must tell the assistant to output JSON according to your schema
        model: modelToUse,
        // response_format: { type: "json_object" } // Can be set here too, but setting per-run gives more flexibility
    };

    let requestUrl;
    let method;

    if (assistantId) {
      requestUrl = `https://api.openai.com/v1/assistants/${assistantId}`;
      method = 'POST'; // OpenAI API uses POST for updates to assistants.
      logger.debug(`Updating assistant ${assistantId} for role ${role} with model ${modelToUse}.`);
    } else {
      requestUrl = 'https://api.openai.com/v1/assistants';
      method = 'POST';
      logger.debug(`Creating new assistant for role ${role} with model ${modelToUse}.`);
    }

    try {
        const res = await fetch(requestUrl, {
            method: method,
            headers,
            body: JSON.stringify(assistantBody)
        });

        if (!res.ok) {
            const errText = await res.text();
            logger.error(`Failed to ${assistantId ? 'update' : 'create'} assistant for role ${role}: ${res.status} ${res.statusText}`, { errorBody: errText });
            const errJson = JSON.parse(errText); // Attempt to parse error
            throw new Error(errJson.error?.message || `Failed to ${assistantId ? 'update' : 'create'} assistant: ${res.status}`);
        }

        const data = await res.json();
        assistantId = data.id; // Update assistantId if it was a creation
        this.assistants[role] = assistantId;
        storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);
        logger.log(`Assistant ${assistantId} ${assistantId && method === 'POST' && requestUrl.includes(assistantId) ? 'updated' : 'created'} successfully for role ${role}.`);
        return assistantId;

    } catch (error) {
        // If error is already an Error object with a message, rethrow it. Otherwise, create a new one.
        if (error.message) {
            throw error;
        } else {
            throw new Error(`Unexpected error during assistant ${assistantId ? 'update' : 'creation'}: ${String(error)}`);
        }
    }
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