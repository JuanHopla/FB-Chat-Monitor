// ----- UTILITIES -----

// Enhanced logging system with structured logs
const logger = {
  logs: [],
  maxLogs: 100,
  
  log(message, data = {}) {
    const logEntry = {
      type: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      data
    };
    this._addLog(logEntry);
    console.log(`[FB-Chat-Monitor] ${message}`, data);
  },
  
  debug(message, data = {}) {
    if (CONFIG.debug) {
      const logEntry = {
        type: 'DEBUG',
        timestamp: new Date().toISOString(),
        message,
        data
      };
      this._addLog(logEntry);
      console.log(`[FB-Chat-Monitor][DEBUG] ${message}`, data);
    }
  },
  
  error(message, data = {}, error = null) {
    const logEntry = {
      type: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      data,
      stack: error?.stack || new Error().stack
    };
    this._addLog(logEntry);
    console.error(`[FB-Chat-Monitor][ERROR] ${message}`, data, error);
  },
  
  warn(message, data = {}) {
    const logEntry = {
      type: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      data
    };
    this._addLog(logEntry);
    console.warn(`[FB-Chat-Monitor][WARN] ${message}`, data);
  },
  
  notify(message, type = 'success', options = {}) {
    // Log the notification
    const logEntry = {
      type: 'NOTIFICATION',
      notificationType: type,
      timestamp: new Date().toISOString(),
      message
    };
    this._addLog(logEntry);
    
    // Visual notification
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.right = '20px';
    div.style.padding = '10px 15px';
    div.style.color = 'white';
    div.style.borderRadius = '5px';
    div.style.zIndex = '9999';
    div.style.opacity = '0.9';
    div.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    div.style.fontFamily = 'Arial, sans-serif';
    div.style.fontSize = '14px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.transition = 'all 0.3s ease';
    div.style.maxWidth = '80%';
    div.style.wordBreak = 'break-word';
    
    // Different styles for different notification types
    if (type === 'success') {
      div.style.backgroundColor = '#4CAF50';
      div.innerHTML = `<span style="margin-right:8px;">✓</span>${message}`;
    } else if (type === 'error') {
      div.style.backgroundColor = '#f44336';
      div.innerHTML = `<span style="margin-right:8px;">⚠️</span>${message}`;
    } else if (type === 'warning') {
      div.style.backgroundColor = '#ff9800';
      div.innerHTML = `<span style="margin-right:8px;">⚠</span>${message}`;
    } else if (type === 'info') {
      div.style.backgroundColor = '#2196F3';
      div.innerHTML = `<span style="margin-right:8px;">ℹ</span>${message}`;
    }
    
    // Add close button
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '×';
    closeBtn.style.marginLeft = '10px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.fontSize = '18px';
    closeBtn.onclick = () => document.body.removeChild(div);
    div.appendChild(closeBtn);
    
    document.body.appendChild(div);
    
    // Optional buttons
    if (options.buttons && Array.isArray(options.buttons)) {
      const buttonContainer = document.createElement('div');
      buttonContainer.style.marginTop = '10px';
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '10px';
      
      options.buttons.forEach(btnConfig => {
        if (btnConfig.text && typeof btnConfig.action === 'function') {
          const btn = document.createElement('button');
          btn.textContent = btnConfig.text;
          btn.style.padding = '5px 10px';
          btn.style.border = 'none';
          btn.style.borderRadius = '3px';
          btn.style.cursor = 'pointer';
          btn.style.backgroundColor = btnConfig.color || '#fff';
          btn.style.color = btnConfig.textColor || '#333';
          
          btn.onclick = () => {
            btnConfig.action();
            if (btnConfig.closeOnClick !== false) {
              document.body.removeChild(div);
            }
          };
          
          buttonContainer.appendChild(btn);
        }
      });
      
      div.appendChild(buttonContainer);
    }
    
    // Optional countdown timer
    if (options.timeoutSeconds) {
      const timerSpan = document.createElement('span');
      timerSpan.className = 'countdown';
      timerSpan.textContent = options.timeoutSeconds;
      timerSpan.style.marginLeft = '8px';
      timerSpan.style.padding = '2px 6px';
      timerSpan.style.backgroundColor = 'rgba(255,255,255,0.2)';
      timerSpan.style.borderRadius = '10px';
      div.appendChild(timerSpan);
    }
    
    // Auto-hide after timeout (default: 5 seconds)
    const timeout = options.duration || 5000;
    setTimeout(() => {
      if (document.body.contains(div)) {
        div.style.opacity = '0';
        setTimeout(() => {
          if (document.body.contains(div)) {
            document.body.removeChild(div);
          }
        }, 300);
      }
    }, timeout);
    
    return div;
  },
  
  // Internal method to add a log and maintain log size
  _addLog(logEntry) {
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    // Save logs to storage if enabled
    if (CONFIG.logging && CONFIG.logging.saveLogs) {
      this._saveLogs();
    }
  },
  
  // Save logs to localStorage
  _saveLogs() {
    try {
      localStorage.setItem('FB_CHAT_MONITOR_LOGS', JSON.stringify(this.logs));
    } catch (e) {
      console.error('Error saving logs to localStorage', e);
    }
  },
  
  // Load logs from localStorage
  loadLogs() {
    try {
      const savedLogs = localStorage.getItem('FB_CHAT_MONITOR_LOGS');
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }
    } catch (e) {
      console.error('Error loading logs from localStorage', e);
    }
  },
  
  // Get all logs
  getAllLogs() {
    return [...this.logs];
  },
  
  // Get logs by type
  getLogsByType(type) {
    return this.logs.filter(log => log.type === type);
  },
  
  // Clear all logs
  clearLogs() {
    this.logs = [];
    try {
      localStorage.removeItem('FB_CHAT_MONITOR_LOGS');
    } catch (e) {
      console.error('Error clearing logs from localStorage', e);
    }
  }
};

