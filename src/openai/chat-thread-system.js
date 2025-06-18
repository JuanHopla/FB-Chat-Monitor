/**
 * ChatThreadSystem - Centralized system for managing chat threads
 *
 * Provides a single access point for all thread-related operations.
 * Manages communication between MessageUtils, ThreadManager, and MessageChunker.
 */
class ChatThreadSystem {
  constructor() {
    this.initialized = false;
    this.threadManager = null;
    this.messageUtils = null;

    // Attempt to initialize immediately if dependencies already exist
    this.initialize();
  }

  /**
   * Initializes the system with the necessary components
   */
  initialize() {
    try {
      // Verify dependencies before initializing
      const dependencies = this.verifyDependencies();

      if (!dependencies.success) {
        throw new Error(dependencies.error || 'Failed to verify dependencies');
      }

      this.threadManager = dependencies.threadManager;
      this.messageUtils = dependencies.messageUtils;
      this.messageChunker = dependencies.messageChunker;

      // Add processChat method as alias if it doesn't exist
      if (this.threadManager && !this.threadManager.processChat) {
        this.threadManager.processChat = this.threadManager.getOrCreateThread;
      }

      this.initialized = true;
      logger.log('ChatThreadSystem initialized successfully');

      return true;
    } catch (error) {
      logger.error(`Error initializing ChatThreadSystem: ${error.message}`, {}, error);
      return false;
    }
  }

