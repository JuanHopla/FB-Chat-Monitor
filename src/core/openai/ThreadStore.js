/**
 * Thread Store - "The Librarian"
 * 
 * Responsibilities:
 * - Store mappings between Facebook thread IDs and OpenAI thread IDs
 * - Manage thread metadata
 * - Handle persistence of thread information
 */

class ThreadStore {
  constructor() {
    this.threads = new Map(); // fbThreadId -> { openaiThreadId, lastMessageId, chatRole, lastAccessed }
    this.initialized = false;
    this.storageKey = 'FB_CHAT_MONITOR_THREADS';
    this.threadCleanupInterval = window.CONFIG?.threadSystem?.general?.threadCleanupInterval || 15 * 60 * 1000; // 15 min default
    this.threadTTL = window.CONFIG?.threadSystem?.general?.threadTTL || 2 * 60 * 60 * 1000; // 2 hours default
    this.maxThreadAge = window.CONFIG?.threadSystem?.general?.threadInfoMaxAge || 30 * 24 * 60 * 60 * 1000; // 30 days default
  }

  /**
   * Initializes the thread store
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Load stored threads
      this.loadThreads();
      
      // Start periodic cleanup
      this.startCleanupInterval();
      
      this.initialized = true;
      if (window.CONFIG?.debug) {
        logger.debug('ThreadStore initialized successfully');
      }
      return true;
    } catch (error) {
      logger.error('Failed to initialize ThreadStore', {}, error);
      return false;
    }
  }

/**
   * Gets thread info for a Facebook thread ID
   * @param {string} fbThreadId - Facebook thread ID
   * @param {boolean} forceReload - Whether to force reload from storage first
   * @returns {Object|null} Thread info or null if not found
   */
  getThreadInfo(fbThreadId, forceReload = false) {
    if (window.CONFIG?.debug) {
      console.debug(`[ThreadStore][DEBUG] Looking for info for thread: ${fbThreadId}`);
    }
    
    // If forced reload is requested or the store is not initialized, load from storage
    if (forceReload || !this.initialized) {
      this.loadThreads();
    }
    
  const threadInfo = this.threads.get(fbThreadId);
  if (window.flowLogger) window.flowLogger.step('GENERATION', 'THREAD_CHECK', { chatId: fbThreadId, exists: !!threadInfo });
    
    // Update last accessed time if found
    if (threadInfo) {
      if (window.CONFIG?.debug) {
        console.debug(`[ThreadStore][DEBUG] Thread found: ${JSON.stringify(threadInfo)}`);
      }
      threadInfo.lastAccessed = Date.now();
      this.threads.set(fbThreadId, threadInfo);
    } else {
      if (window.CONFIG?.debug) {
        console.debug(`[ThreadStore][DEBUG] Thread not found: ${fbThreadId}`);
      }
    }
    
    return threadInfo || null;
  }

  /**
   * Creates thread info and stores it
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} openaiThreadId - OpenAI thread ID
   * @param {string} chatRole - Role (seller or buyer)
   * @returns {Object} Thread info
   */
  createThreadInfo(fbThreadId, openaiThreadId, chatRole) {
    if (window.CONFIG?.debug) {
      console.debug(`[ThreadStore][DEBUG] Creating new thread info: ${fbThreadId} -> ${openaiThreadId}, role: ${chatRole}`);
    }
    
    const threadInfo = {
      openaiThreadId,
      chatRole,
      lastMessageId: null,
      lastAccessed: Date.now(),
      createdAt: Date.now()
    };
    
    this.threads.set(fbThreadId, threadInfo);
    this.saveThreads();
    
    if (window.CONFIG?.debug) {
      console.debug(`[ThreadStore][DEBUG] Thread info created and saved`);
    }
    
    if (window.flowLogger) {
      window.flowLogger.step('GENERATION', 'THREAD_NEW', { chatId: fbThreadId });
      window.flowLogger.step('GENERATION', 'THREAD_CREATED', { openaiThreadId });
      window.flowLogger.step('GENERATION', 'ROLE_SET', { role: chatRole });
    }
    
    return threadInfo;
  }

