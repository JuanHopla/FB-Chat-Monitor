/**
 * EventCoordinator - Centralized event system to coordinate components
 * 
 * Responsibilities:
 * - Coordinate events between different components
 * - Provide a unified event bus
 * - Allow decoupled communication
 * - Facilitate flow diagnostics
 */
class EventCoordinator {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistoryLength = 100;
    this.debug = true;
  }

  /**
   * Registers a listener for an event
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Function to execute
   * @returns {Object} Object with a method to unsubscribe
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    
    this.listeners.get(eventName).add(callback);
    
    // Return object with an unsubscribe method
    return {
      unsubscribe: () => this.off(eventName, callback)
    };
  }

  /**
   * Removes a listener
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Function to remove
   */
  off(eventName, callback) {
    if (!this.listeners.has(eventName)) return;
    
    this.listeners.get(eventName).delete(callback);
    
    // Delete the set if it's empty
    if (this.listeners.get(eventName).size === 0) {
      this.listeners.delete(eventName);
    }
  }

  /**
   * Emits an event
   * @param {string} eventName - Name of the event
   * @param {Object} data - Data associated with the event
   */
  emit(eventName, data = {}) {
    // Record event in history
    this.recordEvent(eventName, data);
    
    // Debug log
    if (this.debug) {
      //console.log(`[EventCoordinator] Event emitted: ${eventName}`, data);
    }
    
    // Notify listeners
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventCoordinator] Error in listener for ${eventName}:`, error);
        }
      });
    }
    
    // Also notify '*' listeners (all events)
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => {
        try {
          callback({ event: eventName, data });
        } catch (error) {
          console.error(`[EventCoordinator] Error in global listener:`, error);
        }
      });
    }
  }

  /**
   * Records an event in the history
   * @param {string} eventName - Name of the event
   * @param {Object} data - Event data
   * @private
   */
  recordEvent(eventName, data) {
    this.eventHistory.unshift({
      event: eventName,
      data,
      timestamp: Date.now()
    });
    
    // Keep the history limited
    if (this.eventHistory.length > this.maxHistoryLength) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistoryLength);
    }
  }

  /**
   * Gets the event history
   * @param {Object} options - Filtering options
   * @returns {Array} Filtered event history
   */
  getEventHistory(options = {}) {
    let events = [...this.eventHistory];
    
    // Apply filters
    if (options.eventName) {
      events = events.filter(e => e.event === options.eventName);
    }
    
    if (options.timeRange) {
      const now = Date.now();
      events = events.filter(e => (now - e.timestamp) <= options.timeRange);
    }
    
    if (options.limit) {
      events = events.slice(0, options.limit);
    }
    
    return events;
  }

  /**
   * Emits an event once certain conditions are met
   * @param {string} eventName - Name of the event to emit
   * @param {Array<Object>} conditions - Conditions to be met
   * @param {Object} eventData - Data to include in the event
   * @param {Object} options - Additional options
   * @returns {Object} Object with a method to cancel
   */
  emitWhen(eventName, conditions, eventData = {}, options = {}) {
    const pendingEvents = new Set();
    const completedEvents = new Set();
    const timeout = options.timeout || 30000;
    
    // Convert conditions to an array if it isn't one
    const conditionsArray = Array.isArray(conditions) ? conditions : [conditions];
    
    // Register each condition
    const subscriptions = conditionsArray.map(condition => {
      pendingEvents.add(condition.event);
      
      return this.on(condition.event, (data) => {
        // Check if the condition is met
        if (!condition.check || condition.check(data)) {
          pendingEvents.delete(condition.event);
          completedEvents.add(condition.event);
          
          // If all conditions are met, emit the event
          if (pendingEvents.size === 0) {
            this.emit(eventName, { ...eventData, triggeredBy: Array.from(completedEvents) });
            // Cancel all subscriptions
            subscriptions.forEach(sub => sub.unsubscribe());
          }
        }
      });
    });
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (pendingEvents.size > 0) {
        // Emit timeout event
        this.emit(`${eventName}.timeout`, {
          pending: Array.from(pendingEvents),
          completed: Array.from(completedEvents)
        });
        // Cancel all subscriptions
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    }, timeout);
    
    // Return object to cancel
    return {
      unsubscribe: () => {
        clearTimeout(timeoutId);
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    };
  }
}

// Create global singleton instance
const eventCoordinator = new EventCoordinator();

// Expose globally
window.eventCoordinator = eventCoordinator;
