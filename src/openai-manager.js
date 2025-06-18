// ----- OPENAI INTEGRATION -----

/**
 * OpenAI Manager - Handles OpenAI API integration with assistant selection based on role
 * Version 2.0: Refactorized to use modular components
 */
class OpenAIManager {
  constructor() {
    // Use storageUtils as the primary data source
    this.apiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '') || '';
    this.model = "gpt-4o"; // Fixed to gpt-4o
    this.isInitialized = false;
    
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
    
    // Initialize module components (will be set in initialize())
    this.apiClient = null;
    this.threadManager = null;
    this.threadMessageHandler = null; // New reference to the message handler by thread type
    this.timestampUtils = null; // New reference to timestamp utilities
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
      this.model = "gpt-4o";
      CONFIG.AI.model = "gpt-4o";

      if (this.apiKey) {
        // Initialize module components with the API key
        this.apiClient = new window.OpenAIApiClient(this.apiKey);
        this.threadManager = new window.ThreadManager(this.apiClient);
        
        // Initialize references to new components
        if (window.ThreadMessageHandler) {
          this.threadMessageHandler = window.ThreadMessageHandler;
          logger.debug('ThreadMessageHandler utility detected and connected');
        }
        
        if (window.TimestampUtils) {
          this.timestampUtils = window.TimestampUtils;
          logger.debug('TimestampUtils utility detected and connected');
        }
        
        // Verify if MessageChunker is available and use its shared instance if needed
        if (window.MessageChunker) {
          this.messageChunker = window.MessageChunker;
          logger.debug('MessageChunker utility detected and connected');
        }

        logger.debug('OpenAI components initialized successfully');
        this.isInitialized = true;
      } else {
        this.isInitialized = false;
        logger.debug('initialize(): No API key, setting isInitialized=false');
      }
      
