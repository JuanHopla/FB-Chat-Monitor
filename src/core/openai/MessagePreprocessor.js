/**
 * Message Preprocessor - "The Translator"
 * 
 * Responsibilities:
 * - Prepare messages for OpenAI Assistants API
 * - Sanitize text content
 * - Format product information
 * - Handle message chunking
 * - Determine the point to continue from in threads
 */

class MessagePreprocessor {
  constructor() {
    this.config = {
      maxMessagesInNewThread: 50,
      maxItemsPerChunk: 10,
      sanitizationRules: [
        { pattern: /\b(https?:\/\/)[^\s]+\.(png|jpe?g|gif|webp|bmp)/gi, replacement: '[Image URL]' },
        { pattern: /\b(https?:\/\/)[^\s]+/gi, replacement: '[Link]' },
        { pattern: /(\+\d{1,3}|\b\d{3}[-.])\d{3}[-.]?\d{4}\b/g, replacement: '[Phone]' },
        { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[Email]' }
      ]
    };
  }

  /**
   * Gets new messages since the last processed message
   * @param {Array} messages - All messages in the chat
   * @param {string} lastMessageId - ID of the last processed message
   * @returns {Array} New formatted messages since lastMessageId
   */
  getNewMessagesSince(messages, lastMessageId) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.error('Invalid messages array provided to getNewMessagesSince');
      return [];
    }

    // If no lastMessageId, return all messages (up to limit)
    if (!lastMessageId) {
      console.log('No lastMessageId provided, using all messages');
      return this.formatMessagesForOpenAI(
        messages.slice(-this.config.maxMessagesInNewThread)
      );
    }