  /**
   * Updates the last message ID for a thread
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} lastMessageId - Last message ID
   * @param {number} [timestamp=Date.now()] - Timestamp
   * @returns {boolean} Success status
   */
  updateLastMessage(fbThreadId, lastMessageId, timestamp = Date.now()) {
    if (window.CONFIG?.debug) {
      console.debug(`[ThreadStore][DEBUG] Updating lastMessageId for ${fbThreadId}: ${lastMessageId}`);
    }
    
    const threadInfo = this.threads.get(fbThreadId);
    
    if (!threadInfo) {
      if (window.CONFIG?.debug) {
        console.debug(`[ThreadStore][WARN] Thread info not found for ${fbThreadId}, cannot update`);
      }
      logger.warn(`Thread info not found for ${fbThreadId}`);
      return false;
    }
    
    threadInfo.lastMessageId = lastMessageId;
    threadInfo.lastAccessed = timestamp;
    this.threads.set(fbThreadId, threadInfo);
    this.saveThreads();
    
    if (window.CONFIG?.debug) {
      console.debug(`[ThreadStore][DEBUG] lastMessageId updated`);
    }
    
  if (window.flowLogger) window.flowLogger.step('GENERATION', 'LAST_MESSAGE_UPDATED', { lastMessageId });
    
    return true;
  }

  /**
   * Loads threads from storage
   * @private
   */
  loadThreads() {
    try {
      let threadsData;
      
      // Try to use storageManager if available
      if (window.storageManager) {
        threadsData = window.storageManager.get(this.storageKey);
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          threadsData = JSON.parse(stored);
        }
      }
      
      if (threadsData) {
        this.threads = new Map(Object.entries(threadsData));
        if (window.CONFIG?.debug) {
          logger.debug(`Loaded ${this.threads.size} threads from storage`);
        }
      }
    } catch (error) {
      logger.error('Error loading threads from storage', {}, error);
    }
  }

  /**
   * Saves threads to storage
   * @private
   */
  saveThreads() {
    try {
      // Convert Map to plain object
      const threadsObj = Object.fromEntries(this.threads);
      
      // Try to use storageManager if available
      if (window.storageManager) {
        window.storageManager.set(this.storageKey, threadsObj);
      } else {
        // Fallback to localStorage
        localStorage.setItem(this.storageKey, JSON.stringify(threadsObj));
      }
    } catch (error) {
      logger.error('Error saving threads to storage', {}, error);
    }
  }

  /**
   * Starts periodic cleanup of old threads
   * @private
   */
  startCleanupInterval() {
    setInterval(() => this.cleanupOldThreads(), this.threadCleanupInterval);
    if (window.CONFIG?.debug) {
      logger.debug(`Thread cleanup scheduled every ${this.threadCleanupInterval / 1000} seconds`);
    }
  }

  /**
   * Removes threads that haven't been accessed recently
   * @private
   */
  cleanupOldThreads() {
    const now = Date.now();
    let removedCount = 0;
    
    // Find expired threads
    for (const [fbThreadId, threadInfo] of this.threads.entries()) {
      // Remove threads that haven't been accessed recently or are too old
      const timeSinceLastAccess = now - threadInfo.lastAccessed;
      const timeSinceCreation = now - (threadInfo.createdAt || threadInfo.lastAccessed);
      
      if (timeSinceLastAccess > this.threadTTL || timeSinceCreation > this.maxThreadAge) {
        this.threads.delete(fbThreadId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      if (window.CONFIG?.debug) {
        logger.debug(`Cleaned up ${removedCount} expired threads`);
      }
      this.saveThreads();
    }
  }
  
  /**
   * Checks if a thread exists for a Facebook thread ID
   * @param {string} fbThreadId - Facebook thread ID
   * @returns {boolean} Whether the thread exists
   */
  hasThread(fbThreadId) {
    return this.threads.has(fbThreadId);
  }
  
  /**
   * Gets all stored thread IDs
   * @returns {string[]} Array of Facebook thread IDs
   */
  getAllThreadIds() {
    return [...this.threads.keys()];
  }
  
  /**
   * Gets thread stats (count, oldest, newest)
   * @returns {Object} Thread stats
   */
  getThreadStats() {
    const threadCount = this.threads.size;
    let oldestThread = null;
    let newestThread = null;
    
    for (const [, threadInfo] of this.threads.entries()) {
      const createdAt = threadInfo.createdAt || threadInfo.lastAccessed;
      
      if (!oldestThread || createdAt < oldestThread) {
        oldestThread = createdAt;
      }
      
      if (!newestThread || createdAt > newestThread) {
        newestThread = createdAt;
      }
    }
    
    return {
      count: threadCount,
      oldest: oldestThread ? new Date(oldestThread).toISOString() : null,
      newest: newestThread ? new Date(newestThread).toISOString() : null
    };
  }
}

// Create global singleton instance
const threadStore = new ThreadStore();

// Expose globally
window.threadStore = threadStore;
