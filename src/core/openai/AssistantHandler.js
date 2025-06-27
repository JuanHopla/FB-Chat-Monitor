/**
 * Assistant Handler - "The Operator"
 * 
 * Responsibilities:
 * - Receive a threadId and messages prepared by MessagePreprocessor
 * - Use ApiClient to add messages to the thread
 * - Create runs in the thread
 * - Wait for the run to complete
 * - Get and return the final response
 */

class AssistantHandler {
  constructor() {
    // Configuration
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
    this.maxWaitTime = 60000; // 1 minute
    this.initialized = false;
  }

  /**
   * Initializes the assistant handler
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Check required dependencies
      if (!window.apiClient || !window.threadStore || !window.messagePreprocessor) {
        logger.error('Missing required dependencies for AssistantHandler');
        return false;
      }
      
      // Initialize ThreadStore if not already done
      if (window.threadStore && typeof window.threadStore.initialize === 'function' && 
          !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }
      
      this.initialized = true;
      console.log('AssistantHandler initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AssistantHandler', {}, error);
      return false;
    }
  }

  /**
   * Generates a response based on the chat context
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} productData - Product information
   * @returns {Promise<string>} Generated response
   */
  async generateResponse(fbThreadId, allMessages, chatRole, productData) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!fbThreadId || !allMessages || !Array.isArray(allMessages)) {
      throw new Error('Invalid parameters for generateResponse');
    }

    // Validate and set default chatRole if needed
    if (chatRole !== 'seller' && chatRole !== 'buyer') {
      logger.warn(`Invalid chat role: ${chatRole}, defaulting to seller`);
      chatRole = 'seller';
    }

    console.log(`Generating response for thread ${fbThreadId} as ${chatRole}`);
    console.log(`[AssistantHandler] Step 4.1: Generating response for thread ${fbThreadId} as ${chatRole}`);

    try {
      // Step 1: Get or create thread info
      let threadInfo = window.threadStore.getThreadInfo(fbThreadId);
      let isNewThread = false;

      if (!threadInfo) {
        console.log('No existing thread found, creating new one');
        threadInfo = await this.createNewThread(fbThreadId, chatRole);
        isNewThread = true;
      }

      // Step 2: Get the assistant ID for the role
      const assistantId = this.getAssistantIdForRole(chatRole);
      if (!assistantId) {
        throw new Error(`No assistant ID configured for role: ${chatRole}`);
      }

      // Step 3: Prepare messages based on whether it's a new thread or not
      let openAIMessages;
      if (isNewThread) {
        // For new threads, add product info and only most recent messages
        console.log('Preparing messages for new thread with product info');
        console.log('[AssistantHandler] Step 4.2: Preparing messages for new thread...');
        console.log('[AssistantHandler][DEBUG] Original messages:', allMessages);

        const messagesWithProduct = window.messagePreprocessor.attachProductInfo(allMessages, productData);
        console.log('[AssistantHandler] [DEBUG] After attachProductInfo (product added if applicable):', messagesWithProduct);

        let messagesWithTranscriptions = messagesWithProduct;
        if (window.messagePreprocessor.attachTranscriptions.constructor.name === 'AsyncFunction') {
          messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(messagesWithProduct);
        } else {
          messagesWithTranscriptions = window.messagePreprocessor.attachTranscriptions(messagesWithProduct);
        }
        console.log('[AssistantHandler] [DEBUG] After attachTranscriptions (audios transcribed if applicable):', messagesWithTranscriptions);

        // Role instructions are no longer injected here

        openAIMessages = window.messagePreprocessor.formatMessagesForOpenAI(
          messagesWithTranscriptions.slice(-50)
        );
        console.log('[AssistantHandler] [DEBUG] After formatMessagesForOpenAI (final payload for OpenAI):', openAIMessages);
      } else {
        // For existing threads, only add new messages since last processed
        console.log(`Getting new messages since ${threadInfo.lastMessageId}`);
        console.log('[AssistantHandler] Step 4.2: Preparing messages for existing thread...');

        let messagesWithTranscriptions = allMessages;
        if (window.messagePreprocessor.attachTranscriptions.constructor.name === 'AsyncFunction') {
          messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(allMessages);
        } else {
          messagesWithTranscriptions = window.messagePreprocessor.attachTranscriptions(allMessages);
        }
        console.log('[AssistantHandler][DEBUG] After attachTranscriptions:', messagesWithTranscriptions);

        openAIMessages = window.messagePreprocessor.getNewMessagesSince(
          messagesWithTranscriptions,
          threadInfo.lastMessageId
        );
        console.log('[AssistantHandler][DEBUG] After getNewMessagesSince:', openAIMessages);
      }

      // Log the exact payload that will be sent to the assistant
      console.log('[AssistantHandler] Final payload to be sent to the assistant:', openAIMessages);

      // FILTER: Remove messages with empty content or not an array
      openAIMessages = openAIMessages.filter(msg =>
        Array.isArray(msg.content) && msg.content.length > 0
      );

      if (!openAIMessages || openAIMessages.length === 0) {
        logger.warn('No messages to process for thread');
        return '';
      }

      // Step 4: Add messages to the OpenAI thread
      for (const message of openAIMessages) {
        await window.apiClient.addMessage(threadInfo.openaiThreadId, message);
      }

      // Step 5: Create a run with the appropriate assistant
      const { runId } = await window.apiClient.createRun(threadInfo.openaiThreadId, assistantId);

      // Step 6: Wait for the run to complete
      const runResult = await window.apiClient.waitForRunCompletion(
        threadInfo.openaiThreadId, 
        runId,
        this.maxWaitTime
      );

      // Step 7: Process the response
      if (runResult.status === 'completed' && runResult.output) {
        // Update thread info with latest message ID
        if (allMessages.length > 0) {
          const lastMessage = allMessages[allMessages.length - 1];
          window.threadStore.updateLastMessage(
            fbThreadId, 
            lastMessage.id || window.messagePreprocessor.generateMessageId(lastMessage.content?.text, Date.now()),
            Date.now()
          );
        }

        // Process and return the response text
        return this.processResponse(runResult.output);
      } else if (runResult.status === 'failed') {
        throw new Error(`Run failed: ${runResult.error?.message || 'Unknown error'}`);
      } else {
        throw new Error(`Run did not complete: ${runResult.status}`);
      }
    } catch (error) {
      logger.error(`Error generating response: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Creates a new OpenAI thread and stores the mapping
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} chatRole - Role (seller or buyer)
   * @returns {Promise<Object>} Thread info
   * @private
   */
  async createNewThread(fbThreadId, chatRole) {
    try {
      console.log(`Creating new thread for ${fbThreadId} as ${chatRole}`);
      
      // Create the thread in OpenAI
      const { id: openaiThreadId } = await window.apiClient.createThread();
      
      // Create and store thread info
      const threadInfo = window.threadStore.createThreadInfo(
        fbThreadId,
        openaiThreadId,
        chatRole
      );
      
      console.log(`New thread created successfully: ${openaiThreadId}`);
      return threadInfo;
    } catch (error) {
      logger.error(`Error creating new thread: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Gets an assistant ID according to the role
   * @param {string} role - Role ('seller' or 'buyer')
   * @returns {string} Assistant ID
   */
  getAssistantIdForRole(role) {
    // DEBUG: Log the current assistant config for troubleshooting
    logger.debug('AssistantHandler: CONFIG.AI.assistants:', JSON.stringify(window.CONFIG?.AI?.assistants));
    logger.debug('AssistantHandler: CONFIG:', JSON.stringify(window.CONFIG));

    // Check for configuration
    if (!window.CONFIG || !window.CONFIG.AI || !window.CONFIG.AI.assistants) {
      logger.error('Assistant configuration not found');
      // RECOVERY ATTEMPT: Force reload from window.CONFIG if it exists globally
      if (typeof CONFIG !== 'undefined' && CONFIG.AI && CONFIG.AI.assistants) {
        window.CONFIG = CONFIG;
        logger.warn('AssistantHandler: CONFIG.AI.assistants recovered from global CONFIG variable');
      } else {
        return null;
      }
    }

    // Get the assistant for the role
    const assistant = window.CONFIG.AI.assistants[role];
    if (!assistant || !assistant.id) {
      logger.error(`No assistant configured for role: ${role}`);
      return null;
    }

    return assistant.id;
  }

  /**
   * Processes the response to extract the text
   * @param {Array} messages - Thread messages from API
   * @returns {string} Response text
   */
  processResponse(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.error('No messages in response to process');
      return '';
    }

    try {
      // Full log for debugging
      console.log('[AssistantHandler][DEBUG] Messages received from API:', messages);

      // Find the first assistant message
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      if (!assistantMessage) {
        logger.warn('No assistant message found in response');
        return '';
      }

      // Extract the response text, supporting various formats
      let responseText = '';

      if (Array.isArray(assistantMessage.content)) {
        // Supports formats: {type: 'text', text: '...'} and {type: 'text', text: {value: '...'}}
        responseText = assistantMessage.content
          .filter(part => part.type === 'text')
          .map(part => {
            if (typeof part.text === 'string') return part.text;
            if (part.text && typeof part.text.value === 'string') return part.text.value;
            return '';
          })
          .join(' ')
          .trim();
      } else if (typeof assistantMessage.content === 'string') {
        responseText = assistantMessage.content.trim();
      } else if (typeof assistantMessage.content === 'object' && assistantMessage.content.text) {
        if (typeof assistantMessage.content.text === 'string') {
          responseText = assistantMessage.content.text.trim();
        } else if (typeof assistantMessage.content.text.value === 'string') {
          responseText = assistantMessage.content.text.value.trim();
        }
      }

      console.log(`Processed response: ${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}`);
      return responseText;
    } catch (error) {
      logger.error(`Error processing response: ${error.message}`, {}, error);
      return '';
    }
  }

  /**
   * Runs an assistant in a thread and returns the response
   * @param {string} threadId - OpenAI thread ID
   * @param {string} assistantId - Assistant ID to use
   * @param {Array} messages - Messages prepared to add
   * @returns {Promise<string>} Generated response
   */
  async run(threadId, assistantId, messages) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!threadId || !assistantId || !messages) {
      throw new Error('Missing required parameters for run');
    }

    try {
      // Add messages to the thread
      for (const message of messages) {
        await window.apiClient.addMessage(threadId, message);
      }

      // Create a run
      const { runId } = await window.apiClient.createRun(threadId, assistantId);

      // Wait for completion
      const runResult = await window.apiClient.waitForRunCompletion(
        threadId, 
        runId,
        this.maxWaitTime
      );

      // Process the response
      if (runResult.status === 'completed' && runResult.output) {
        return this.processResponse(runResult.output);
      } else if (runResult.status === 'failed') {
        throw new Error(`Run failed: ${runResult.error?.message || 'Unknown error'}`);
      } else {
        throw new Error(`Run did not complete: ${runResult.status}`);
      }
    } catch (error) {
      logger.error(`Error in run method: ${error.message}`, {}, error);
      throw error;
    }
  }
}

// Create global singleton instance
const assistantHandler = new AssistantHandler();

// Expose globally
window.assistantHandler = assistantHandler;