// Enhanced DOM utility
const domUtils = {
  // Finds an element by selector (supports multiple selectors)
  findElement(selectors, parent = document) {
    // If it's an array of selectors, try them one by one
    if (Array.isArray(selectors)) {
      for (const selector of selectors) {
        try {
          const element = parent.querySelector(selector);
          if (element) return element;
        } catch (e) {
          logger.debug(`Error with selector "${selector}": ${e.message}`);
        }
      }
      return null;
    }
    
    // If it's a single selector
    try {
      return parent.querySelector(selectors);
    } catch (e) {
      logger.debug(`Error with selector "${selectors}": ${e.message}`);
      return null;
    }
  },
  
  // Finds all elements matching a selector
  findAllElements(selector, parent = document) {
    try {
      return [...parent.querySelectorAll(selector)];
    } catch (e) {
      logger.debug(`Error with selector "${selector}": ${e.message}`);
      return [];
    }
  },
  
  // Waits for an element to appear in the DOM with redundant selectors
  waitForElement(selectors, timeout = CONFIG.waitElementTimeout) {
    return new Promise((resolve, reject) => {
      const checkInterval = 100;
      let elapsed = 0;
      
      // Convert to array if it's a single selector
      const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
      
      const check = () => {
        for (const selector of selectorArray) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              resolve(element);
              return;
            }
          } catch (e) {
            // Ignore errors with selectors
          }
        }
        
        elapsed += checkInterval;
        if (elapsed >= timeout) {
          reject(new Error(`Timeout waiting for elements: ${JSON.stringify(selectorArray)}`));
          return;
        }
        
        setTimeout(check, checkInterval);
      };
      
      check();
    });
  },
  
  // Scrolls to the top to load older messages with optimized logic
  scrollToTop(container, maxAttempts = 10) {
    return new Promise((resolve) => {
      let lastScrollHeight = container.scrollHeight;
      let noChangeCount = 0;
      let attempts = 0;
      
      const scrollStep = () => {
        container.scrollTop = 0; // Scroll up
        
        setTimeout(() => {
          attempts++;
          
          // Check if content height changed (new content loaded)
          if (container.scrollHeight === lastScrollHeight) {
            noChangeCount++;
            if (noChangeCount >= 3 || attempts >= maxAttempts) {
              // If no changes after several attempts, assume we've reached the top
              resolve({ success: true, fullyScrolled: true });
              return;
            }
          } else {
            // If height changed, reset the counter and update height
            noChangeCount = 0;
            lastScrollHeight = container.scrollHeight;
          }
          
          scrollStep();
        }, 300);
      };
      
      scrollStep();
    });
  },
  
  // Scroll to bottom smoothly
  scrollToBottom(container) {
    return new Promise((resolve) => {
      if (!container) {
        resolve(false);
        return;
      }
      
      container.scrollTop = container.scrollHeight;
      setTimeout(() => resolve(true), 100);
    });
  },
  
  // Create and inject a style element
  injectStyles(stylesContent) {
    const styleElement = document.createElement('style');
    styleElement.textContent = stylesContent;
    document.head.appendChild(styleElement);
    return styleElement;
  },
  
  // Insert text into an input field with all required events
  insertTextIntoField(field, text) {
    if (!field) return false;
    
    // Focus the field
    field.focus();
    
    // Set the value/innerText based on element type
    if (field.tagName === 'INPUT') {
      field.value = text;
    } else {
      field.innerText = text;
    }
    
    // Trigger input event for Facebook's event listeners
    field.dispatchEvent(new Event('input', { bubbles: true }));
    
    return true;
  }
};