  /**
   * Verifies that the required dependencies are available
   * @returns {Object} Dependency status and references
   */
  verifyDependencies() {
    try {
      // 1. Attempt to get the API client first from the existing system
      let apiClient = null;

      // Attempt from openaiManager
      if (window.openaiManager && window.openaiManager.apiClient) {
        apiClient = window.openaiManager.apiClient;
        logger.debug('API client obtained from openaiManager');
      }
      // Alternative: try creating a new one if we have the class and apiKey
      else if (window.OpenAIApiClient && window.openaiManager && window.openaiManager.apiKey) {
        apiClient = new window.OpenAIApiClient(window.openaiManager.apiKey);
        logger.debug('Created new API client with apiKey from openaiManager');
      }
      // If there is no API client, check if we can get an apiKey
      else if (!apiClient && window.OpenAIApiClient) {
        const apiKey = window.CONFIG?.AI?.apiKey ||
                       storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '');

        if (apiKey) {
          apiClient = new window.OpenAIApiClient(apiKey);
          logger.debug('Created API client with apiKey from CONFIG or storage');
        }
      }

      if (!apiClient) {
        return {
          success: false,
          error: 'Could not obtain or create a valid API client'
        };
      }

      // 2. Attempt to get or create ThreadManager
      let threadManager = null;

      // Attempt from openaiManager
      if (window.openaiManager && window.openaiManager.threadManager) {
        threadManager = window.openaiManager.threadManager;
        logger.debug('ThreadManager obtained from openaiManager');
      }
      // Alternative: create a new one
      else if (window.ThreadManager) {
        threadManager = new window.ThreadManager(apiClient);
        logger.debug('Created new ThreadManager');
      }

      if (!threadManager) {
        return {
          success: false,
          error: 'Could not obtain or create ThreadManager'
        };
      }

      // 3. Verify or add processChat method as alias of getOrCreateThread
      if (!threadManager.processChat && threadManager.getOrCreateThread) {
        threadManager.processChat = threadManager.getOrCreateThread;
        logger.debug('Added processChat alias to ThreadManager');
      }

      // 4. Verify MessageUtils
      const messageUtils = window.MessageUtils || null;

      // 5. Verify MessageChunker
      const messageChunker = window.MessageChunker || null;

      return {
        success: true,
        apiClient,
        threadManager,
        messageUtils,
        messageChunker
      };
    } catch (error) {
      logger.error(`Error verifying dependencies: ${error.message}`);
      return {
        success: false,
        error: `Error verifying dependencies: ${error.message}`
      };
    }
  }

  /**
   * Loads saved threads from storage
   */
  loadSavedThreads() {
    try {
      const savedData = storageUtils.get(this.config.storageKey, { threads: {}, users: {} });

      // Restore threads
      if (savedData.threads) {
        Object.entries(savedData.threads).forEach(([chatId, threadData]) => {
          if (threadData && threadData.threadId) {
            this.threads.set(chatId, {
              threadId: threadData.threadId,
              lastUsed: threadData.lastUsed || Date.now(),
              metadata: threadData.metadata || {}
            });
          }
        });
      }

      // Restore user associations
      if (savedData.users) {
        Object.entries(savedData.users).forEach(([userId, chatIds]) => {
          if (Array.isArray(chatIds)) {
            this.users.set(userId, chatIds);
          }
        });
      }

      // Update statistics
      this.statistics.activeThreads = this.threads.size;
      this.statistics.totalThreadsCreated = savedData.statistics?.totalThreadsCreated || this.threads.size;

      logger.debug(`ChatThreadSystem: Loaded ${this.threads.size} saved threads`);
    } catch (error) {
      logger.error(`Error loading saved threads: ${error.message}`, {}, error);
    }
  }

  /**
   * Saves the current state of the threads to storage
   */
  saveThreads() {
    try {
      // Convert Map to object for storage
      const threadsToSave = {};
      this.threads.forEach((data, chatId) => {
        threadsToSave[chatId] = {
          threadId: data.threadId,
          lastUsed: data.lastUsed,
          metadata: data.metadata || {}
        };
      });

      // Convert user Map to object
      const usersToSave = {};
      this.users.forEach((chatIds, userId) => {
        usersToSave[userId] = chatIds;
      });

      // Save everything together with statistics
      storageUtils.set(this.config.storageKey, {
        threads: threadsToSave,
        users: usersToSave,
        statistics: {
          totalThreadsCreated: this.statistics.totalThreadsCreated,
          lastSaved: Date.now()
        }
      });

      logger.debug(`ChatThreadSystem: ${this.threads.size} threads saved successfully`);
    } catch (error) {
      logger.error(`Error saving threads: ${error.message}`, {}, error);
    }
  }

  /**
   * Configures periodic cleanup of old threads
   */
  setupPeriodicCleanup() {
    // Run cleanup every 15 minutes
    setInterval(() => this.cleanupOldThreads(), 15 * 60 * 1000);
    logger.debug('ChatThreadSystem: Periodic cleanup configured');
  }

  /**
   * Deletes old threads that exceed the configured TTL
   */
  cleanupOldThreads() {
    logger.debug(`ChatThreadSystem: Starting cleanup of old threads...`);
    const now = Date.now();
    let removedCount = 0;

    // Iterate and delete expired threads
    for (const [chatId, threadData] of this.threads.entries()) {
      if (now - threadData.lastUsed > this.config.threadTTL) {
        this.threads.delete(chatId);

        // Delete references in users
        for (const [userId, chatIds] of this.users.entries()) {
          const updatedChatIds = chatIds.filter(id => id !== chatId);
          if (updatedChatIds.length !== chatIds.length) {
            this.users.set(userId, updatedChatIds);
          }
        }

        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.statistics.activeThreads = this.threads.size;
      this.saveThreads();
      logger.log(`ChatThreadSystem: ${removedCount} old threads deleted`);
    } else {
      logger.debug('ChatThreadSystem: No threads found to delete');
    }
  }

  /**
   * Gets or creates a thread for a specific chat
   * @param {string} chatId - Chat ID
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>} - Thread data {threadId, isNew}
   */
  async getOrCreateThread(chatId, userId = null) {
    // Check if there is already an active thread for this chat
    const existingThread = this.threads.get(chatId);
    if (existingThread && (Date.now() - existingThread.lastUsed < this.config.threadTTL)) {
      // Update last used timestamp
      existingThread.lastUsed = Date.now();
      this.saveThreads();

      logger.debug(`ChatThreadSystem: Reusing existing thread ${existingThread.threadId} for chat ${chatId}`);
      return {
        threadId: existingThread.threadId,
        isNew: false,
        metadata: existingThread.metadata || {}
      };
    }

    try {
      // Create new thread using the ThreadManager
      const threadResult = await this.threadManager.getOrCreateThread(chatId);
      const threadId = threadResult.id;

      // Register new thread in our system
      this.threads.set(chatId, {
        threadId,
        lastUsed: Date.now(),
        metadata: {
          createdAt: Date.now(),
          userId: userId
        }
      });

      // If a userId is provided, update the association
      if (userId) {
        if (!this.users.has(userId)) {
          this.users.set(userId, []);
        }

        const userChats = this.users.get(userId);
        if (!userChats.includes(chatId)) {
          userChats.push(chatId);
          this.users.set(userId, userChats);

          // If the user has too many threads, delete the oldest ones
          this.pruneUserThreads(userId);
        }
      }

      // Update statistics
      this.statistics.totalThreadsCreated++;
      this.statistics.activeThreads = this.threads.size;

      // Save changes
      this.saveThreads();

      logger.log(`ChatThreadSystem: New thread ${threadId} created for chat ${chatId}`);
      return {
        threadId,
        isNew: true,
        metadata: { createdAt: Date.now(), userId }
      };
    } catch (error) {
      logger.error(`Error creating thread for chat ${chatId}: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Limits the number of threads per user by deleting the oldest ones
   * @param {string} userId - ID of the user to verify
   */
  pruneUserThreads(userId) {
    const userChats = this.users.get(userId);
    if (!userChats || userChats.length <= this.config.maxThreadsPerUser) {
      return;
    }

    // Get last used time information for each chat
    const chatWithTimes = userChats.map(chatId => {
      const thread = this.threads.get(chatId);
      return {
        chatId,
        lastUsed: thread ? thread.lastUsed : 0
      };
    });

    // Sort by time (oldest first)
    chatWithTimes.sort((a, b) => a.lastUsed - b.lastUsed);

    // Delete the oldest threads that exceed the limit
    const toRemove = chatWithTimes.length - this.config.maxThreadsPerUser;
    if (toRemove > 0) {
      const chatsToRemove = chatWithTimes.slice(0, toRemove).map(c => c.chatId);

      // Delete these chats from the user
      this.users.set(userId, userChats.filter(chatId => !chatsToRemove.includes(chatId)));

      // We don't delete the threads from this.threads to allow other users to access them if necessary
      // They are only removed from the association with this specific user
      logger.debug(`ChatThreadSystem: Deleted ${toRemove} old threads for user ${userId}`);
    }
  }

  /**
   * Sends a complete conversation context to a thread
   * @param {string} chatId - ID of the associated chat
   * @param {Object} context - Context with messages and product details
   * @returns {Promise<boolean>} - True if sent successfully
   */
  async sendConversationToThread(chatId, context) {
    try {
      // First get or create a thread
      const { threadId } = await this.getOrCreateThread(chatId, context.userId);

      if (!threadId) {
        throw new Error('Could not obtain a valid thread ID');
      }

      // Prepare messages for OpenAI (we reuse MessageUtils)
      const preparedMessages = await window.MessageUtils.prepareMessageContent(context);

      if (!preparedMessages || !preparedMessages.length) {
        throw new Error('Could not prepare valid messages from the context');
      }

      logger.debug(`ChatThreadSystem: Sending ${preparedMessages.length} messages to thread ${threadId}`);

      // Use MessageChunker to send the messages (automatically handles splitting)
      let success;
      if (this.threadManager && typeof this.threadManager.sendConversationInChunks === 'function') {
        success = await this.threadManager.sendConversationInChunks(preparedMessages, threadId);
      } else if (window.MessageChunker) {
        success = await window.MessageChunker.sendConversationInChunks(preparedMessages, threadId, this.apiClient);
      } else {
        success = await window.sendConversationInChunks(preparedMessages, threadId, this.apiClient);
      }

      // Update statistics
      if (success) {
        this.statistics.messagesProcessed += preparedMessages.length;

        // Update last used timestamp of the thread
        const thread = this.threads.get(chatId);
        if (thread) {
          thread.lastUsed = Date.now();
          this.saveThreads();
        }

        logger.log(`ChatThreadSystem: Conversation sent successfully to thread ${threadId}`);
      } else {
        logger.error(`ChatThreadSystem: Error sending conversation to thread ${threadId}`);
      }

      return success;
    } catch (error) {
      logger.error(`Error sending conversation: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Runs an assistant on a thread and gets the response
   * @param {string} chatId - Chat ID
   * @param {string} assistantId - ID of the assistant to run
   * @returns {Promise<string>} - Assistant's response
   */
  async runAssistant(chatId, assistantId) {
    try {
      // Verify parameters
      if (!chatId) throw new Error('chatId is required');
      if (!assistantId) throw new Error('assistantId is required');

      // Get the thread associated with this chat
      const threadInfo = this.threads.get(chatId);
      if (!threadInfo || !threadInfo.threadId) {
        throw new Error(`There is no active thread for chat ${chatId}`);
      }

      const threadId = threadInfo.threadId;

      // Run assistant using ThreadManager
      logger.log(`ChatThreadSystem: Running assistant ${assistantId} on thread ${threadId}`);
      const response = await this.threadManager.runAssistant(threadId, assistantId);

      // Update last used data
      threadInfo.lastUsed = Date.now();
      this.saveThreads();

      return response;
    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Generates a complete response using the context and role
   * @param {Object} context - Context with messages, product details, and role
   * @returns {Promise<string>} - Generated response
   */
  async generateResponse(context) {
    try {
      if (!context || !context.chatId) {
        throw new Error('A context with chatId is required');
      }

      const chatId = context.chatId;
      const role = context.role || 'default';

      // Step 1: Send the complete conversation to the thread
      await this.sendConversationToThread(chatId, context);

      // Step 2: Determine which assistant to use according to the role
      let assistantId;
      if (window.openaiManager && typeof window.openaiManager.getAssistantIdForRole === 'function') {
        assistantId = window.openaiManager.getAssistantIdForRole(role);
      } else {
        // Fallback to the configuration
        const assistants = window.CONFIG?.AI?.assistants || {};
        assistantId = assistants[role]?.id || assistants.default?.id;
      }

      if (!assistantId) {
        throw new Error(`No valid assistantId found for role "${role}"`);
      }

      // Step 3: Run the assistant and get the response
      const response = await this.runAssistant(chatId, assistantId);

      return response;
    } catch (error) {
      logger.error(`Error generating response: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Gets statistics about system usage
   * @returns {Object} - Collected statistics
   */
  getStatistics() {
    const stats = {
      ...this.statistics,
      currentActiveThreads: this.threads.size,
      uniqueUsers: this.users.size,
      threadsPerUser: {}
    };

    // Calculate threads per user
    this.users.forEach((chatIds, userId) => {
      stats.threadsPerUser[userId] = chatIds.length;
    });

    return stats;
  }

  /**
   * Deletes a specific thread
   * @param {string} chatId - ID of the chat whose thread will be deleted
   * @returns {boolean} - True if deleted successfully
   */
  removeThread(chatId) {
    if (!this.threads.has(chatId)) {
      return false;
    }

    const threadInfo = this.threads.get(chatId);
    this.threads.delete(chatId);

    // Delete references in users
    for (const [userId, chatIds] of this.users.entries()) {
      const updatedChatIds = chatIds.filter(id => id !== chatId);
      if (updatedChatIds.length !== chatIds.length) {
        this.users.set(userId, updatedChatIds);
      }
    }

    this.statistics.activeThreads = this.threads.size;
    this.saveThreads();

    logger.log(`ChatThreadSystem: Thread ${threadInfo.threadId} deleted for chat ${chatId}`);
    return true;
  }
}

// Create instance and expose globally
(() => {
  try {
    const chatThreadSystem = new ChatThreadSystem();
    window.chatThreadSystem = chatThreadSystem;

    // Try to initialize again if it fails the first time
    if (!chatThreadSystem.initialized) {
      // Wait a bit to allow the other modules to load
      setTimeout(() => {
        if (!chatThreadSystem.initialized) {
          logger.debug('Retrying ChatThreadSystem initialization...');
          chatThreadSystem.initialize();
        }
      }, 2000);
    }
  } catch (error) {
    logger.error(`Error creating ChatThreadSystem: ${error.message}`);
  }
})();
