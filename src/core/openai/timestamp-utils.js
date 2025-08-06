/**
 * Utilities for handling timestamps in Facebook conversations
 * Includes conversion and comparison of different timestamp formats
 */
class TimestampUtils {
  /**
   * Converts a Facebook timestamp (e.g., "Mon 2:11 PM") to milliseconds
   * @param {string} fbTimestamp - Timestamp in Facebook format
   * @returns {number|null} Timestamp in milliseconds (approximate) or null if it cannot be converted
   */
  static convertFacebookTimestampToMs(fbTimestamp) {
    if (!fbTimestamp || typeof fbTimestamp !== 'string') {
      return null;
    }

    try {
      const now = new Date();
      const dayMapping = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
        // Spanish days
        'Dom': 0, 'Lun': 1, 'Mar': 2, 'Mié': 3, 'Mie': 3, 'Jue': 4, 'Vie': 5, 'Sáb': 6, 'Sab': 6
      };
      
      // For timestamps like "Mon 2:11 PM"
      const dayTimeMatch = fbTimestamp.match(/(\w{3})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (dayTimeMatch) {
        // Extract components
        const day = dayMapping[dayTimeMatch[1]];
        let hours = parseInt(dayTimeMatch[2]);
        const minutes = parseInt(dayTimeMatch[3]);
        const isPM = dayTimeMatch[4]?.toLowerCase() === 'pm';
        
        // If the day is not recognized, it may be another format
        if (day === undefined) {
          return this.parseAlternateFormats(fbTimestamp);
        }
        
        // Adjust hours for 24h format
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        // Calculate the approximate timestamp
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        
        // Adjust day of the week
        const currentDay = date.getDay();
        if (currentDay !== day) {
          // Calculate day difference
          let dayDiff = day - currentDay;
          // If it's a future day, assume it's from last week
          if (dayDiff > 0) dayDiff -= 7;
          date.setDate(date.getDate() + dayDiff);
        }
        
        return date.getTime();
      }
      
      // For other formats
      return this.parseAlternateFormats(fbTimestamp);
    } catch (error) {
      logger.debug(`Error converting FB timestamp: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Parses alternate Facebook timestamp formats
   * @param {string} timestamp - The timestamp in alternate format
   * @returns {number|null} Timestamp in milliseconds or null
   * @private
   */
  static parseAlternateFormats(timestamp) {
    try {
      const now = new Date();
      
      // Format "DD/MM/YYYY, HH:MM" or "DD/MM/YY, HH:MM"
      const dateTimeMatch = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (dateTimeMatch) {
        const day = parseInt(dateTimeMatch[1]);
        const month = parseInt(dateTimeMatch[2]) - 1; // 0-indexed
        let year = parseInt(dateTimeMatch[3]);
        // Adjust year if it's in short format
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
        let hours = parseInt(dateTimeMatch[4]);
        const minutes = parseInt(dateTimeMatch[5]);
        const isPM = dateTimeMatch[6]?.toLowerCase() === 'pm';
        
        // Adjust hours for 24h format if necessary
        if (isPM && hours < 12) hours += 12;
        if (dateTimeMatch[6]?.toLowerCase() === 'am' && hours === 12) hours = 0;
        
        // Create date
        const date = new Date(year, month, day, hours, minutes, 0, 0);
        return date.getTime();
      }
      
      // Format "Yesterday HH:MM AM/PM" or "Ayer HH:MM AM/PM"
      const yesterdayMatch = timestamp.match(/(Yesterday|Ayer)(?:\s+at)?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (yesterdayMatch) {
        let hours = parseInt(yesterdayMatch[2]);
        const minutes = parseInt(yesterdayMatch[3]);
        const isPM = yesterdayMatch[4]?.toLowerCase() === 'pm';
        
        // Adjust hours for 24h format
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        // Create yesterday's date
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(hours, minutes, 0, 0);
        
        return yesterday.getTime();
      }
      
      // Format "Today HH:MM AM/PM" or "Hoy HH:MM AM/PM"
      const todayMatch = timestamp.match(/(Today|Hoy)(?:\s+at)?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (todayMatch) {
        let hours = parseInt(todayMatch[2]);
        const minutes = parseInt(todayMatch[3]);
        const isPM = todayMatch[4]?.toLowerCase() === 'pm';
        
        // Adjust hours for 24h format
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        // Create today's date
        const today = new Date(now);
        today.setHours(hours, minutes, 0, 0);
        
        return today.getTime();
      }
      
      // Simple time format "HH:MM AM/PM"
      const timeMatch = timestamp.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const isPM = timeMatch[3]?.toLowerCase() === 'pm';
        
        // Adjust hours for 24h format
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        // Create today's date
        const today = new Date(now);
        today.setHours(hours, minutes, 0, 0);
        
        return today.getTime();
      }
      
      // Format of "X minutes/hours ago"
      const relativeMatch = timestamp.match(/(\d+)\s+(minutes?|hours?|mins?|hrs?|minutos?|horas?)\s+ago/i);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        
        // Determine multiplier based on unit
        let multiplier = 60 * 1000; // Default to minutes (in ms)
        if (unit.startsWith('hour') || unit.startsWith('hr') || unit.startsWith('hora')) {
          multiplier = 60 * 60 * 1000; // hours in ms
        }
        
        return now.getTime() - (amount * multiplier);
      }
      
      // Format for months in English "Jan 15, 2023"
      const monthMatch = timestamp.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);
      if (monthMatch) {
        const monthMapping = {
          'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 
          'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
        };
        
        const month = monthMapping[monthMatch[1]];
        const day = parseInt(monthMatch[2]);
        const year = monthMatch[3] ? parseInt(monthMatch[3]) : now.getFullYear();
        
        // If it has time
        if (monthMatch[4] && monthMatch[5]) {
          let hours = parseInt(monthMatch[4]);
          const minutes = parseInt(monthMatch[5]);
          const isPM = monthMatch[6]?.toLowerCase() === 'pm';
          
          // Adjust hours for 24h format
          if (isPM && hours < 12) hours += 12;
          if (!isPM && hours === 12) hours = 0;
          
          return new Date(year, month, day, hours, minutes, 0, 0).getTime();
        } else {
          // If it only has the date
          return new Date(year, month, day).getTime();
        }
      }
      
      // If we get here, we couldn't parse the format
      logger.debug(`Could not parse timestamp format: ${timestamp}`);
      return null;
    } catch (error) {
      logger.debug(`Error in parseAlternateFormats: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Compares two timestamps and determines if they correspond approximately to the same moment
   * @param {string} timestamp1 - First timestamp
   * @param {string} timestamp2 - Second timestamp
   * @param {number} toleranceMs - Tolerance in milliseconds (default 1 minute)
   * @returns {boolean} True if they are approximately equal
   */
  static areTimestampsEquivalent(timestamp1, timestamp2, toleranceMs = 60000) {
    if (!timestamp1 || !timestamp2) return false;
    
    // If they are exactly the same as strings
    if (timestamp1 === timestamp2) return true;
    
    // Convert to milliseconds
    const ts1Ms = this.convertFacebookTimestampToMs(timestamp1);
    const ts2Ms = this.convertFacebookTimestampToMs(timestamp2);
    
    // If either could not be converted
    if (!ts1Ms || !ts2Ms) return false;
    
    // Compare with tolerance
    return Math.abs(ts1Ms - ts2Ms) <= toleranceMs;
  }
  
  /**
   * Determines if a timestamp is newer than another
   * @param {string} newTimestamp - Timestamp to verify
   * @param {string} referenceTimestamp - Reference timestamp
   * @returns {boolean} True if newTimestamp is newer than referenceTimestamp
   */
  static isTimestampNewer(newTimestamp, referenceTimestamp) {
    if (!newTimestamp || !referenceTimestamp) return false;
    
    // Convert to milliseconds
    const newTs = this.convertFacebookTimestampToMs(newTimestamp);
    const refTs = this.convertFacebookTimestampToMs(referenceTimestamp);
    
    // If either could not be converted
    if (!newTs || !refTs) return false;
    
    // Compare
    return newTs > refTs;
  }
  
  /**
   * Finds the index of the last processed message based on timestamp
   * @param {Array} messages - List of messages
   * @param {Object} lastPosition - Position information (timestamp, id, etc.)
   * @returns {number} Index of the message or -1 if not found
   */
  static findMessageByTimestamp(messages, lastPosition) {
    if (!messages || !Array.isArray(messages) || !lastPosition || !lastPosition.timestamp) {
      return -1;
    }
    
    // First search by exact ID and content if available
    if (lastPosition.messageId && lastPosition.content) {
      const exactIndex = messages.findIndex(msg => 
        msg.id === lastPosition.messageId && 
        msg.content?.text === lastPosition.content
      );
      
      if (exactIndex !== -1) {
        return exactIndex;
      }
    }
    
    // If not found, search by timestamp
    // First, retrieve the timestamp in ms
    const referenceTimestampMs = this.convertFacebookTimestampToMs(lastPosition.timestamp);
    if (!referenceTimestampMs) return -1;
    
    // Create an array of indices with timestamps in ms
    const messagesWithTimestamps = messages
      .map((msg, index) => {
        const msgTimestampMs = this.convertFacebookTimestampToMs(msg.timestamp);
        return { index, timestampMs: msgTimestampMs };
      })
      .filter(item => item.timestampMs !== null);
    
    // If there are no messages with a valid timestamp
    if (messagesWithTimestamps.length === 0) return -1;
    
    // Sort by proximity to the reference timestamp
    messagesWithTimestamps.sort((a, b) => 
      Math.abs(a.timestampMs - referenceTimestampMs) - Math.abs(b.timestampMs - referenceTimestampMs)
    );
    
    // The first element is the closest match
    const closestMatch = messagesWithTimestamps[0];
    
    // Verify that the difference is not too large (15 minutes)
    if (Math.abs(closestMatch.timestampMs - referenceTimestampMs) > 15 * 60 * 1000) {
      return -1; // Too much difference
    }
    
    return closestMatch.index;
  }
}

// Export globally
window.TimestampUtils = TimestampUtils;
