/**
 * ScrollManager - Intelligent system for managing scroll in conversations
 * 
 * Responsibilities:
 * - Scroll to the beginning of the conversation for new threads
 * - Perform a partial scroll to the last known message for existing threads
 * - Maintain the current position and be able to restore it
 * - Notify scroll events to coordinate with other components
 */
class ScrollManager {
  constructor() {
    this.SCROLL_CONTAINER_SELECTOR = CONFIG.selectors?.activeChat?.scrollbar || 
      'div[style*="overflow-y: auto"][style*="height"]';
    
    this.options = {
      scrollPauseMs: 300,       // Pause between scroll iterations
      maxAttempts: 25,          // Maximum scroll attempts
      noChangeThreshold: 3,     // How many iterations without change indicate the end
      smoothScrollToPosition: true, // Enable smooth scroll when restoring position
      detectLoadingIndicator: true, // Detect loading indicators
    };

    this.eventListeners = {
      beforeScroll: [],
      duringScroll: [],
      afterScroll: [],
      scrollToBeginning: [],
      scrollToMessage: [],
      scrollPositionRestored: []
    };

    this.state = {
      originalPosition: null,
      isScrolling: false,
      scrollDirection: null,
      lastScrollHeight: 0,
      scrollAttempts: 0,
      consecutiveNoChange: 0
    };
    
    // Observable for other components
    this._scrollObservable = null;
  }

  /**
   * Scrolls to the beginning of the conversation
   * @param {Object} options - Additional options 
   * @returns {Promise<Object>} Result of the operation
   */
  async scrollToBeginning(options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      console.error('[ScrollManager] Scroll container not found');
      return { success: false, error: 'No scroll container found' };
    }

    // Merge options
    const scrollOptions = { ...this.options, ...options };
    
    // Save original position
    this.state.originalPosition = container.scrollTop;
    this.state.isScrolling = true;
    this.state.scrollDirection = 'up';
    this.state.lastScrollHeight = container.scrollHeight;
    this.state.scrollAttempts = 0;
    this.state.consecutiveNoChange = 0;
    
    // Notify scroll start
    this._notifyEvent('beforeScroll', { direction: 'up', type: 'beginning' });
    console.log('[ScrollManager] Starting scroll to the beginning of the conversation');

