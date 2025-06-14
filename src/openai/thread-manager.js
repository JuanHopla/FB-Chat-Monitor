/**
 * Thread manager for OpenAI Assistants API
 *
 * Manages the creation, storage, and cleanup of conversation threads
 * to maintain context between interactions with the assistant.
 */
class ThreadManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.activeThreads = new Map(); // Store active threads by chatId
    this.threadTTL = 30 * 60 * 1000; // 30 minutes of TTL

    // Load saved threads
    this.loadSavedThreads();

    // Schedule periodic cleanup
    setInterval(() => this.cleanupOldThreads(), 15 * 60 * 1000); // Every 15 minutes
  }

  /**
   * Load saved threads from storage
   * @private
   */
  loadSavedThreads() {
    try {
      const savedThreads = storageUtils.get('OPENAI_ACTIVE_THREADS', {});

      // Convert simple object structure to Map
      Object.entries(savedThreads).forEach(([chatId, threadData]) => {
        if (threadData && threadData.id) {
          this.activeThreads.set(chatId, {
            id: threadData.id,
            lastUsed: threadData.lastUsed || Date.now()
          });
        }
      });

      logger.debug(`Loaded ${this.activeThreads.size} saved threads from storage`);
    } catch (error) {
      logger.error('Error loading saved threads:', error);
    }
  }

  /**
   * Save current threads to storage
   * @private
   */
  saveThreads() {
    try {
      // Convert Map to object for storage
      const threadsToSave = {};
      this.activeThreads.forEach((threadData, chatId) => {
        threadsToSave[chatId] = {
          id: threadData.id,
          lastUsed: threadData.lastUsed
        };
      });

      storageUtils.set('OPENAI_ACTIVE_THREADS', threadsToSave);
    } catch (error) {
      logger.error('Error saving threads:', error);
    }
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
      // Log existing thread usage
      console.log(`🧵 Reusing existing thread: ${existingThread.id} for chat: ${chatId}`);
      logger.debug(`Reusing existing thread ${existingThread.id} for chat ${chatId}`);

      // Update last used timestamp
      existingThread.lastUsed = Date.now();
      this.saveThreads(); // Save for persistence
      return { id: existingThread.id, isNew: false };
    }

    try {
      // Create a new thread
      const response = await this.apiClient.createThread();
      const threadId = response.id;

      // Log new thread creation
      console.log(`🧵 New thread created: ${threadId} for chat: ${chatId}`);
      logger.log(`Created new thread ${threadId} for chat ${chatId}`);

      // Store in active threads
      this.activeThreads.set(chatId, {
        id: threadId,
        lastUsed: Date.now()
      });

      this.saveThreads(); // Save for persistence
      return { id: threadId, isNew: true };
    } catch (error) {
      logger.error(`Error creating thread: ${error.message}`);
      throw error;
    }
  }

  /**
   * Display information of all active threads in the console
   */
  logActiveThreads() {
    console.log(`🧵 === ACTIVE THREADS (${this.activeThreads.size}) ===`);
    if (this.activeThreads.size === 0) {
      console.log("No active threads at the moment");
      return;
    }

    const threadsInfo = [];
    this.activeThreads.forEach((threadInfo, chatId) => {
      const timeSinceLastUse = Math.round((Date.now() - threadInfo.lastUsed) / 1000);
      threadsInfo.push({
        chatId,
        threadId: threadInfo.id,
        lastUsed: new Date(threadInfo.lastUsed).toLocaleTimeString(),
        secondsAgo: timeSinceLastUse,
        expires: Math.round((this.threadTTL - (Date.now() - threadInfo.lastUsed)) / 1000)
      });
    });

    console.table(threadsInfo);
  }

  /**
   * Clean up old threads to prevent memory leaks
   */
  cleanupOldThreads() {
    // Log before cleanup
    const initialCount = this.activeThreads.size;
    console.log(`🧵 Starting cleanup of threads (${initialCount} active)`);

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
      this.saveThreads(); // Save changes after cleaning
    } else {
      const finalCount = this.activeThreads.size; // Ensure finalCount is defined
      console.log(`🧵 No expired threads found for deletion (${finalCount} active)`);
    }
  }

  /**
   * Sends a conversation to the thread, dividing messages with extensive content into blocks
   * @param {Array} messages - Messages prepared to be sent to OpenAI
   * @param {string} threadId - ID of the thread to use
   * @param {string} apiKey - API key for authentication (optional, uses this.apiClient by default)
   * @returns {Promise<boolean>} - True if all messages were sent correctly
   */
  async sendConversationInChunks(messages, threadId, apiKey = null) {
    if (!threadId) {
      throw new Error('A valid threadId is required to send messages');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      logger.warn('No messages to send to the thread');
      return false;
    }

    // API client to use (existing or new with the provided apiKey)
    const apiClient = apiKey ? new window.OpenAIApiClient(apiKey) : this.apiClient;
    if (!apiClient) {
      throw new Error('API client not initialized');
    }

    logger.debug(`Sending conversation split into blocks to thread ${threadId} (${messages.length} messages)`);

    try {
      // Use the shared MessageChunker function but passing our apiClient
      return await window.MessageChunker.sendConversationInChunks(messages, threadId, apiClient);
    } catch (error) {
      logger.error(`Error sending conversation in blocks: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Adds a message with context to a thread
   * @param {string} threadId - Thread ID
   * @param {Object} context - Context including messages and product details
   * @param {boolean} [skipImages=false] - Whether to skip images
   */
  async addMessageToThread(threadId, context, skipImages = false) {
    try {
      // Always wait for message preparation (includes images)
      const messageContent = context.preparedMessages ||
        await window.MessageUtils.prepareMessageContent(context);

      // Ensure a valid threadId
      if (!threadId) {
        throw new Error('Invalid threadId');
      }

      if (!messageContent || !messageContent.length) {
        throw new Error('No message content to add');
      }

      // Check if any message has more than 10 elements to use the chunk method
      const hasLargeContent = messageContent.some(msg =>
        Array.isArray(msg.content) && msg.content.length > 10);

      if (hasLargeContent) {
        logger.debug('Detected extensive content, using block sending method');
        return await this.sendConversationInChunks(messageContent, threadId);
      }

      // Add each message to the thread
      for (let i = 0; i < messageContent.length; i++) {
        const msg = messageContent[i];

        // Skip system messages as they cannot be added directly
        if (msg.role === 'system') {
          continue;
        }

        // Ensure the message format is valid
        if (!Array.isArray(msg.content) || msg.content.length === 0) {
          logger.warn(`Message #${i + 1} has invalid content structure. Skipping.`);
          continue;
        }

        // Automatic image upload handling
        // If skipImages is true, image upload will be skipped
        const shouldProcessImage = !skipImages;

        if (shouldProcessImage && msg.content[0].type === 'image_url' &&
          msg.content[0].image_url && msg.content[0].image_url.url) {
          try {
            const url = msg.content[0].image_url.url;
            logger.debug(`Attempting to upload image: ${url}`);
            const fileId = await this.apiClient.uploadFile(url, 'image.jpg');
            await this.apiClient.addMessage(threadId, {
              role: msg.role,
              content: [{ type: "image_file", image_file: { file_id: fileId } }]
            });
            logger.debug(`Image uploaded and sent as file ${fileId} for message #${i + 1}`);
            continue; // Move to the next message
          } catch (uploadError) {
            logger.error(`Image upload error for message #${i + 1}: ${uploadError.message}. Trying with URL.`);
            // If upload fails, try sending as image_url
          }
        }

        // Normal sending for text or fallback
        try {
          await this.apiClient.addMessage(threadId, {
            role: msg.role,
            content: msg.content
          });
          logger.debug(`Added message #${i + 1} with role ${msg.role} to thread ${threadId}`);
        } catch (msgError) {
          logger.error(`Error adding message #${i + 1} to thread ${threadId}: ${msgError.message}`);
          throw msgError;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error in addMessageToThread (threadId: ${threadId}): ${error.message}`);
      throw error;
    }
  }

  /**
   * Runs an assistant on a thread and gets the response
   * @param {string} threadId - Thread ID
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<string>} Assistant's response as text
   */
  async runAssistant(threadId, assistantId) {
    try {
      // Log with threadId and assistantId
      console.log(`🧵 Running assistant: ${assistantId} on thread: ${threadId}`);
      logger.log(`Running assistant ${assistantId} on thread ${threadId}`);

      // Start a run
      const run = await this.apiClient.createRun(threadId, {
        assistant_id: assistantId
      });

      logger.debug(`Started run ${run.id} on thread ${threadId}`);

      // Wait for completion
      await this.pollRunUntilComplete(threadId, run.id);

      // Get the assistant's message as plain text
      const messages = await this.apiClient.listMessages(threadId, {
        limit: 1,
        order: 'desc'
      });

      const assistantMessage = messages.data && messages.data.length > 0 ?
        messages.data[0] : null;

      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        logger.error('No assistant message found as the latest message.');
        throw new Error('No assistant message found as the latest message in the thread.');
      }

      if (assistantMessage.content && assistantMessage.content.length > 0) {
        const textContentItem = assistantMessage.content.find(
          contentItem => contentItem.type === 'text'
        );

        if (textContentItem && textContentItem.text &&
          typeof textContentItem.text.value === 'string') {
          logger.debug("Retrieved assistant's message content");
          return textContentItem.text.value;
        }
      }

      logger.error('No text content found in assistant message.');
      throw new Error('No text content found in assistant message or content is not in expected format.');
    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`);
      throw error;
    }
  }

  /**
   * Polls a run until it is completed
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @returns {Promise<void>} Resolves when the run is in a terminal state
   * @throws {Error} If the run fails or is cancelled, or if polling times out
   */
  async pollRunUntilComplete(threadId, runId) {
    const pollInterval = 1000; // Polling every 1 second
    const maxAttempts = 60; // Max 60 attempts (60 seconds)
    let attempts = 0;

    logger.debug(`Starting polling for run ${runId} on thread ${threadId}`);

    return new Promise(async (resolve, reject) => {
      const checkStatus = async () => {
        try {
          attempts++;
          if (attempts > maxAttempts) {
            logger.error(`Polling timed out for run ${runId} after ${maxAttempts} attempts.`);
            reject(new Error(`Polling timed out for run ${runId}`));
            return;
          }

          const runStatus = await this.apiClient.getRun(threadId, runId);
          logger.debug(`Run ${runId} status: ${runStatus.status} (Attempt: ${attempts})`);

          switch (runStatus.status) {
            case 'queued':
            case 'in_progress':
            case 'requires_action': // If you implement function calls, handle this
              setTimeout(checkStatus, pollInterval);
              break;
            case 'completed':
              logger.log(`Run ${runId} completed successfully.`);
              resolve();
              break;
            case 'failed':
              logger.error(`Run ${runId} failed. Reason: ${runStatus.last_error?.message || 'Unknown error'}`);
              reject(new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`));
              break;
            case 'cancelled':
              logger.warn(`Run ${runId} was cancelled.`);
              reject(new Error('Run was cancelled'));
              break;
            case 'expired':
              logger.error(`Run ${runId} expired.`);
              reject(new Error('Run expired'));
              break;
            default:
              logger.error(`Unknown run status for ${runId}: ${runStatus.status}`);
              reject(new Error(`Unknown run status: ${runStatus.status}`));
          }
        } catch (error) {
          logger.error(`Error during polling for run ${runId}: ${error.message}`);
          // Retry for a few attempts in case of network errors
          if (attempts < 5) {
            logger.warn(`Retrying due to polling error. Attempt ${attempts}/5.`);
            setTimeout(checkStatus, pollInterval * attempts);
            return;
          }
          reject(error);
        }
      };

      checkStatus(); // Start polling
    });
  }
}

// Export globally
window.ThreadManager = ThreadManager;
