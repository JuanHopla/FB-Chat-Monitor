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
      sanitizationRules: [{
        pattern: /\b(https?:\/\/)[^\s]+\.(png|jpe?g|gif|webp|bmp)/gi,
        replacement: '[Image URL]'
      }, {
        pattern: /\b(https?:\/\/)[^\s]+/gi,
        replacement: '[Link]'
      }, {
        pattern: /(\+\d{1,3}|\b\d{3}[-.])\d{3}[-.]?\d{4}\b/g,
        replacement: '[Phone]'
      }, {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        replacement: '[Email]'
      }]
    };
  }

  /**
   * Gets new messages since the last processed message without formatting them
   * @param {Array} messages - All messages in the chat
   * @param {string} lastMessageId - ID of the last processed message
   * @returns {Array} New messages since lastMessageId (without formatting)
   */
  getNewMessagesSinceNoFormat(messages, lastMessageId) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[MessagePreprocessor][ERROR] Invalid message array provided to getNewMessagesSinceNoFormat`);
      logger.error('Invalid messages array provided to getNewMessagesSinceNoFormat');
      return [];
    }

    // If no lastMessageId, return all messages (up to limit)
    if (!lastMessageId) {
      console.log(`[MessagePreprocessor][DEBUG] No lastMessageId provided, using all messages`);
      return messages.slice(-this.config.maxMessagesInNewThread);
    }

    // Find the index of the last processed message
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);

    if (lastIndex === -1) {
      console.log(`[MessagePreprocessor][WARN] Last ID ${lastMessageId} not found, using timestamp fallback`);
      logger.warn(`Last message ID ${lastMessageId} not found, using timestamp-based fallback`);
      return this.getNewMessagesUsingTimestampFallbackNoFormat(messages, lastMessageId);
    }

    // Get messages after the last processed one
    const newMessages = messages.slice(lastIndex + 1);
    console.log(`[MessagePreprocessor][DEBUG] Found ${newMessages.length} new messages since ${lastMessageId}`);

    // If no new messages, return just the last message for context
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log(`[MessagePreprocessor][DEBUG] No new messages, returning only the last message for context`);
      return [lastMessage];
    }

    return newMessages;
  }

  /**
   * Gets new messages since the last processed message
   * @param {Array} messages - All messages in the chat
   * @param {string} lastMessageId - ID of the last processed message
   * @returns {Array} New formatted messages since lastMessageId
   */
  getNewMessagesSince(messages, lastMessageId) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[MessagePreprocessor][ERROR] Invalid message array provided to getNewMessagesSince`);
      logger.error('Invalid messages array provided to getNewMessagesSince');
      return [];
    }

    // If no lastMessageId, return all messages (up to limit)
    if (!lastMessageId) {
      console.log(`[MessagePreprocessor][DEBUG] No lastMessageId provided, using all messages`);
      return this.formatMessagesForOpenAI(
        messages.slice(-this.config.maxMessagesInNewThread)
      );
    }

    // Find the index of the last processed message
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);

    if (lastIndex === -1) {
      console.log(`[MessagePreprocessor][WARN] Last ID ${lastMessageId} not found, using timestamp fallback`);
      logger.warn(`Last message ID ${lastMessageId} not found, using timestamp-based fallback`);
      return this.getNewMessagesUsingTimestampFallback(messages, lastMessageId);
    }

    // Get messages after the last processed one
    const newMessages = messages.slice(lastIndex + 1);
    console.log(`[MessagePreprocessor][DEBUG] Found ${newMessages.length} new messages since ${lastMessageId}`);

    // If no new messages, return just the last message for context
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log(`[MessagePreprocessor][DEBUG] No new messages, returning only the last message for context`);
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
   * Fallback method using timestamps when message ID is not found (without formatting)
   * @param {Array} messages - All messages in the chat
   * @param {string} lastMessageId - ID of the last processed message (contains timestamp info)
   * @returns {Array} New messages without formatting
   * @private
   */
  getNewMessagesUsingTimestampFallbackNoFormat(messages, lastMessageId) {
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
      return messages.slice(-this.config.maxMessagesInNewThread);
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
      return [lastMessage];
    }

    // Return messages without formatting for OpenAI (key difference with the other method)
    return newMessages;
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
   * Attaches transcriptions to audio messages using AudioTranscriber
   * @param {Array|Object} messageData - Messages or {messages, timeBlocks} object to process
   * @returns {Promise<Array>} Messages with attached transcriptions
   */
  async attachTranscriptions(messageData) {
    // Compatibility with different input formats
    let messages = Array.isArray(messageData) ? messageData : messageData?.messages;
    const timeBlocks = messageData?.timeBlocks || [];

    if (!messages || !Array.isArray(messages)) {
      console.log("[MessagePreprocessor][ERROR] Invalid message array provided to attachTranscriptions");
      return messageData;
    }

    // Check if AudioTranscriber is available
    if (!window.audioTranscriber) {
      console.log("[MessagePreprocessor][WARN] AudioTranscriber not available for transcriptions");
      return messageData;
    }

    // Ensure AudioTranscriber is initialized
    if (!window.audioTranscriber.initialized && typeof window.audioTranscriber.initialize === 'function') {
      await window.audioTranscriber.initialize();
    }

    // Find messages that need transcription
    const messagesToTranscribe = messages.filter(message =>
    (message.content?.hasAudio &&
      (!message.content.transcribedAudio || message.content.transcribedAudio === '[Transcription Pending]'))
    );

    // Use logger instead of direct console.log
    if (window.logger && typeof window.logger.debug === 'function') {
      window.logger.debug(
        `attachTranscriptions - Found ${messagesToTranscribe.length} messages needing transcription`, {},
        'MessagePreprocessor'
      );
    } else {
      console.log(`[MessagePreprocessor][DEBUG] attachTranscriptions - Found ${messagesToTranscribe.length} messages needing transcription`);
    }

    if (messagesToTranscribe.length === 0) {
      return messageData; // No messages to transcribe
    }

    // NEW: Wait briefly to allow in-progress transcriptions to complete
    console.log("[MessagePreprocessor][DEBUG] Waiting briefly to allow in-progress transcriptions...");
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      // IMPORTANT MODIFICATION: Pass the complete object with timeBlocks
      if (timeBlocks && timeBlocks.length > 0) {
        // Create a new structure to pass to audioTranscriber
        const fullMessageData = {
          messages: messages,
          timeBlocks: timeBlocks
        };
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(fullMessageData);
      } else {
        // Maintain compatibility with the previous version
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(messages);
      }

      return messages;
    } catch (error) {
      console.error("[MessagePreprocessor][ERROR] Error associating transcriptions:", error);
      return messages;
    }
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
   * Processes images for OpenAI, using the proxy and configured quality
   * @param {Array} imageUrls - URLs of images to process
   * @returns {Promise<Array>} - Processed URLs
   * @private
   */
  async processImagesForOpenAI(imageUrls) {
    try {
      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return [];
      }

      // Get image quality from configuration
      const imageQuality = window.CONFIG?.images?.quality || 'high';
      logger.debug(`[MessagePreprocessor] Processing ${imageUrls.length} images with quality: ${imageQuality}`);

      // Use ImageFilterUtils to process images with the specified quality
      if (window.ImageFilterUtils && typeof window.ImageFilterUtils.processImageUrls === 'function') {
        return await window.ImageFilterUtils.processImageUrls(imageUrls, imageQuality);
      } else {
        logger.warn('[MessagePreprocessor] ImageFilterUtils not available, returning original URLs');
        return imageUrls;
      }
    } catch (error) {
      logger.error('[MessagePreprocessor] Error processing images:', error);
      return imageUrls; // Return originals in case of error
    }
  }

  /**
   * Builds the product details message in OpenAI format
   * @param {Object} product - Product details
   * @returns {Object|null} OpenAI message or null if no product
   */
  async buildProductDetailMessage(product) {
    if (!product) {
      return null;
    }
    const content = [];

    // 1. Get the textual summary of the product first.
    let summary = '';
    if (window.productExtractor && typeof window.productExtractor.getRelevantProductSummary === 'function') {
      summary = window.productExtractor.getRelevantProductSummary(product);
    } else {
      summary = [
        product.title ? `Title: ${product.title}` : '',
        product.price ? `Price: ${product.price}` : '',
        product.condition ? `Condition: ${product.condition}` : '',
        product.location ? `Location: ${product.location}` : '',
        product.description ? `Description: ${product.description}` : ''
      ].filter(Boolean).join('\n');
    }
    content.push({
      type: "text",
      text: "PRODUCT DETAILS:\n" + summary
    });

    // 2. Get the original image URLs.
    let originalImageUrls = [];
    if (Array.isArray(product.allImages) && product.allImages.length > 0) {
      originalImageUrls = product.allImages;
    } else if (Array.isArray(product.images) && product.images.length > 0) {
      originalImageUrls = product.images;
    }

    // 3. MODIFIED: Process URLs with the configured quality
    let processedImageUrls = [];
    if (originalImageUrls.length > 0) {
      // Use the new centralized method to process images
      processedImageUrls = await this.processImagesForOpenAI(originalImageUrls);
    }

    // 4. Add the processed URLs to the message
    const maxImages = CONFIG.threadSystem?.newThreads?.maxProductImages || 5;
    for (const imgUrl of processedImageUrls.slice(0, maxImages)) {
      if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '') continue;
      content.push({
        type: "image_url",
        image_url: {
          url: imgUrl,
          // Use the configured quality for the image detail
          detail: CONFIG.images?.quality || "auto"
        }
      });
    }

    return {
      role: "user",
      content
    };
  }

  //===================================================================
  // FORMATTING FOR OPENAI
  //===================================================================

  /**
   * Formats messages for OpenAI
   * @param {Array} messages - Chat messages
   * @param {Object} productDetails - Product details (optional)
   * @returns {Array} Messages formatted for OpenAI
   */
  async formatMessagesForOpenAI(messages, productDetails = null) {
    if (!messages || !Array.isArray(messages)) {
      console.warn('[MessagePreprocessor][WARN] No valid messages to format');
      return [];
    }

    // NEW: Log for diagnostics
    console.log(`[MessagePreprocessor][DEBUG] formatMessagesForOpenAI received ${messages.length} messages`);

    // Array for OpenAI messages
    const openaiMessages = [];

    // Add product details if available
    if (productDetails) {
      try {
        const productMessage = await this.buildProductDetailMessage(productDetails);
        if (productMessage) {
          openaiMessages.push(productMessage);
        }
      } catch (error) {
        console.error('[MessagePreprocessor][ERROR] Error building product message:', error);
      }
    }

    // MODIFIED: Group messages but preserve important elements
    const messageGroups = this.groupMessagesByRoleImproved(messages);

    // NEW: Log for group diagnostics
    console.log(`[MessagePreprocessor][DEBUG] Messages grouped into ${messageGroups.length} groups`);

    // Convert groups to OpenAI format
    for (const messageGroup of messageGroups) {
      if (messageGroup.length === 0) continue;

      const openAIMessage = await this.convertMessageGroupToOpenAIFormat(messageGroup);
      if (openAIMessage) {
        openaiMessages.push(openAIMessage);
      }
    }

    // If audioTranscriber is present, show transcription summary
    if (window.audioTranscriber && typeof window.audioTranscriber.showTranscriptionLogs === 'function') {
      window.audioTranscriber.showTranscriptionLogs();
    }

    // NEW: Detailed log of the final result
    console.log(`[MessagePreprocessor][PAYLOAD] Full content to be sent: `, JSON.parse(JSON.stringify(openaiMessages)));

    return openaiMessages;
  }

  /**
   * Improved version that groups by sender but preserves important elements like audio
   * @param {Array} messages - Messages to group
   * @returns {Array<Array>} Grouped messages
   */
  groupMessagesByRoleImproved(messages) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }

    const groups = [];
    let currentGroup = [];
    let currentSender = null;

    // Counters for statistics
    const stats = {
      totalGroups: 0,
      userGroups: 0,
      assistantGroups: 0,
      userMessages: 0,
      assistantMessages: 0,
      groupSizes: []
    };

    // Single log at the beginning
    console.log(`[MessagePreprocessor][DEBUG] Processing ${messages.length} messages for grouping`);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const isSentByUs = message.sentByUs;

      // MODIFIED: Start a new group if:
      // 1. It's the first message
      // 2. The sender changed
      // 3. The current message has multimedia content (audio, image, etc.)
      // 4. The previous message had multimedia content
      const hasMultimedia =
        message.content?.hasAudio ||
        message.content?.type === 'image' ||
        message.content?.type === 'video';

      const prevMessage = i > 0 ? messages[i - 1] : null;
      const prevHasMultimedia =
        prevMessage && (
          prevMessage.content?.hasAudio ||
          prevMessage.content?.type === 'image' ||
          prevMessage.content?.type === 'video'
        );

      const shouldStartNewGroup =
        i === 0 ||
        isSentByUs !== currentSender ||
        hasMultimedia ||
        prevHasMultimedia;

      if (shouldStartNewGroup) {
        // Save previous group if it exists
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);

          // Update statistics instead of logging
          stats.totalGroups++;
          stats.groupSizes.push(currentGroup.length);

          if (currentSender) {
            stats.assistantGroups++;
            stats.assistantMessages += currentGroup.length;
          } else {
            stats.userGroups++;
            stats.userMessages += currentGroup.length;
          }

          currentGroup = [];
        }
        currentSender = isSentByUs;
      }

      // Add message to the current group
      currentGroup.push(message);
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groups.push([...currentGroup]);

      // Update statistics for the last group
      stats.totalGroups++;
      stats.groupSizes.push(currentGroup.length);

      if (currentSender) {
        stats.assistantGroups++;
        stats.assistantMessages += currentGroup.length;
      } else {
        stats.userGroups++;
        stats.userMessages += currentGroup.length;
      }
    }

    // SINGLE, summarized log instead of multiple logs
    console.log(`[MessagePreprocessor][DEBUG] Messages grouped: ${messages.length} → ${groups.length} groups (${stats.userGroups} user, ${stats.assistantGroups} assistant)`);

    // Only show expandable details in debug mode
    if (window.CONFIG?.logging?.level === 'debug') {
      console.groupCollapsed('[MessagePreprocessor][DEBUG] Group details (expand to view)');
      groups.forEach((group, i) => {
        //console.log(`Group ${i+1}: ${group.length} messages, sentByUs=${group[0].sentByUs}`);
      });
      console.groupEnd();
    }

    return groups;
  }

  /**
   * Converts a message group to the OpenAI format, correctly handling
   * text, audio transcriptions, and images through the custom proxy.
   * @param {Array} messageGroup - Group of messages from the same sender.
   * @returns {Promise<Object|null>} Formatted message for OpenAI or null if empty.
   */
  async convertMessageGroupToOpenAIFormat(messageGroup) {
    const isSentByUs = messageGroup[0].sentByUs;
    const contentParts = [];
    let combinedText = '';

    // First, we collect all images to process them in a batch
    const imagesToProcess = [];

    for (const message of messageGroup) {
      // 1. Message text - we sanitize and combine
      if (message.content?.text) {
        combinedText += `${message.content.text}\n`;
      }

      // 2. Audio transcription
      if (message.content?.hasAudio) {
        let audioTranscription = null;

        // Option 1: Already has an assigned transcription
        if (
          message.content.transcribedAudio &&
          message.content.transcribedAudio !== '[Transcription Pending]'
        ) {
          audioTranscription = message.content.transcribedAudio;
        }
        // Option 2: Has an audio URL, try to get transcription directly
        else if (message.content.audioUrl) {
          const cleanUrl = message.content.audioUrl.split('?')[0];
          audioTranscription = window.audioTranscriber?.getTranscription(cleanUrl);
        }
        // Option 3: Has audioMarkerId, search in completedTranscriptions
        else if (
          message.content.audioMarkerId &&
          window.audioTranscriber?.completedTranscriptions
        ) {
          for (const [url, data] of window.audioTranscriber.completedTranscriptions.entries()) {
            if (data.messageId === message.content.audioMarkerId) {
              audioTranscription = data.text;
              break;
            }
          }
        }

        // Add transcription to the text if available
        if (audioTranscription && audioTranscription !== '[Transcription Pending]') {
          combinedText += `\n[Audio transcription: "${audioTranscription.trim()}"]\n`;
        } else {
          combinedText += '\n[Audio message - no transcription available]\n';
        }
      }

      // 3. We collect the images to process them together
      if (message.content?.media?.images && message.content.media.images.length > 0) {
        for (const image of message.content.media.images) {
          if (image.url) {
            imagesToProcess.push(image.url);
          }
        }
      }
    }

    // 4. Process all images together with the configured quality
    let hasImages = false;
    if (imagesToProcess.length > 0) {
      hasImages = true;
      const processedImageUrls = await this.processImagesForOpenAI(imagesToProcess);

      for (const imageUrl of processedImageUrls) {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: window.CONFIG?.images?.quality || "auto"
          }
        });
      }
    }

    // 5. Add the combined text at the beginning of the content
    const sanitizedText = this.sanitizeText(combinedText.trim());
    if (sanitizedText) {
      contentParts.unshift({
        type: "text",
        text: sanitizedText
      });
    }

    // If after the whole process there is no content, ignore this group
    if (contentParts.length === 0) {
      return null;
    }

    // Messages with images cannot have role=assistant
    let role = isSentByUs ? 'assistant' : 'user';
    if (hasImages && role === 'assistant') {
      console.log('[MessagePreprocessor][WARN] Changing role to user for message with images');
      role = 'user';
    }

    return {
      role: role,
      content: contentParts
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