// Storage utility for robust localStorage operations
const storageUtils = {
  set(key, value) {
    try {
      localStorage.setItem(`FB_CHAT_MONITOR_${key}`, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Error saving to localStorage: ${error.message}`, { key });
      return false;
    }
  },
  
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(`FB_CHAT_MONITOR_${key}`);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      logger.error(`Error reading from localStorage: ${error.message}`, { key });
      return defaultValue;
    }
  },
  
  remove(key) {
    try {
      localStorage.removeItem(`FB_CHAT_MONITOR_${key}`);
      return true;
    } catch (error) {
      logger.error(`Error removing from localStorage: ${error.message}`, { key });
      return false;
    }
  },
  
  clear(prefix = '') {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`FB_CHAT_MONITOR_${prefix}`)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      return keysToRemove.length;
    } catch (error) {
      logger.error(`Error clearing localStorage: ${error.message}`);
      return 0;
    }
  }
};

// User activity detection for adaptive monitoring
const userActivityTracker = {
  isActive: false,
  lastActivity: Date.now(),
  listeners: [],
  
  initialize() {
    // Track mouse and keyboard activity
    document.addEventListener('mousemove', () => this.recordActivity());
    document.addEventListener('keydown', () => this.recordActivity());
    document.addEventListener('click', () => this.recordActivity());
    
    // Check for inactivity periodically
    setInterval(() => this.checkInactivity(), 60000);
    
    logger.debug('User activity tracker initialized');
  },
  
  recordActivity() {
    const wasInactive = !this.isActive;
    this.isActive = true;
    this.lastActivity = Date.now();
    
    // If state changed, notify listeners
    if (wasInactive) {
      this.notifyListeners();
    }
  },
  
  checkInactivity() {
    const now = Date.now();
    const inactiveTime = now - this.lastActivity;
    
    // Consider user inactive after 5 minutes
    if (inactiveTime > 5 * 60 * 1000 && this.isActive) {
      this.isActive = false;
      this.notifyListeners();
    }
  },
  
  onActivityChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  },
  
  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.isActive, this.lastActivity);
      } catch (error) {
        logger.error('Error in activity listener', {}, error);
      }
    }
  }
};

// Retry helper with exponential backoff
const retryUtils = {
  async withExponentialBackoff(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      factor = 2,
      jitter = 0.1,
    } = options;
    
    let attempt = 0;
    let lastError = null;
    
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt > maxRetries) {
          logger.error(`Operation failed after ${maxRetries} retries`, {}, error);
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          baseDelay * Math.pow(factor, attempt - 1),
          maxDelay
        );
        
        // Add jitter to avoid synchronized retries
        const jitterAmount = delay * jitter;
        const finalDelay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
        
        logger.debug(`Retry attempt ${attempt} after ${Math.round(finalDelay)}ms`);
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
    
    throw lastError;
  }
};

// Time and formatting utilities
const timeUtils = {
  formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date);
  },
  
  getRelativeTime(timestamp) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const now = Date.now();
    const diff = timestamp - now;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (Math.abs(days) > 0) return rtf.format(days, 'day');
    if (Math.abs(hours) > 0) return rtf.format(hours, 'hour');
    if (Math.abs(minutes) > 0) return rtf.format(minutes, 'minute');
    return rtf.format(seconds, 'second');
  },
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// URL and page handling utilities
const pageUtils = {
  isMarketplaceMessenger() {
    const url = window.location.href;
    return url.includes('facebook.com/messages') || url.includes('messenger.com');
  },
  
  redirectToMarketplace() {
    if (window.location.href.includes('messenger.com') && !window.location.href.includes('marketplace')) {
      window.location.href = 'https://www.facebook.com/messages/t/marketplace';
      return true;
    }
    return false;
  }
};

// General utility functions
function showSimpleAlert(message, type = 'info', options = {}) {
  return logger.notify(message, type, options);
}

async function delay(ms) {
  return timeUtils.sleep(ms);
}

function insertTextDirectly(inputField, text) {
  return domUtils.insertTextIntoField(inputField, text);
}

// Initialize on module load
logger.loadLogs();
userActivityTracker.initialize();

// already exhibits only once:
window.logger = logger;
window.domUtils = domUtils;
window.storageUtils = storageUtils;
window.userActivityTracker = userActivityTracker;
window.retryUtils = retryUtils;
window.timeUtils = timeUtils;
window.pageUtils = pageUtils;
window.showSimpleAlert = showSimpleAlert;
window.delay = delay;
window.insertTextDirectly = insertTextDirectly;