      logger.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);

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
    
    if (valid) {
      // Re-initialize components with new API key
      this.apiClient = new window.OpenAIApiClient(this.apiKey);
      this.threadManager = new window.ThreadManager(this.apiClient);
    }
    
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
    
    // Verify components are initialized
    if (this.isInitialized && this.apiKey) {
      if (!this.apiClient) {
        logger.debug('API client not initialized, creating instance');
        this.apiClient = new window.OpenAIApiClient(this.apiKey);
      }
      
      if (!this.threadManager) {
        logger.debug('Thread manager not initialized, creating instance');
        this.threadManager = new window.ThreadManager(this.apiClient);
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
      // Ensure components are initialized
      if (!this.apiClient) {
        this.apiClient = new window.OpenAIApiClient(this.apiKey);
      }
      if (!this.threadManager) {
        this.threadManager = new window.ThreadManager(this.apiClient);
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
      // Use API client if available
      if (this.apiClient) {
        return await this.apiClient.validateApiKey();
      }
      
      // Fallback to direct validation
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
   * Prepare the message content with context for the AI
   * @param {Object} context
   * @returns {Promise<Array>} Message content array
   */
  async prepareMessageContent(context) {
    // Delegate to MessageUtils
    return window.MessageUtils.prepareMessageContent(context);
  }

  /**
   * Prepares messages according to the thread type (new or existing)
   * @param {Object} context - Chat context
   * @param {Object} threadInfo - Thread information
   * @returns {Promise<Array>} Prepared messages
   */
  async prepareMessagesByThreadType(context, threadInfo) {
    try {
      // Verify if we have the specialized handler
      if (this.threadMessageHandler) {
        return await this.threadMessageHandler.prepareMessagesBasedOnThreadType(context, threadInfo);
      }
      
      // If the specialized handler is not available, use the standard method
      return await this.prepareMessageContent(context);
    } catch (error) {
      logger.error(`Error preparing messages by thread type: ${error.message}`);
      // In case of error, use the standard method
      return await this.prepareMessageContent(context);
    }
  }

  /**
   * Generate a response using OpenAI API
   * @param {Object} context - Context data including role, messages, and product details
   * @returns {Promise<Object>} Generated structured response object or an error object
   */
  async generateResponse(context) {
    try {
      if (!this.isReady()) throw new Error('OpenAI API not ready');

      const role = context?.role || 'buyer';
      logger.log(`Generating response as ${role} using OpenAI Assistants API`);

      if (!this.apiClient || !this.threadManager) {
        const success = await this.initialize();
        if (!success) throw new Error('Could not initialize OpenAI API');
      }

      // NEW: Apply deep filtering of problematic images throughout the context
      if (window.ImageFilterUtils) {
        logger.debug('Applying deep image filtering to the context before sending');
        
        // 1. Filtering images in product details
        if (context.productDetails) {
          context.productDetails = window.ImageFilterUtils.preprocessProductDetails(context.productDetails);
          logger.debug('Product details filtered');
        }
        
        // 2. Deep filtering of images in messages
        if (Array.isArray(context.messages)) {
          // Filter image URLs in each message
          context.messages = context.messages.map(msg => {
            // If the message has content.media.images, filter them
            if (msg.content && msg.content.media && Array.isArray(msg.content.media.images)) {
              // Filter only valid (non-problematic) images
              msg.content.media.images = msg.content.media.images.filter(img => {
                if (!img || !img.url) return false;
                const isValid = !window.ImageFilterUtils.isProblematicFacebookImage(img.url);
                if (!isValid) {
                  logger.debug(`Filtered problematic image URL in message: ${img.url}`);
                }
                return isValid;
              });
            }
            
            // For compatibility: also filter imageUrls if they exist
            if (msg.content && Array.isArray(msg.content.imageUrls)) {
              msg.content.imageUrls = window.ImageFilterUtils.filterImageUrls(msg.content.imageUrls);
            }
            
            return msg;
          });
          
          logger.debug(`${context.messages.length} messages processed with image filtering`);
        }
        
        // 3. Recursive filtering to catch URLs in nested or unknown properties
        context = window.ImageFilterUtils.deepFilterImages(context, (url, filtered) => {
          if (filtered) {
            logger.debug(`Filtered problematic URL in deep filtering: ${url}`);
          }
        });
        
        logger.debug('Deep image filtering completed');
      } else {
        logger.warn('ImageFilterUtils not available. Deep image filtering will not be applied.');
      }

      // Verify that the thread manager has the necessary method
      if (!this.threadManager || typeof this.threadManager.processChat !== 'function') {
        // Attempt to solve the problem using getOrCreateThread as an alternative
        if (this.threadManager && typeof this.threadManager.getOrCreateThread === 'function') {
          logger.warn('ThreadManager missing processChat method, adding alias for getOrCreateThread');
          this.threadManager.processChat = this.threadManager.getOrCreateThread;
        } else {
          throw new Error('ThreadManager missing required methods');
        }
      }

      // Thread and message sending
      const assistantId = this.getAssistantIdForRole(role);
      const chatId = context.chatId || 'default_chat';
      
      // Get thread with information about whether it's new or existing
      const threadResult = await this.threadManager.processChat(chatId);
      const threadId = threadResult.threadId || threadResult.id;
      
      // Add thread info to context so the message handler can use it
      context.threadInfo = threadResult;
      logger.debug(`Thread info: isNew=${threadResult.isNew}, has lastPosition: ${!!threadResult.lastPosition}`);
      
      // Use the new method of preparing messages by thread type if available
      if (this.threadMessageHandler && context.threadInfo) {
        context.preparedMessages = await this.prepareMessagesByThreadType(context, context.threadInfo);
        logger.debug('Messages prepared using thread type optimization');
      }
      
      // NEW: Apply final filtering to prepared messages just before sending them
      if (window.ImageFilterUtils && context.preparedMessages) {
        context.preparedMessages = window.ImageFilterUtils.filterImagesInOpenAIMessages(context.preparedMessages);
        logger.debug('Applied final filtering to prepared messages');
      }
      
      // Send the messages to the thread
      await this.threadManager.addMessageToThread(threadId, context);
      
      // After successful processing, update the last processed message if we have one
      if (context.messages && context.messages.length > 0) {
        const lastMsg = context.messages[context.messages.length - 1];
        this.threadManager.updateLastProcessedMessage(chatId, lastMsg);
      }
      
      // Run the assistant and return the response
      return await this.threadManager.runAssistant(threadId, assistantId);
    } catch (error) {
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
   * Set the assistant ID for a specific role
   * @param {string} role - 'seller' or 'buyer'
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
    const modelToUse = this.model || "gpt-4o"; 

    try {
        // Use the API client for this operation
        if (!this.apiClient) {
            this.apiClient = new window.OpenAIApiClient(this.apiKey);
        }

        const assistantBody = {
            name,
            instructions,
            model: modelToUse
        };

        // Create or update the assistant
        let data;
        if (assistantId) {
            logger.debug(`Updating assistant ${assistantId} for role ${role} with model ${modelToUse}.`);
            data = await this.apiClient.createOrUpdateAssistant(assistantId, assistantBody);
        } else {
            logger.debug(`Creating new assistant for role ${role} with model ${modelToUse}.`);
            data = await this.apiClient.createOrUpdateAssistant(null, assistantBody);
        }

        assistantId = data.id;
        this.assistants[role] = assistantId;
        storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);
        
        logger.log(`Assistant ${assistantId} ${assistantId === data.id ? 'updated' : 'created'} successfully for role ${role}.`);
        return assistantId;
    } catch (error) {
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
      if (!this.apiClient) {
        this.apiClient = new window.OpenAIApiClient(this.apiKey);
      }
      const assistantsList = await this.apiClient.listAssistants();
      return assistantsList.data || [];
    } catch (error) {
      logger.error(`Error listing assistants: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get metrics about API usage
   * @returns {Object} Metrics
   */
  getMetrics() {
    const threadCount = this.threadManager ? 
                        this.threadManager.activeThreads.size : 0;
    
    // Log active threads if available
    if (this.threadManager) {
      this.threadManager.logActiveThreads();
    }
    
    return {
      ...this.metrics,
      activeThreads: threadCount,
      averageResponseTime: this.metrics.successfulCalls ? 
                          (this.metrics.totalResponseTime / this.metrics.successfulCalls) : 0
    };
  }

  /**
   * Send a conversation to a thread directly, handling chunking automatically
   * @param {Array} messages - Messages to send
   * @param {string} threadId - Thread ID
   * @returns {Promise<boolean>} True if successful
   */
  async sendConversation(messages, threadId) {
    try {
      if (!this.isReady()) {
        throw new Error('OpenAI API not initialized');
      }
      
      // Check if there are any large messages requiring chunking
      const needsChunking = messages.some(msg => 
        Array.isArray(msg.content) && msg.content.length > 10);
      
      if (needsChunking) {
        // Use the thread manager's implementation
        if (this.threadManager) {
          return await this.threadManager.sendConversationInChunks(messages, threadId);
        }
        // Fallback to direct MessageChunker
        else if (window.MessageChunker) {
          return await window.MessageChunker.sendConversationInChunks(
            messages, threadId, this.apiClient || this.apiKey
          );
        }
        // Last resort: use global function
        else if (typeof window.sendConversationInChunks === 'function') {
          return await window.sendConversationInChunks(messages, threadId, this.apiKey);
        }
        throw new Error('No chunking mechanism available');
      }
      
      // For normal messages, use the standard method via API client
      for (const message of messages) {
        if (message.role === 'system') continue; // Skip system messages
        await this.apiClient.addMessage(threadId, message);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error sending conversation: ${error.message}`);
      throw error;
    }
  }
}

// expose
const openAIManager = new OpenAIManager();
window.openaiManager = openAIManager;
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