    try {
      // Start scroll process
      while (this.state.scrollAttempts < scrollOptions.maxAttempts) {
        this.state.scrollAttempts++;
        const prevScrollHeight = this.state.lastScrollHeight;
        const prevScrollTop = container.scrollTop;
        
        // Scroll up
        container.scrollTop = 0;
        
        // Wait for messages to load
        await new Promise(resolve => setTimeout(resolve, scrollOptions.scrollPauseMs));
        
        // Check for changes
        const currentScrollHeight = container.scrollHeight;
        const currentScrollTop = container.scrollTop;
        
        // Notify during scroll (so other components can process elements)
        if (scrollOptions.onScroll && typeof scrollOptions.onScroll === 'function') {
          scrollOptions.onScroll({
            attempt: this.state.scrollAttempts,
            maxAttempts: scrollOptions.maxAttempts,
            heightChange: currentScrollHeight - prevScrollHeight,
            direction: 'up'
          });
        }
        
        this._notifyEvent('duringScroll', {
          attempt: this.state.scrollAttempts,
          maxAttempts: scrollOptions.maxAttempts,
          heightChange: currentScrollHeight - prevScrollHeight,
          scrollPosition: currentScrollTop
        });
        
        // Detect end of scroll
        if (currentScrollTop === 0 && 
            (prevScrollHeight === currentScrollHeight || currentScrollTop === prevScrollTop)) {
          this.state.consecutiveNoChange++;
          
          // If we have several attempts without changes, we assume we've reached the beginning
          if (this.state.consecutiveNoChange >= scrollOptions.noChangeThreshold) {
            console.log('[ScrollManager] Reached the beginning of the conversation');
            break;
          }
        } else {
          this.state.consecutiveNoChange = 0;
        }
        
        this.state.lastScrollHeight = currentScrollHeight;
      }
      
      // Check result
      const scrolledToBeginning = (container.scrollTop === 0);
      console.log(`[ScrollManager] Scroll completed in ${this.state.scrollAttempts} attempts. Reached beginning: ${scrolledToBeginning}`);
      
      this._notifyEvent('scrollToBeginning', {
        success: true,
        attempts: this.state.scrollAttempts,
        reachedBeginning: scrolledToBeginning
      });
      
      return { 
        success: true, 
        reachedBeginning: scrolledToBeginning,
        attempts: this.state.scrollAttempts
      };
    } catch (error) {
      console.error('[ScrollManager] Error during scroll to beginning:', error);
      return { 
        success: false, 
        error: error.message 
      };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'up', type: 'beginning' });
    }
  }

  /**
   * Restores the saved scroll position
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result of the operation
   */
  async restorePosition(options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      console.error('[ScrollManager] Scroll container not found');
      return { success: false, error: 'No scroll container found' };
    }

    // Merge options
    const scrollOptions = { ...this.options, ...options };
    this.state.isScrolling = true;
    this.state.scrollDirection = 'down';
    
    // IMPROVEMENT: If restoring position in a new thread,
    // check if we want to go to the end of the conversation
    const goToBottom = options.scrollToBottom === true || 
                      (this.state.originalPosition === null && options.scrollToBottom !== false);
    
    if (goToBottom) {
      console.log(`[ScrollManager] Scrolling to the end of the conversation`);
      container.scrollTop = container.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 100));
      return { success: true, scrolledToBottom: true };
    }
    
    if (this.state.originalPosition === null) {
      console.error('[ScrollManager] Cannot restore original position (null)');
      return { success: false, error: 'Cannot restore position, original position is null' };
    }
    
    console.log(`[ScrollManager] Restoring position to ${this.state.originalPosition}`);
    
    try {
      // If smooth scroll is enabled, do it in steps
      if (scrollOptions.smoothScrollToPosition) {
        const currentPosition = container.scrollTop;
        const targetPosition = this.state.originalPosition;
        const distance = targetPosition - currentPosition;
        const steps = 15; // Number of steps for smooth scroll
        
        for (let i = 1; i <= steps; i++) {
          const nextPosition = currentPosition + (distance * i / steps);
          container.scrollTop = nextPosition;
          await new Promise(resolve => setTimeout(resolve, 15));
        }
      } else {
        // Instant scroll
        container.scrollTop = this.state.originalPosition;
      }
      
      // IMPROVEMENT: Verify that we actually reached the desired position
      await new Promise(resolve => setTimeout(resolve, 100));
      const finalPosition = container.scrollTop;
      const targetReached = Math.abs(finalPosition - this.state.originalPosition) < 50;
      
      this._notifyEvent('scrollPositionRestored', {
        originalPosition: this.state.originalPosition,
        currentPosition: finalPosition,
        targetReached
      });
      
      return { 
        success: true,
        restoredPosition: finalPosition,
        originalPosition: this.state.originalPosition,
        targetReached
      };
    } catch (error) {
      console.error('[ScrollManager] Error restoring position:', error);
      return { success: false, error: error.message };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'down', type: 'restore' });
    }
  }

  /**
   * Scrolls to a specific message (by ID or element)
   * @param {string|HTMLElement} messageTarget - Message ID or element
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result of the operation
   */
  async scrollToMessage(messageTarget, options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      return { success: false, error: 'No scroll container found' };
    }
    
    // Save original position
    this.state.originalPosition = container.scrollTop;
    this.state.isScrolling = true;
    
    // Merge options
    const scrollOptions = { ...this.options, ...options };
    
    try {
      let targetElement;
      
      // Determine the target element
      if (typeof messageTarget === 'string') {
        // It's a message ID, find the element
        targetElement = document.querySelector(`[data-message-id="${messageTarget}"], [id="${messageTarget}"]`);
      } else if (messageTarget instanceof HTMLElement) {
        // It's already an HTML element
        targetElement = messageTarget;
      }
      
      if (!targetElement) {
        console.log(`[ScrollManager] Target message not found, searching by scroll...`);
        
        // If the element was not found, perform iterative scroll to search
        const result = await this._searchMessageByScroll(messageTarget, scrollOptions);
        return result;
      }
      
      // Notify scroll start
      this._notifyEvent('beforeScroll', { direction: 'to-message', messageTarget });
      
      console.log(`[ScrollManager] Scrolling to specific message`);
      
      // Scroll to the element
      targetElement.scrollIntoView({
        behavior: scrollOptions.smoothScrollToPosition ? 'smooth' : 'auto',
        block: 'center'
      });
      
      // Wait for the scroll to finish
      await new Promise(resolve => setTimeout(resolve, 300));
      
      this._notifyEvent('scrollToMessage', {
        success: true,
        messageTarget,
        found: true
      });
      
      return { success: true, found: true };
    } catch (error) {
      console.error('[ScrollManager] Error in scrollToMessage:', error);
      return { success: false, error: error.message };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'to-message', messageTarget });
    }
  }

  /**
   * Searches for a message by progressive scrolling
   * @param {string} messageId - ID of the message to search for
   * @param {Object} options - Scroll options
   * @returns {Promise<Object>} Search result
   * @private
   */
  async _searchMessageByScroll(messageId, options) {
    const container = this._getScrollContainer();
    
    this.state.scrollAttempts = 0;
    this.state.consecutiveNoChange = 0;
    this.state.lastScrollHeight = container.scrollHeight;
    
    // Start by scrolling up
    while (this.state.scrollAttempts < options.maxAttempts) {
      this.state.scrollAttempts++;
      const prevScrollHeight = this.state.lastScrollHeight;
      
      // Scroll up in increments
      container.scrollTop = container.scrollTop - (container.clientHeight * 0.2);
      
      // Wait for messages to load
      await new Promise(resolve => setTimeout(resolve, options.scrollPauseMs));
      
      // Check for changes
      const currentScrollHeight = container.scrollHeight;
      
      // Search for the message after each scroll
      const targetElement = document.querySelector(`[data-message-id="${messageId}"], [id="${messageId}"]`);
      if (targetElement) {
        console.log(`[ScrollManager] Message found after ${this.state.scrollAttempts} attempts`);
        
        // Scroll to the element
        targetElement.scrollIntoView({
          behavior: options.smoothScrollToPosition ? 'smooth' : 'auto',
          block: 'center'
        });
        
        this._notifyEvent('scrollToMessage', {
          success: true,
          messageId,
          found: true,
          attempts: this.state.scrollAttempts
        });
        
        return { success: true, found: true, attempts: this.state.scrollAttempts };
      }
      
      // Notify during scroll
      if (options.onScroll && typeof options.onScroll === 'function') {
        options.onScroll({
          attempt: this.state.scrollAttempts,
          maxAttempts: options.maxAttempts,
          heightChange: currentScrollHeight - prevScrollHeight,
          direction: 'up',
          searching: true
        });
      }
      
      this._notifyEvent('duringScroll', {
        attempt: this.state.scrollAttempts,
        maxAttempts: options.maxAttempts,
        heightChange: currentScrollHeight - prevScrollHeight,
        direction: 'up',
        searching: true
      });
      
      // Detect end of scroll
      if (container.scrollTop <= 0 || 
          (prevScrollHeight === currentScrollHeight && this.state.consecutiveNoChange >= 2)) {
        console.log('[ScrollManager] Reached scroll limit without finding the message');
        break;
      }
      
      if (prevScrollHeight === currentScrollHeight) {
        this.state.consecutiveNoChange++;
      } else {
        this.state.consecutiveNoChange = 0;
      }
      
      this.state.lastScrollHeight = currentScrollHeight;
    }
    
    console.log(`[ScrollManager] Message not found after ${this.state.scrollAttempts} attempts`);
    
    this._notifyEvent('scrollToMessage', {
      success: true,
      messageId,
      found: false,
      attempts: this.state.scrollAttempts
    });
    
    return { success: true, found: false, attempts: this.state.scrollAttempts };
  }

  /**
   * Gets the scroll container
   * @returns {HTMLElement|null} Scroll container element
   * @private
   */
  _getScrollContainer() {
    // Try multiple selectors
    const selectors = Array.isArray(this.SCROLL_CONTAINER_SELECTOR) 
      ? this.SCROLL_CONTAINER_SELECTOR 
      : this.SCROLL_CONTAINER_SELECTOR.split(',').map(s => s.trim());
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    
    // Fallback: search for any container with overflow-y: auto
    return document.querySelector('div[style*="overflow-y: auto"]');
  }

  /**
   * Notifies an event to registered listeners
   * @param {string} eventName - Name of the event
   * @param {Object} data - Event data
   * @private
   */
  _notifyEvent(eventName, data = {}) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[ScrollManager] Error in listener for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Adds a listener for a specific event
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Function to execute
   * @returns {Function} Function to remove the listener
   */
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    
    this.eventListeners[eventName].push(callback);
    
    // Return function to remove listener
    return () => this.off(eventName, callback);
  }

  /**
   * Removes a specific listener
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Function to remove
   */
  off(eventName, callback) {
    if (!this.eventListeners[eventName]) return;
    
    const index = this.eventListeners[eventName].indexOf(callback);
    if (index !== -1) {
      this.eventListeners[eventName].splice(index, 1);
    }
  }
}

// Create global singleton instance
const scrollManager = new ScrollManager();

// Expose globally
window.scrollManager = scrollManager;
