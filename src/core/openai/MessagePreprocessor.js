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
   * Construye el mensaje de detalles de producto en formato OpenAI
   * @param {Object} product - Detalles del producto
   * @returns {Object|null} Mensaje OpenAI o null si no hay producto
   */
  buildProductDetailMessage(product) {
    if (!product) return null;
    const content = [];

    // Resumen textual
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
    content.push({ type: "text", text: "PRODUCT DETAILS:\n" + summary });

    // Imágenes (allImages preferido, fallback a images)
    let images = [];
    if (Array.isArray(product.allImages) && product.allImages.length > 0) {
      images = product.allImages;
    } else if (Array.isArray(product.images) && product.images.length > 0) {
      images = product.images;
    }
    if (window.ImageFilterUtils) {
      images = window.ImageFilterUtils.filterImageUrls(images);
    }
    for (const imgUrl of images.slice(0, 6)) {
      if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '') continue;
      if (window.ImageFilterUtils && window.ImageFilterUtils.isProblematicFacebookImage(imgUrl)) continue;
      content.push({ type: "image_url", image_url: { url: imgUrl } });
    }

    return {
      role: "user",
      content
    };
  }

  /**
   * Formatea mensajes para OpenAI, agregando detalles de producto como primer mensaje si corresponde,
   * asegurando roles explícitos y chunking de máximo 10 elementos por mensaje.
   * @param {Array} messages - Mensajes del chat
   * @param {Object} [productDetails] - Detalles del producto (opcional)
   * @returns {Array} Mensajes formateados para OpenAI
   */
  formatMessagesForOpenAI(messages, productDetails = null) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const formattedGroups = [];

    // 1. Agrega el mensaje de producto como primer mensaje si hay detalles
    if (productDetails) {
      const productMsg = this.buildProductDetailMessage(productDetails);
      if (productMsg) {
        // Chunking si hay más de 10 bloques
        for (let i = 0; i < productMsg.content.length; i += 10) {
          formattedGroups.push({
            role: "user",
            content: productMsg.content.slice(i, i + 10)
          });
        }
      }
    }

    // 2. Agrupa mensajes por remitente
    const grouped = this.groupMessagesByRole(messages);

    // 3. Procesa cada grupo
    for (const group of grouped) {
      // Junta todos los bloques de contenido del grupo
      let contentItems = [];
      for (const message of group) {
        // Textos
        if (message.content && message.content.text) {
          contentItems.push({
            type: 'text',
            text: this.sanitizeText(message.content.text)
          });
        }
        // Imágenes
        if (message.content && message.content.imageUrls && message.content.imageUrls.length > 0) {
          for (const imageUrl of message.content.imageUrls) {
            if (
              imageUrl &&
              typeof imageUrl === 'string' &&
              (!window.ImageFilterUtils || !window.ImageFilterUtils.isProblematicFacebookImage(imageUrl))
            ) {
              contentItems.push({
                type: 'image_url',
                image_url: { url: imageUrl }
              });
            }
          }
        }
      }

      // 4. Chunking de máximo 10 elementos por mensaje
      for (let i = 0; i < contentItems.length; i += 10) {
        formattedGroups.push({
          role: group[0].sentByUs ? 'assistant' : 'user',
          content: contentItems.slice(i, i + 10)
        });
      }
    }

    // Log mejorado
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

  /**
   * Adjunta la información del producto como el primer mensaje del usuario.
   * @param {Array} messages - Lista de mensajes
   * @param {Object} product - Detalles del producto
   * @returns {Array} Mensajes con el bloque de producto al inicio (si aplica)
   */
  attachProductInfo(messages, product) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }
    if (!product) {
      return messages;
    }
    // Construye el mensaje de producto usando el formato OpenAI
    const productMsg = this.buildProductDetailMessage(product);
    if (!productMsg) return messages;
    // Inserta el mensaje de producto como primer mensaje
    return [productMsg, ...messages];
  }
}

// Create global singleton instance
const messagePreprocessor = new MessagePreprocessor();

// Expose globally
window.messagePreprocessor = messagePreprocessor;