    // Find the index of the last processed message
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);

    if (lastIndex === -1) {
      logger.warn(`Last message ID ${lastMessageId} not found, using timestamp-based fallback`);
      return this.getNewMessagesUsingTimestampFallback(messages, lastMessageId);
    }

    // Get messages after the last processed one
    const newMessages = messages.slice(lastIndex + 1);
    console.log(`Found ${newMessages.length} new messages since ${lastMessageId}`);

    // If no new messages, return just the last message for context
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log('No new messages, returning only the last message for context');
      return this.formatMessagesForOpenAI([lastMessage]);
    }

    // Convert to OpenAI format
    return this.formatMessagesForOpenAI(newMessages);
  }

  /**
   * Fallback method using timestamps when message ID is not found
   * @param {Array} messages - All messages in the chat
   * @param {string} lastMessageId - ID of the last processed message (contains timestamp info)
   * @returns {Array} New formatted messages
   * @private
   */
  getNewMessagesUsingTimestampFallback(messages, lastMessageId) {
    // Uses TimestampUtils if available
    let lastTimestamp = 0;

    // Extract timestamp from messageId if possible
    if (lastMessageId) {
      const parts = lastMessageId.split('_');
      if (parts.length >= 3) {
        const potentialTimestamp = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(potentialTimestamp)) {
          lastTimestamp = potentialTimestamp;
        }
      }
    }

    // If not extracted, try using TimestampUtils
    if (lastTimestamp === 0 && window.TimestampUtils && typeof window.TimestampUtils.convertFacebookTimestampToMs === 'function') {
      // Find the message with the given ID and use its timestamp if it exists
      const msg = messages.find(m => m.id === lastMessageId);
      if (msg && msg.timestamp) {
        lastTimestamp = window.TimestampUtils.convertFacebookTimestampToMs(msg.timestamp) || 0;
      }
    }

    // If still no timestamp, use recent messages
    if (lastTimestamp === 0) {
      logger.warn('Could not extract timestamp from message ID, using recent messages');
      return this.formatMessagesForOpenAI(
        messages.slice(-this.config.maxMessagesInNewThread)
      );
    }

    // Use TimestampUtils to compare timestamps if available
    let newMessages;
    if (window.TimestampUtils && typeof window.TimestampUtils.isTimestampNewer === 'function') {
      newMessages = messages.filter(msg => {
        if (msg.timestamp) {
          return window.TimestampUtils.isTimestampNewer(msg.timestamp, lastTimestamp);
        }
        // Fallback: use getMessageTimestamp
        const msgTimestamp = this.getMessageTimestamp(msg);
        return msgTimestamp > lastTimestamp;
      });
    } else {
      // Original fallback
      newMessages = messages.filter(msg => {
        const msgTimestamp = this.getMessageTimestamp(msg);
        return msgTimestamp > lastTimestamp;
      });
    }

    console.log(`Found ${newMessages.length} new messages using timestamp fallback`);

    // If no new messages, return only the last message
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log('No new messages with timestamp fallback, returning only the last message');
      return this.formatMessagesForOpenAI([lastMessage]);
    }

    // Convert to OpenAI format
    return this.formatMessagesForOpenAI(newMessages);
  }

  /**
   * Gets the last message in the chat
   * @param {Array} messages - All messages in the chat
   * @returns {Object} Last message formatted for OpenAI
   */
  getLastMessage(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.error('Invalid messages array provided to getLastMessage');
      return null;
    }

    const lastMessage = messages[messages.length - 1];
    const formatted = this.formatMessagesForOpenAI([lastMessage]);
    
    return formatted.length > 0 ? formatted[0] : null;
  }

  /**
   * Sanitizes text to remove sensitive information
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    let sanitized = text;

    // Apply each sanitization rule
    this.config.sanitizationRules.forEach(rule => {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
    });

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Attaches product information to the message list
   * Limits images and uses ImageFilterUtils if available
   * @param {Array} messages - Message array
   * @param {Object} product - Product data
   * @returns {Array} Messages with product info
   */
  attachProductInfo(messages, product) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }

    if (!product) {
      console.log('No product data to attach');
      return messages;
    }

    try {
      // Limit images and filter if necessary
      let images = Array.isArray(product.images) ? product.images.slice(0, 5) : [];
      if (window.ImageFilterUtils) {
        images = window.ImageFilterUtils.filterImageUrls(images);
      }

      // Create the product message
      const productMessage = {
        id: `product_${Date.now()}`,
        sentByUs: false,
        content: {
          text: this.formatProductDetails(product),
          type: 'product_info',
          imageUrls: images
        }
      };

      // Add at the beginning of the list
      return [productMessage, ...messages];
    } catch (error) {
      logger.error('Error attaching product info', {}, error);
      return messages;
    }
  }

  /**
   * Formats product details as a text block
   * @param {Object} product - Product data
   * @returns {string} Formatted product details
   * @private
   */
  formatProductDetails(product) {
    if (!product) return '';

    const lines = ['=== PRODUCT DETAILS ==='];

    if (product.title) lines.push(`Title: ${product.title}`);
    if (product.price) lines.push(`Price: ${product.price}`);
    if (product.condition) lines.push(`Condition: ${product.condition}`);
    if (product.location) lines.push(`Location: ${product.location}`);
    if (product.description) lines.push(`Description: ${product.description}`);

    return lines.join('\n');
  }

  /**
   * Attaches transcriptions to audio messages using transcribeAudio if necessary
   * @param {Array} messages - Message array
   * @returns {Promise<Array>} Messages with transcriptions
   */
  async attachTranscriptions(messages) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }

    // Process each message and transcribe if necessary
    const processed = await Promise.all(messages.map(async message => {
      if (
        message.content &&
        message.content.hasAudio &&
        message.content.audioUrl &&
        (!message.content.transcribedAudio || message.content.transcribedAudio === '[Transcription Pending]')
      ) {
        // If transcription already exists, use it
        if (typeof window.audioTranscriber?.getTranscription === 'function') {
          const transcription = window.audioTranscriber.getTranscription(message.content.audioUrl);
          if (transcription) {
            return {
              ...message,
              content: {
                ...message.content,
                transcribedAudio: transcription,
                text: message.content.text ?
                  `${message.content.text}\n[Audio Transcription: ${transcription}]` :
                  `[Audio Transcription: ${transcription}]`
              }
            };
          }
        }
        // If no transcription, try using ApiClient.transcribeAudio
        if (window.apiClient && typeof window.apiClient.transcribeAudio === 'function') {
          try {
            const blob = message.content.audioBlob;
            if (blob) {
              const transcription = await window.apiClient.transcribeAudio(blob);
              return {
                ...message,
                content: {
                  ...message.content,
                  transcribedAudio: transcription,
                  text: message.content.text ?
                    `${message.content.text}\n[Audio Transcription: ${transcription}]` :
                    `[Audio Transcription: ${transcription}]`
                }
              };
            }
          } catch (e) {
            logger.warn('Error transcribing audio:', e);
          }
        }
      }
      return message;
    }));

    return processed;
  }

  /**
   * Generates a unique message ID
   * @param {string} text - Message text
   * @param {string} timestamp - Message timestamp
   * @returns {string} Generated ID
   */
  generateMessageId(text, timestamp) {
    // Create a timestamp if not provided
    const time = timestamp || Date.now();
    
    // Create a hash of the text content for uniqueness
    let hash = 0;
    if (text) {
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
    }
    
    return `msg_${Math.abs(hash).toString(16)}_${time}`;
  }

  /**
   * Formats messages into OpenAI's expected structure
   * @param {Array} messages - Facebook chat messages
   * @returns {Array} OpenAI formatted messages
   * @private
   */
  formatMessagesForOpenAI(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // Group messages by sender
    const grouped = this.groupMessagesByRole(messages);
    
    // Format each group
    const formattedGroups = [];
    
    for (const group of grouped) {
      // Split into chunks if needed
      const chunks = this.chunkMessageGroup(group);
      
      // Format each chunk
      for (const chunk of chunks) {
        const formatted = this.formatMessageGroup(chunk);
        // FILTER: Only add if it has valid content
        if (
          formatted &&
          Array.isArray(formatted.content) &&
          formatted.content.length > 0
        ) {
          formattedGroups.push(formatted);
        }
      }
    }

    // Improved log
    console.log('[MessagePreprocessor] Messages formatted for OpenAI:', {
      total: formattedGroups.length,
      examples: formattedGroups.slice(0, 2)
    });
    
    return formattedGroups;
  }

  /**
   * Groups consecutive messages by the same sender
   * @param {Array} messages - Messages to group
   * @returns {Array<Array>} Grouped messages
   * @private
   */
  groupMessagesByRole(messages) {
    if (!messages || messages.length === 0) return [];
    
    const groups = [];
    let currentGroup = [messages[0]];
    
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i - 1];
      
      // If same sender, add to current group
      if (current.sentByUs === previous.sentByUs) {
        currentGroup.push(current);
      } 
      // Otherwise start a new group
      else {
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }
    
    // Add the last group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * Splits a message group into chunks if needed
   * @param {Array} group - Group of messages from the same sender
   * @returns {Array<Array>} Chunks of messages
   * @private
   */
  chunkMessageGroup(group) {
    if (!group || group.length === 0) return [];
    
    // If group is small enough, return as is
    if (group.length <= this.config.maxItemsPerChunk) {
      return [group];
    }
    
    // Split into chunks
    const chunks = [];
    for (let i = 0; i < group.length; i += this.config.maxItemsPerChunk) {
      chunks.push(group.slice(i, i + this.config.maxItemsPerChunk));
    }
    
    return chunks;
  }

  /**
   * Formats a group of messages into a single OpenAI message
   * @param {Array} group - Group of messages from the same sender
   * @returns {Object} Formatted OpenAI message
   * @private
   */
  formatMessageGroup(group) {
    if (!group || group.length === 0) {
      logger.error('Empty group passed to formatMessageGroup');
      return null;
    }
    
    // Determine role based on first message
    const role = group[0].sentByUs ? 'assistant' : 'user';
    
    // Collect all content
    const contentItems = [];
    
    for (const message of group) {
      // Add text content if available
      if (message.content && message.content.text) {
        contentItems.push({
          type: 'text',
          text: this.sanitizeText(message.content.text)
        });
      }
      
      // Add image URLs if available
      if (message.content && message.content.imageUrls && message.content.imageUrls.length > 0) {
        for (const imageUrl of message.content.imageUrls) {
          if (
            imageUrl &&
            typeof imageUrl === 'string' &&
            window.ImageFilterUtils &&
            !window.ImageFilterUtils.isProblematicFacebookImage(imageUrl)
          ) {
            contentItems.push({
              type: 'image_url',
              image_url: { url: imageUrl }
            });
          }
        }
      }
    }
    
    // Create the formatted message
    return {
      role,
      content: contentItems
    };
  }

  /**
   * Gets timestamp from a message
   * @param {Object} message - Message object
   * @returns {number} Timestamp in milliseconds
   * @private
   */
  getMessageTimestamp(message) {
    // Try to get timestamp from message ID
    if (message.id) {
      const parts = message.id.split('_');
      if (parts.length >= 3) {
        const potentialTimestamp = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(potentialTimestamp) && potentialTimestamp > 0) {
          return potentialTimestamp;
        }
      }
    }
    
    // Otherwise use timestamp property or current time
    return message.timestamp || Date.now();
  }
}

// Create global singleton instance
const messagePreprocessor = new MessagePreprocessor();

// Expose globally
window.messagePreprocessor = messagePreprocessor;
