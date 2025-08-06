/**
 * Storage System - "The Keeper"
 * 
 * Responsibilities:
 * - Provide a unified API for local storage
 * - Abstract differences between localStorage and GM_setValue/GM_getValue
 * - Handle persistence of structured data
 * - Handle migration of legacy data
 */

class StorageManager {
  constructor() {
    this.prefix = 'FB_CHAT_MONITOR_';
    this.hasGMStorage = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
    this.initialized = false;
    this.keysMetadata = new Map(); // Tracks metadata for each key
    this.dataChangeListeners = new Map(); // Event listeners for data changes
  }

  /**
   * Initializes the storage system
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Check if migration needed
      const migrationCompleted = this.get('MIGRATION_COMPLETED', false);
      if (!migrationCompleted) {
        await this.migrateSettings();
        this.set('MIGRATION_COMPLETED', true);
      }
      
      // Load metadata for keys
      this.loadKeyMetadata();
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[StorageManager] Initialization error:', error);
      return false;
    }
  }

  /**
   * Gets a value from storage
   * @param {string} key - Key to retrieve
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Stored value or default
   */
  get(key, defaultValue = null) {
    const fullKey = this.prefix + key;
    
    try {
      // Use GM_getValue if available
      if (this.hasGMStorage) {
        const value = GM_getValue(fullKey);
        return value !== undefined ? value : defaultValue;
      }
      
      // Fall back to localStorage
      const storedValue = localStorage.getItem(fullKey);
      if (storedValue === null) return defaultValue;
      
      // Try to parse as JSON
      try {
        return JSON.parse(storedValue);
      } catch (e) {
        // If not JSON, return as string
        return storedValue;
      }
    } catch (error) {
      console.error(`[StorageManager] Error retrieving ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Sets a value in storage
   * @param {string} key - Key to store
   * @param {*} value - Value to store
   * @param {Object} options - Additional options
   * @returns {boolean} True if successful
   */
  set(key, value, options = {}) {
    const fullKey = this.prefix + key;
    
    try {
      // Update metadata
      this.updateKeyMetadata(key, value, options);
      
      // Use GM_setValue if available
      if (this.hasGMStorage) {
        GM_setValue(fullKey, value);
      } else {
        // Fall back to localStorage with JSON conversion for objects
        const storedValue = typeof value === 'object' ? JSON.stringify(value) : value;
        localStorage.setItem(fullKey, storedValue);
      }
      
      // Notify listeners
      this.notifyListeners(key, value);
      
      return true;
    } catch (error) {
      console.error(`[StorageManager] Error storing ${key}:`, error);
      return false;
    }
  }

  /**
   * Removes a key from storage
   * @param {string} key - Key to remove
   * @returns {boolean} True if successful
   */
  remove(key) {
    const fullKey = this.prefix + key;
    
    try {
      // Use GM_deleteValue if available
      if (this.hasGMStorage && typeof GM_deleteValue === 'function') {
        GM_deleteValue(fullKey);
      } else {
        // Fall back to localStorage
        localStorage.removeItem(fullKey);
      }
      
      // Remove metadata
      this.keysMetadata.delete(key);
      
      // Notify listeners
      this.notifyListeners(key, undefined, true);
      
      return true;
    } catch (error) {
      console.error(`[StorageManager] Error removing ${key}:`, error);
      return false;
    }
  }

  /**
   * Updates or creates metadata for a key
   * @param {string} key - Key to update
   * @param {*} value - Value being stored
   * @param {Object} options - Additional options
   */
  updateKeyMetadata(key, value, options) {
    // Get existing metadata or create new
    let metadata = this.keysMetadata.get(key) || {};
    
    // Update metadata
    metadata = {
      ...metadata,
      lastUpdated: Date.now(),
      type: typeof value,
      size: this.estimateSize(value),
      ttl: options.ttl || metadata.ttl
    };
    
    // Store metadata
    this.keysMetadata.set(key, metadata);
    
    // Periodically save all metadata
    if (!this._metadataSaveTimeout) {
      this._metadataSaveTimeout = setTimeout(() => {
        this.saveKeyMetadata();
        this._metadataSaveTimeout = null;
      }, 5000);
    }
  }

  /**
   * Saves key metadata to storage
   */
  saveKeyMetadata() {
    try {
      // Convert Map to Object for storage
      const metadataObj = {};
      this.keysMetadata.forEach((value, key) => {
        metadataObj[key] = value;
      });
      
      // Save to storage without triggering more metadata updates
      const fullKey = this.prefix + '_KEYS_METADATA';
      
      if (this.hasGMStorage) {
        GM_setValue(fullKey, metadataObj);
      } else {
        localStorage.setItem(fullKey, JSON.stringify(metadataObj));
      }
    } catch (error) {
      console.error('[StorageManager] Error saving metadata:', error);
    }
  }

  /**
   * Loads key metadata from storage
   */
  loadKeyMetadata() {
    try {
      // Load from storage
      const fullKey = this.prefix + '_KEYS_METADATA';
      let metadataObj;
      
      if (this.hasGMStorage) {
        metadataObj = GM_getValue(fullKey);
      } else {
        const storedValue = localStorage.getItem(fullKey);
        metadataObj = storedValue ? JSON.parse(storedValue) : null;
      }
      
      // Convert to Map
      if (metadataObj) {
        this.keysMetadata = new Map(Object.entries(metadataObj));
      }
    } catch (error) {
      console.error('[StorageManager] Error loading metadata:', error);
    }
  }

  /**
   * Migrates settings from legacy storage
   * @returns {Promise<boolean>} True if successful
   */
  async migrateSettings() {
    try {
      // List of legacy keys to migrate
      const legacyKeys = [
        { old: 'FB_CHAT_MONITOR_OPENAI_KEY', new: 'API_KEY' },
        { old: 'FB_CHAT_MONITOR_AI_MODEL', new: 'AI_MODEL' },
        { old: 'FB_CHAT_MONITOR_OPERATION_MODE', new: 'OPERATION_MODE' },
        { old: 'FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', new: 'SELLER_ASSISTANT_ID' },
        { old: 'FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', new: 'BUYER_ASSISTANT_ID' },
        { old: 'FB_CHAT_MONITOR_LOGS', new: 'LOGS' },
        { old: 'FB_CHAT_MONITOR_STATS', new: 'STATS' }
      ];
      
      // Additional legacy keys from localStorage not prefixed
      const unprefixedKeys = [
        { old: 'openAI_key', new: 'API_KEY' },
        { old: 'operation_mode', new: 'OPERATION_MODE' },
        { old: 'ai_model', new: 'AI_MODEL' }
      ];
      
      // First migrate keys with proper prefix
      for (const keyPair of legacyKeys) {
        // Check localStorage directly
        const oldValue = localStorage.getItem(keyPair.old);
        if (oldValue !== null && this.get(keyPair.new) === null) {
          // Parse JSON if possible
          let parsedValue;
          try {
            parsedValue = JSON.parse(oldValue);
          } catch (e) {
            parsedValue = oldValue;
          }
          
          // Store with new key
          this.set(keyPair.new, parsedValue);
          console.log(`[StorageManager] Migrated ${keyPair.old} to ${this.prefix}${keyPair.new}`);
        }
      }
      
      // Then check for unprefixed keys
      for (const keyPair of unprefixedKeys) {
        const oldValue = localStorage.getItem(keyPair.old);
        if (oldValue !== null && this.get(keyPair.new) === null) {
          let parsedValue;
          try {
            parsedValue = JSON.parse(oldValue);
          } catch (e) {
            parsedValue = oldValue;
          }
          
          this.set(keyPair.new, parsedValue);
          console.log(`[StorageManager] Migrated unprefixed ${keyPair.old} to ${this.prefix}${keyPair.new}`);
        }
      }
      
      // Migrate assistants configuration if it exists
      try {
        const sellerAssistant = localStorage.getItem('FB_CHAT_MONITOR_SELLER_ASSISTANT');
        const buyerAssistant = localStorage.getItem('FB_CHAT_MONITOR_BUYER_ASSISTANT');
        
        if (sellerAssistant || buyerAssistant) {
          const assistantsConfig = {
            seller: sellerAssistant ? JSON.parse(sellerAssistant) : null,
            buyer: buyerAssistant ? JSON.parse(buyerAssistant) : null
          };
          
          this.set('ASSISTANTS', assistantsConfig);
          console.log('[StorageManager] Migrated assistants configuration');
        }
      } catch (assistantError) {
        console.error('[StorageManager] Error migrating assistants:', assistantError);
      }
      
      return true;
    } catch (error) {
      console.error('[StorageManager] Migration error:', error);
      return false;
    }
  }

  /**
   * Adds a listener for data changes
   * @param {string} key - Key to listen for (or '*' for all)
   * @param {Function} callback - Callback function
   * @returns {string} Listener ID for removal
   */
  addChangeListener(key, callback) {
    const listenerId = `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!this.dataChangeListeners.has(key)) {
      this.dataChangeListeners.set(key, new Map());
    }
    
    this.dataChangeListeners.get(key).set(listenerId, callback);
    return listenerId;
  }

  /**
   * Removes a data change listener
   * @param {string} key - Key the listener was registered for
   * @param {string} listenerId - Listener ID to remove
   * @returns {boolean} True if removed
   */
  removeChangeListener(key, listenerId) {
    if (!this.dataChangeListeners.has(key)) return false;
    
    return this.dataChangeListeners.get(key).delete(listenerId);
  }

  /**
   * Notifies listeners of data changes
   * @param {string} key - Key that changed
   * @param {*} newValue - New value
   * @param {boolean} wasRemoved - Whether the key was removed
   */
  notifyListeners(key, newValue, wasRemoved = false) {
    // Notify specific key listeners
    if (this.dataChangeListeners.has(key)) {
      this.dataChangeListeners.get(key).forEach(callback => {
        try {
          callback(key, newValue, wasRemoved);
        } catch (error) {
          console.error(`[StorageManager] Error in listener for ${key}:`, error);
        }
      });
    }
    
    // Notify wildcard listeners
    if (this.dataChangeListeners.has('*')) {
      this.dataChangeListeners.get('*').forEach(callback => {
        try {
          callback(key, newValue, wasRemoved);
        } catch (error) {
          console.error(`[StorageManager] Error in wildcard listener for ${key}:`, error);
        }
      });
    }
  }

  /**
   * Gets all keys in storage
   * @returns {string[]} Array of keys
   */
  getAllKeys() {
    const keys = [];
    
    try {
      // Use GM_listValues if available
      if (this.hasGMStorage && typeof GM_listValues === 'function') {
        const allKeys = GM_listValues();
        for (const fullKey of allKeys) {
          if (fullKey.startsWith(this.prefix)) {
            keys.push(fullKey.substring(this.prefix.length));
          }
        }
      } else {
        // Use localStorage
        for (let i = 0; i < localStorage.length; i++) {
          const fullKey = localStorage.key(i);
          if (fullKey && fullKey.startsWith(this.prefix)) {
            keys.push(fullKey.substring(this.prefix.length));
          }
        }
      }
    } catch (error) {
      console.error('[StorageManager] Error listing keys:', error);
    }
    
    return keys;
  }

  /**
   * Estimates the size of a value in bytes
   * @param {*} value - Value to estimate
   * @returns {number} Estimated size in bytes
   */
  estimateSize(value) {
    try {
      if (value === undefined || value === null) return 0;
      
      if (typeof value === 'string') return value.length * 2; // UTF-16
      if (typeof value === 'number') return 8;
      if (typeof value === 'boolean') return 4;
      
      // For objects, arrays, etc.
      const json = JSON.stringify(value);
      return json.length * 2; // UTF-16
    } catch (error) {
      return 0; // Fallback
    }
  }

  /**
   * Checks storage health
   * @returns {Object} Health report
   */
  checkStorageHealth() {
    const report = {
      available: {
        localStorage: !!window.localStorage,
        GMStorage: this.hasGMStorage
      },
      storageType: this.hasGMStorage ? 'GM_Storage' : 'localStorage',
      keys: [],
      totalSize: 0,
      errors: []
    };
    
    try {
      // Check localStorage
      if (report.available.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            try {
              const value = localStorage.getItem(key);
              const size = value ? value.length : 0;
              report.keys.push({ key, source: 'localStorage', size });
              report.totalSize += size;
            } catch (e) {
              report.errors.push({ key, source: 'localStorage', error: e.message });
            }
          }
        }
      }
      
      // Check GM_Storage
      if (report.available.GMStorage && typeof GM_listValues === 'function') {
        const gmKeys = GM_listValues();
        for (const key of gmKeys) {
          if (key.startsWith(this.prefix)) {
            try {
              const value = GM_getValue(key);
              const size = typeof value === 'string' 
                ? value.length 
                : JSON.stringify(value).length;
                
              report.keys.push({ key, source: 'GM_Storage', size });
              report.totalSize += size;
            } catch (e) {
              report.errors.push({ key, source: 'GM_Storage', error: e.message });
            }
          }
        }
      }
      
      // Check for quota issues
      if (report.available.localStorage) {
        try {
          // Try to detect quota
          const testKey = `${this.prefix}QUOTA_TEST`;
          const testString = 'A'.repeat(1024); // 1KB
          let i = 0;
          
          // Already stored previous test data?
          localStorage.removeItem(testKey);
          
          try {
            // Test progressively larger strings until we hit an error
            for (i = 1; i <= 10; i++) {
              localStorage.setItem(testKey, testString.repeat(i * 100)); // 100KB increments
            }
          } catch (e) {
            report.quotaError = e.message;
            report.estimatedQuota = i * 100 * 1024; // Convert to bytes
          } finally {
            localStorage.removeItem(testKey);
          }
        } catch (e) {
          report.errors.push({
            source: 'quota_test',
            error: e.message
          });
        }
      }
    } catch (error) {
      report.errors.push({
        source: 'general',
        error: error.message
      });
    }
    
    return report;
  }
  
  /**
   * Clears all storage keys with our prefix
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    try {
      const keys = this.getAllKeys();
      
      for (const key of keys) {
        this.remove(key);
      }
      
      return true;
    } catch (error) {
      console.error('[StorageManager] Error clearing storage:', error);
      return false;
    }
  }
}

// Create global singleton instance
const storageManager = new StorageManager();

// Expose globally with multiple names for compatibility
window.storageManager = storageManager;
window.storageUtils = storageManager;
