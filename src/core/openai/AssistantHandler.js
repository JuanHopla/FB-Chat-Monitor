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
        if (window.logManager) {
          window.logManager.phase('INITIALIZATION', 'ERROR', 'Required dependencies not available for AssistantHandler');
        } else {
          logger.error('Missing required dependencies for AssistantHandler');
        }
        return false;
      }

      // Initialize ThreadStore if not already done
      if (window.threadStore && typeof window.threadStore.initialize === 'function' &&
        !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }

      this.initialized = true;
      if (window.logManager) {
        window.logManager.phase(window.logManager.phases.INITIALIZATION, 'AssistantHandler initialized successfully');
      } else {
        console.log('AssistantHandler initialized successfully');
      }
      return true;
    } catch (error) {
      if (window.logManager) {
        window.logManager.phase(window.logManager.phases.INITIALIZATION, 'ERROR',
          `Failed to initialize AssistantHandler: ${error.message}`, error);
      } else {
        logger.error('Failed to initialize AssistantHandler', {}, error);
      }
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
  async generateResponse(fbThreadId, allMessages, chatRole, productData, options = {}) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!fbThreadId || !allMessages || !Array.isArray(allMessages)) {
      throw new Error('Invalid parameters for generateResponse');
    }

    // Validate and set default chatRole if needed
    if (chatRole !== 'seller' && chatRole !== 'buyer') {
      if (window.logManager) {
        window.logManager.step(window.logManager.phases.GENERATION, 'WARNING',
          `Invalid role: ${chatRole}, using 'seller' as default`);
      } else {
        console.warn(`Invalid chat role: ${chatRole}, defaulting to 'seller'`);
      }
      chatRole = 'seller';
    }

    if (window.logManager) {
      window.logManager.phase(window.logManager.phases.GENERATION,
        `Generating response for conversation ${fbThreadId} as ${chatRole}`);
    } else {
      console.log(`Generating response for thread ${fbThreadId} as ${chatRole}`);
      console.log(`[AssistantHandler] Step 4.1: Generating response for thread ${fbThreadId} as ${chatRole}`);
    }

    try {
      // First, ensure ThreadStore is initialized
      if (window.threadStore && typeof window.threadStore.initialize === 'function' &&
        !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }

      // First thread check
      let threadInfo = window.threadStore?.getThreadInfo(fbThreadId);

      // Choose appropriate flow
      if (!threadInfo) {
        if (window.logManager) {
          window.logManager.step(window.logManager.phases.GENERATION, 'FLOW',
            'New thread flow selected');
        }
        return await this.handleNewThread(fbThreadId, allMessages, chatRole, productData);
      } else {
        if (window.logManager) {
          window.logManager.step(window.logManager.phases.GENERATION, 'FLOW',
            'Existing thread flow selected');
        }
        // MODIFIED: Pass options to handleExistingThread
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo, options);
      }
    } catch (error) {
      if (window.logManager) {
        window.logManager.step(window.logManager.phases.GENERATION, 'ERROR',
          `Error generating response: ${error.message}`, error);
      } else {
        console.error(`[AssistantHandler] Error generating response: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Handles a new thread.
   * This now includes logic to handle manual follow-up requests if the last message
   * in the initial set was from the assistant.
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} productData - Product information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleNewThread(fbThreadId, allMessages, chatRole, productData) {
    if (window.logManager) {
      window.logManager.step('GENERATION', 'NEW_THREAD',
        `Processing new thread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    } else {
      console.log(`[AssistantHandler][DEBUG] handleNewThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    }

    // --- FOLLOW-UP LOGIC FOR NEW THREADS ---
    const lastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
    let isFollowUpRequest = false;

    if (lastMessage && lastMessage.sentByUs) {
      if (window.logManager) {
        window.logManager.step('GENERATION', 'FOLLOW_UP', 'Manual follow-up request detected in new thread');
      } else {
        console.log('[AssistantHandler] Manual follow-up request detected in a new thread.');
      }

      if (!this._canPerformFollowUp(allMessages)) {
        if (window.logManager) {
          window.logManager.step('GENERATION', 'FOLLOW_UP', 'Follow-up limit reached. Thread will not be created to avoid spam.');
        } else {
          console.warn('[AssistantHandler] Follow-up limit reached for this new thread. Thread will not be created to avoid spam.');
        }
        alert('Max follow-ups reached (3). The other user must respond to continue.');
        return ''; // Stop execution
      }

      if (window.logManager) {
        window.logManager.step('GENERATION', 'FOLLOW_UP', 'Follow-up check passed. Adding follow-up instruction.');
      } else {
        console.log('[AssistantHandler] Follow-up check passed. Follow-up instruction will be added.');
      }
      isFollowUpRequest = true;
    }
    // --- END OF FOLLOW-UP LOGIC ---

    console.log('No existing thread found, creating new one');
    console.log('[AssistantHandler] Processing new thread flow...');

    if (window.threadStore) {
      const threadInfoCheck = window.threadStore.getThreadInfo(fbThreadId, true);
      if (threadInfoCheck) {
        console.log(`[AssistantHandler][DEBUG] Thread found on final check, using existing instead of creating new`);
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfoCheck);
      }
    }

    console.log(`[AssistantHandler][DEBUG] Creating new thread in OpenAI for ${fbThreadId}`);
    const threadInfo = await this.createNewThread(fbThreadId, chatRole);

    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] Assistant ID obtained: ${assistantId}`);

    console.log('[AssistantHandler] Step 4.2: Preparing messages for new thread...');

    // NEW: Explicitly wait for pending transcriptions
    if (window.audioTranscriber && window.audioTranscriber.pendingTranscriptions.size > 0) {
      const pendingCount = window.audioTranscriber.pendingTranscriptions.size;
      console.log(`[AssistantHandler][DEBUG] Waiting for ${pendingCount} pending transcriptions...`);

      // Wait up to 5 seconds for pending transcriptions
      const maxWaitTime = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime && window.audioTranscriber.pendingTranscriptions.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between checks

        // Check how many are still pending
        const currentPending = window.audioTranscriber.pendingTranscriptions.size;
        if (currentPending < pendingCount) {
          console.log(`[AssistantHandler][DEBUG] Progress: ${pendingCount - currentPending} transcriptions completed, ${currentPending} pending`);
        }
      }

      // If after waiting there are still pending ones, run FIFO association
      if (window.audioTranscriber.pendingTranscriptions.size > 0) {
        console.log(`[AssistantHandler][DEBUG] Some transcriptions are still pending. Applying FIFO association...`);
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(allMessages);
      } else {
        console.log(`[AssistantHandler][DEBUG] All transcriptions completed successfully`);
      }
    }

    const messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(allMessages);
    if (window.audioTranscriber && typeof window.audioTranscriber.showTranscriptionLogs === 'function') {
      window.audioTranscriber.showTranscriptionLogs();
    }

    // OPTIMIZATION: Replace verbose logs with summary and collapsible details
    const audioMessages = messagesWithTranscriptions.filter(msg => msg.content?.hasAudio);
    console.log(`[AssistantHandler] [DEBUG] ${audioMessages.length} messages with audio found`);

    // Only show expandable details in debug mode
    if (window.CONFIG?.logging?.level === 'debug') {
      console.groupCollapsed('[AssistantHandler] [DEBUG] Details of messages with audio (expand to view)');
      audioMessages.forEach((msg, idx) => {
        console.log(`[${idx}] Message ID: ${msg.id}`);
        console.log(`    - audioUrl: ${msg.content.audioUrl ? 'Available' : 'Not available'}`);
        console.log(`    - transcription: ${msg.content.transcribedAudio?.substring(0, 50)}${msg.content.transcribedAudio?.length > 50 ? '...' : ''}`);
      });
      console.groupEnd();
    }

    const openAIMessages = await window.messagePreprocessor.formatMessagesForOpenAI(
      messagesWithTranscriptions.slice(-50),
      productData
    );

    const validatedMessages = this.validateMessages(openAIMessages);
    if (!validatedMessages.length) {
      logger.warn('No valid messages to process for new thread');
      return '';
    }

    console.log(`[AssistantHandler][DEBUG] Adding ${validatedMessages.length} messages to thread ${threadInfo.openaiThreadId}`);
    for (const message of validatedMessages) {
      await window.apiClient.addMessage(threadInfo.openaiThreadId, message);
    }

    // If it's a follow-up request, add the special instruction now
    if (isFollowUpRequest) {
      let followUpInstruction;
      
      if (chatRole === 'seller') {
        followUpInstruction = {
          role: 'user',
          content: `[System Instruction] The buyer has not responded to your last message. 
          
          Write a short, friendly follow-up message (1-2 sentences) to re-engage them. 
          
          Remember to:
          - Keep it brief and conversational
          - Maintain interest in your product
          - If appropriate, remind them about pickup location (123 Street, Miami) and business hours (7am to 11pm daily)
          - Do not be pushy or send multiple questions
          
          This follows your seller prompt guideline: "If you were the last one messaging, write a short followup."`
        };
      } else if (chatRole === 'buyer') {
        followUpInstruction = {
          role: 'user',
          content: `[System Instruction] The seller has not responded to your last message.

          Write a short, friendly follow-up message (1 sentence only) to re-engage them.
          
          Remember to:
          - Keep it extremely brief and conversational
          - Avoid sounding like an advertisement
          - Don't be pushy or salesy
          - Maintain your role as someone sharing personal experience with stripsapp.com
          - Never claim or imply any affiliation with the website
          
          This follows your buyer prompt guideline to "keep the conversation very short, friendly, and avoid sounding like an ad."`
        };
      } else {
        followUpInstruction = {
          role: 'user',
          content: '[System Instruction] The other person has not responded to your last message. Please generate a brief, friendly follow-up message to re-engage them.'
        };
      }
      
      await window.apiClient.addMessage(threadInfo.openaiThreadId, followUpInstruction);
    }

    console.log(`[AssistantHandler][DEBUG] Creating run with assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(threadInfo.openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run created: ${runId}`);

    console.log(`[AssistantHandler][DEBUG] Waiting for run completion ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(threadInfo.openaiThreadId, runId, this.maxWaitTime);
    console.log(`[AssistantHandler][DEBUG] Run completed with status: ${runResult.status}`);

    if (runResult.status === 'completed' && runResult.output) {
      if (allMessages.length > 0) {
        const lastMsg = allMessages[allMessages.length - 1];
        const messageId = lastMsg.id || window.messagePreprocessor.generateMessageId(lastMsg.content?.text, Date.now());
        window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      }
      return this.processResponse(runResult.output);
    } else {
      const errorMsg = `Run did not complete: ${runResult.status}. Error: ${runResult.error?.message || 'Unknown'}`;
      console.log(`[AssistantHandler][ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }
  /**
   * Handles an existing thread.
   * This function decides whether to respond to new user messages or to generate a manual follow-up.
   * It includes a "3-strike" rule to prevent excessive follow-ups on unresponsive chats.
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} threadInfo - Existing thread information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo, options = {}) {
    console.log(`[AssistantHandler][DEBUG] handleExistingThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    const { openaiThreadId, lastMessageId } = threadInfo;

    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] Assistant ID obtained: ${assistantId}`);

    const newMessages = window.messagePreprocessor.getNewMessagesSinceNoFormat(allMessages, lastMessageId);
    console.log(`[AssistantHandler][DEBUG] Found ${newMessages.length} new messages from the preprocessor.`);

    const hasTrulyNewMessages = newMessages.length > 0 && newMessages[0].id !== lastMessageId;
    // NEW: forces the generation of a new response (regeneration)
    const isRegenerationRequest = options.forceNewGeneration === true;

    let actionTaken = false;

    if (hasTrulyNewMessages || isRegenerationRequest) {
      // --- ACTION A: Respond to new messages or regenerate response ---
      if (isRegenerationRequest) {
        console.log('[AssistantHandler] User requested to generate an alternative response.');
      } else {
        console.log(`[AssistantHandler] Found ${newMessages.length} new user messages. Processing to respond.`);
      }

      // (Reuse transcription and preprocessing logic)
      const msgsToProcess = isRegenerationRequest ? newMessages.slice(-1) : newMessages;
      // Wait for transcriptions if there are audio messages
      const audioMessages = msgsToProcess.filter(m => m.content?.hasAudio);
      if (audioMessages.length && window.audioTranscriber) {
        const pendingCount = window.audioTranscriber.pendingTranscriptions.size;
        if (pendingCount > 0) {
          console.log(`[AssistantHandler][DEBUG] Waiting for ${pendingCount} pending transcriptions...`);
          const start = Date.now();
          const maxWait = 5000;
          while (Date.now() - start < maxWait && window.audioTranscriber.pendingTranscriptions.size > 0) {
            await new Promise(r => setTimeout(r, 500));
          }
          if (window.audioTranscriber.pendingTranscriptions.size > 0) {
            console.log('[AssistantHandler][DEBUG] Applying FIFO association for pending transcriptions');
            await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(msgsToProcess);
          }
        }
      }

      const messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(msgsToProcess);

      console.log('==================== FULL ARRAY OF PROCESSED MESSAGES ====================');
      console.log('[AssistantHandler] [DEBUG] After attachTranscriptions (existing):', JSON.stringify(messagesWithTranscriptions));
      console.log('===================================================================================');

      const openAIMessages = await window.messagePreprocessor.formatMessagesForOpenAI(messagesWithTranscriptions);
      const validatedMessages = this.validateMessages(openAIMessages);

      if (validatedMessages.length) {
        actionTaken = true;
        console.log(`[AssistantHandler][DEBUG] Adding ${validatedMessages.length} messages to thread ${openaiThreadId}`);
        for (const message of validatedMessages) {
          await window.apiClient.addMessage(openaiThreadId, message);
        }
      } else {
        console.warn('[AssistantHandler] After formatting, there are no valid messages. No messages were added.');
      }
    } else {
      // --- ACTION B: Generate manual follow-up ---
      console.log('[AssistantHandler] No new messages. User has requested a manual follow-up.');
      if (this._canPerformFollowUp(allMessages)) {
        actionTaken = true;
        console.log('[AssistantHandler] Check passed: Fewer than 3 consecutive assistant responses. Generating follow-up.');
        
        let followUpInstruction;
        
        if (chatRole === 'seller') {
          followUpInstruction = {
            role: 'user',
            content: `[System Instruction] The buyer has not responded to your last message. 
            
            Write a short, friendly follow-up message (1-2 sentences) to re-engage them. 
            
            Remember to:
            - Keep it brief and conversational
            - Maintain interest in your product
            - If appropriate, remind them about pickup location (123 Street, Miami) and business hours (7am to 11pm daily)
            - Do not be pushy or send multiple questions
            
            This follows your seller prompt guideline: "If you were the last one messaging, write a short followup."`
          };
        } else if (chatRole === 'buyer') {
          followUpInstruction = {
            role: 'user',
            content: `[System Instruction] The seller has not responded to your last message.

            Write a short, friendly follow-up message (1 sentence only) to re-engage them.
            
            Remember to:
            - Keep it extremely brief and conversational
            - Avoid sounding like an advertisement
            - Don't be pushy or salesy
            - Maintain your role as someone sharing personal experience with stripsapp.com
            - Never claim or imply any affiliation with the website
            
            This follows your buyer prompt guideline to "keep the conversation very short, friendly, and avoid sounding like an ad."`
          };
        } else {
          followUpInstruction = {
            role: 'user',
            content: '[System Instruction] The other person has not responded to your last message. Please generate a brief, friendly follow-up message to re-engage them.'
          };
        }
        
        await window.apiClient.addMessage(openaiThreadId, followUpInstruction);
      } else {
        console.warn('[AssistantHandler] Follow-up limit reached. A new response will not be generated.');
        alert('Max follow-ups reached (3). The other user must respond to continue.');
      }
    }

    if (!actionTaken) {
      console.log('[AssistantHandler] No action was taken. Finalizing the process.');
      return '';
    }

    // Create and wait for the OpenAI run
    console.log(`[AssistantHandler][DEBUG] Creating run with assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run created: ${runId}`);

    console.log(`[AssistantHandler][DEBUG] Waiting for run completion ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(openaiThreadId, runId, this.maxWaitTime);
    console.log(`[AssistantHandler][DEBUG] Run completed with status: ${runResult.status}`);

    if (runResult.status === 'completed' && runResult.output) {
      const lastMsg = allMessages[allMessages.length - 1];
      const messageId = lastMsg.id || window.messagePreprocessor.generateMessageId(lastMsg.content?.text, Date.now());
      window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      return this.processResponse(runResult.output);
    } else {
      const err = `Run did not complete: ${runResult.status}. Error: ${runResult.error?.message || 'Unknown'}`;
      console.error(`[AssistantHandler][ERROR] ${err}`);
      throw new Error(err);
    }
  }

  /**
   * Checks if a follow-up is allowed based on the "3-strike" rule.
   * A follow-up is not allowed if the last 3 messages were all sent by us (assistant).
   * @param {Array} allMessages - The entire message history of the chat.
   * @returns {boolean} True if a follow-up is allowed, false otherwise.
   * @private
   */
  _canPerformFollowUp(allMessages) {
    if (allMessages.length < 3) {
      return true;
    }
    const lastThreeMessages = allMessages.slice(-3);
    const allFromAssistant = lastThreeMessages.every(msg => msg.sentByUs === true);
    if (allFromAssistant) {
      console.log('[AssistantHandler] Follow-up check failed: The last 3 responses were from the assistant.');
      return false;
    }
    return true;
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
   * Validates messages for the OpenAI API
   * @param {Array} messages - Messages to validate
   * @returns {Array} Valid messages
   * @private
   */
  validateMessages(messages) {
    console.log(`[AssistantHandler][DEBUG] validateMessages - validating ${messages ? messages.length : 0} messages`);
    if (!messages || !Array.isArray(messages)) {
      console.log(`[AssistantHandler][ERROR] Invalid message array in validateMessages`);
      return [];
    }

    // Remove messages with empty content or not an array
    const validMessages = messages.filter(msg =>
      Array.isArray(msg.content) && msg.content.length > 0
    );

    console.log(`[AssistantHandler][DEBUG] Validation completed: ${validMessages.length}/${messages.length} valid messages`);
    if (messages.length > 0 && validMessages.length === 0) {
      console.log(`[AssistantHandler][DEBUG] Invalid messages found:`, messages);
    }

    return validMessages;
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
    console.log(`[AssistantHandler][DEBUG] processResponse - processing ${messages ? messages.length : 0} messages`);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[AssistantHandler][ERROR] No messages in the response to process`);
      logger.error('No messages in response to process');
      return '';
    }

    try {
      // Full log for debugging
      console.log('[AssistantHandler][DEBUG] Messages received from API:', messages);

      // Find the first assistant message
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      if (!assistantMessage) {
        console.log(`[AssistantHandler][WARN] No assistant message found in the response`);
        logger.warn('No assistant message found in response');
        return '';
      }
      console.log(`[AssistantHandler][DEBUG] Assistant message found with content type: ${typeof assistantMessage.content}`);

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

      console.log(`[AssistantHandler][DEBUG] Processed response: "${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"`);
      return responseText;
    } catch (error) {
      console.log(`[AssistantHandler][ERROR] Error processing response: ${error.message}`, error);
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