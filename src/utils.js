// ----- UTILITIES -----

// Logging system
const logger = {
  log(message) {
    console.log(`[FB-Chat-Monitor] ${message}`);
  },
  
  debug(message) {
    if (CONFIG.debug) {
      console.log(`[FB-Chat-Monitor][DEBUG] ${message}`);
    }
  },
  
  error(message) {
    console.error(`[FB-Chat-Monitor][ERROR] ${message}`);
  },
  
  notify(message, type = 'success') {
    // Visual notification
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.right = '20px';
    div.style.padding = '10px';
    div.style.color = 'white';
    div.style.borderRadius = '5px';
    div.style.zIndex = '9999';
    div.style.opacity = '0.9';
    
    if (type === 'success') {
      div.style.backgroundColor = '#4CAF50';
    } else if (type === 'error') {
      div.style.backgroundColor = '#f44336';
    } else if (type === 'warning') {
      div.style.backgroundColor = '#ff9800';
    } else if (type === 'info') {
      div.style.backgroundColor = '#2196F3';
    }
    
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(() => {
      document.body.removeChild(div);
    }, 3000);
  }
};

// DOM utility
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
  
  // Waits for an element to appear in the DOM
  waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
    return new Promise((resolve, reject) => {
      const checkInterval = 100;
      let elapsed = 0;
      
      const check = () => {
        const element = this.findElement(selector);
        if (element) {
          resolve(element);
          return;
        }
        
        elapsed += checkInterval;
        if (elapsed >= timeout) {
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }
        
        setTimeout(check, checkInterval);
      };
      
      check();
    });
  },
  
  // Scrolls to the top to load older messages
  scrollToTop(container) {
    return new Promise((resolve) => {
      let lastScrollHeight = container.scrollHeight;
      let noChangeCount = 0;
      
      const scrollStep = () => {
        container.scrollTop = 0; // Scroll up
        
        setTimeout(() => {
          if (container.scrollHeight === lastScrollHeight) {
            noChangeCount++;
            if (noChangeCount >= 3) {
              // If no changes after several attempts, assume we've reached the top
              resolve();
              return;
            }
          } else {
            // If height changed, reset the counter
            noChangeCount = 0;
            lastScrollHeight = container.scrollHeight;
          }
          
          scrollStep();
        }, 300);
      };
      
      scrollStep();
    });
  }
};

