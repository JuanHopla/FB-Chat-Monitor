/**
 * Thread Store - "The Archivist"
 * 
 * Responsibilities:
 * - Map Facebook chat IDs to OpenAI thread IDs
 * - Store and retrieve thread metadata
 * - Update thread state after operations
 * - Provide persistence between sessions
 */

class ThreadStore {
  constructor() {
    this.storagePrefix = 'FB_THREAD_';
    this.threads = new Map(); // In-memory cache
    this.initialized = false;
  }

  /**
   * Initializes the thread store
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      console.log('Initializing ThreadStore');
      
      // Load existing threads from storage
      await this.loadFromStorage();
      
      this.initialized = true;
      console.log(`ThreadStore initialized with ${this.threads.size} threads`);
      return true;
    } catch (error) {
      logger.error('Failed to initialize ThreadStore', {}, error);
      return false;
    }
  }

  /**
   * Gets thread info for a Facebook thread ID
   * @param {string} fbThreadId - Facebook thread ID
   * @returns {Object|null} Thread metadata or null if not found
   */
  getThreadInfo(fbThreadId) {
    if (!fbThreadId) {
      logger.error('Invalid fbThreadId provided to getThreadInfo');
      return null;
    }

    // Check the in-memory cache first
    if (this.threads.has(fbThreadId)) {
      return this.threads.get(fbThreadId);
    }
    
    // If not in cache, try loading from storage
    const threadKey = this.getStorageKey(fbThreadId);
    let threadInfo = null;
    
    // Try to get from storageManager first (preferred)
    if (window.storageManager && typeof window.storageManager.get === 'function') {
      threadInfo = window.storageManager.get(threadKey);
    }
    
    // Fall back to localStorage
    if (!threadInfo) {
      const rawInfo = localStorage.getItem(threadKey);
      if (rawInfo) {
        try {
          threadInfo = JSON.parse(rawInfo);
        } catch (e) {
          logger.error(`Error parsing thread info for ${fbThreadId}`, {}, e);
        }
      }
    }
    
    // Update cache if found
    if (threadInfo) {
      this.threads.set(fbThreadId, threadInfo);
    }
    
    return threadInfo;
  }

  /**
   * Saves thread info to storage
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Object} metadata - Thread metadata to save
   * @returns {boolean} Success status
   */
  saveThreadInfo(fbThreadId, metadata) {
    if (!fbThreadId || !metadata || !metadata.openaiThreadId) {
      logger.error('Invalid data for saveThreadInfo', { fbThreadId, metadata });
      return false;
    }
    
    try {
      // Update in-memory cache
      this.threads.set(fbThreadId, metadata);
      
      // Save to storage
      const threadKey = this.getStorageKey(fbThreadId);
      const threadData = JSON.stringify(metadata);
      
      // Try to use storageManager first
      if (window.storageManager && typeof window.storageManager.set === 'function') {
        window.storageManager.set(threadKey, metadata);
      } else {
        // Fall back to localStorage
        localStorage.setItem(threadKey, threadData);
      }
      
      console.log(`Thread info saved for ${fbThreadId}`);
      return true;
    } catch (error) {
      logger.error(`Error saving thread info for ${fbThreadId}`, {}, error);
      return false;
    }
  }

  /**
   * Updates the last message info for a thread
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} messageId - New last message ID
   * @param {number} timestamp - New last message timestamp
   * @returns {boolean} Success status
   */
  updateLastMessage(fbThreadId, messageId, timestamp) {
    if (!fbThreadId || !messageId) {
      logger.error('Invalid data for updateLastMessage', { fbThreadId, messageId, timestamp });
      return false;
    }
    
    // Get current thread info
    const threadInfo = this.getThreadInfo(fbThreadId);
    if (!threadInfo) {
      logger.error(`Thread info not found for ${fbThreadId}`);
      return false;
    }
    
    // Update last message data
    threadInfo.lastMessageId = messageId;
    
    // Update timestamp if provided
    if (timestamp) {
      threadInfo.lastTimestamp = timestamp;
    } else {
      threadInfo.lastTimestamp = Date.now();
    }
    
    // Save updated info
    return this.saveThreadInfo(fbThreadId, threadInfo);
  }

