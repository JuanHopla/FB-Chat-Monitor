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
      logger.debug('ThreadStore initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize ThreadStore', {}, error);
      return false;
    }
  }

  /**
   * Gets thread info for a Facebook thread ID
   * @param {string} fbThreadId - Facebook thread ID
   * @returns {Object|null} Thread info or null if not found
   */
  getThreadInfo(fbThreadId) {
    console.log(`[ThreadStore][DEBUG] Buscando info para thread: ${fbThreadId}`);
    const threadInfo = this.threads.get(fbThreadId);
    
    // Update last accessed time if found
    if (threadInfo) {
      console.log(`[ThreadStore][DEBUG] Thread encontrado: ${JSON.stringify(threadInfo)}`);
      threadInfo.lastAccessed = Date.now();
      this.threads.set(fbThreadId, threadInfo);
    } else {
      console.log(`[ThreadStore][DEBUG] Thread no encontrado: ${fbThreadId}`);
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
    console.log(`[ThreadStore][DEBUG] Creando nuevo thread info: ${fbThreadId} -> ${openaiThreadId}, role: ${chatRole}`);
    const threadInfo = {
      openaiThreadId,
      chatRole,
      lastMessageId: null,
      lastAccessed: Date.now(),
      createdAt: Date.now()
    };
    
    this.threads.set(fbThreadId, threadInfo);
    this.saveThreads();
    console.log(`[ThreadStore][DEBUG] Thread info creado y guardado`);
    
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
    console.log(`[ThreadStore][DEBUG] Actualizando lastMessageId para ${fbThreadId}: ${lastMessageId}`);
    const threadInfo = this.threads.get(fbThreadId);
    
    if (!threadInfo) {
      console.log(`[ThreadStore][WARN] Thread info no encontrado para ${fbThreadId}, no se puede actualizar`);
      logger.warn(`Thread info not found for ${fbThreadId}`);
      return false;
    }
    
    threadInfo.lastMessageId = lastMessageId;
    threadInfo.lastAccessed = timestamp;
    this.threads.set(fbThreadId, threadInfo);
    this.saveThreads();
    console.log(`[ThreadStore][DEBUG] lastMessageId actualizado`);
    
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
        logger.debug(`Loaded ${this.threads.size} threads from storage`);
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
    logger.debug(`Thread cleanup scheduled every ${this.threadCleanupInterval / 1000} seconds`);
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
      logger.debug(`Cleaned up ${removedCount} expired threads`);
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