  /**
   * Creates thread info for a new thread
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} openaiThreadId - OpenAI thread ID
   * @param {string} chatRole - Chat role (seller or buyer)
   * @param {string} lastMessageId - Initial last message ID (optional)
   * @returns {Object} Created thread info
   */
  createThreadInfo(fbThreadId, openaiThreadId, chatRole, lastMessageId = null) {
    if (!fbThreadId || !openaiThreadId || !chatRole) {
      logger.error('Missing required parameters for createThreadInfo');
      throw new Error('Missing required parameters for thread creation');
    }
    
    const threadInfo = {
      openaiThreadId,
      chatRole,
      lastMessageId,
      lastTimestamp: Date.now(),
      created: Date.now()
    };
    
    // Save the new thread info
    const success = this.saveThreadInfo(fbThreadId, threadInfo);
    
    if (!success) {
      throw new Error('Failed to save new thread info');
    }
    
    return threadInfo;
  }

  /**
   * Loads all threads from storage into memory
   * @private
   */
  async loadFromStorage() {
    try {
      // Clear existing cache
      this.threads.clear();
      
      // Try to use storageManager first to get all keys
      if (window.storageManager && typeof window.storageManager.getAllKeys === 'function') {
        const allKeys = window.storageManager.getAllKeys() || [];
        
        // Filter thread keys
        const threadKeys = allKeys.filter(key => key.startsWith(this.storagePrefix));
        
        // Load each thread
        for (const key of threadKeys) {
          const threadData = window.storageManager.get(key);
          if (threadData) {
            const fbThreadId = key.substring(this.storagePrefix.length);
            this.threads.set(fbThreadId, threadData);
          }
        }
      } 
      // Fall back to localStorage
      else {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.storagePrefix)) {
            try {
              const rawData = localStorage.getItem(key);
              if (rawData) {
                const threadData = JSON.parse(rawData);
                const fbThreadId = key.substring(this.storagePrefix.length);
                this.threads.set(fbThreadId, threadData);
              }
            } catch (e) {
              logger.error(`Error parsing thread data for key ${key}`, {}, e);
            }
          }
        }
      }
      
      console.log(`Loaded ${this.threads.size} threads from storage`);
    } catch (error) {
      logger.error('Error loading threads from storage', {}, error);
    }
  }

  /**
   * Gets storage key for a Facebook thread ID
   * @param {string} fbThreadId - Facebook thread ID
   * @returns {string} Storage key
   * @private
   */
  getStorageKey(fbThreadId) {
    return `${this.storagePrefix}${fbThreadId}`;
  }

  /**
   * Gets all known thread IDs
   * @returns {string[]} Array of Facebook thread IDs
   */
  getAllThreadIds() {
    return Array.from(this.threads.keys());
  }

  /**
   * Gets thread statistics
   * @returns {Object} Statistics about threads
   */
  getStats() {
    const stats = {
      totalThreads: this.threads.size,
      roles: {
        seller: 0,
        buyer: 0,
        unknown: 0
      },
      averageAge: 0
    };
    
    let totalAge = 0;
    const now = Date.now();
    
    this.threads.forEach(thread => {
      if (thread.chatRole === 'seller') {
        stats.roles.seller++;
      } else if (thread.chatRole === 'buyer') {
        stats.roles.buyer++;
      } else {
        stats.roles.unknown++;
      }
      
      if (thread.created) {
        totalAge += (now - thread.created);
      }
    });
    
    if (this.threads.size > 0) {
      stats.averageAge = Math.round(totalAge / this.threads.size / (1000 * 60 * 60 * 24)); // In days
    }
    
    return stats;
  }
}

// Create global singleton instance
const threadStore = new ThreadStore();

// Expose globally
window.threadStore = threadStore;
