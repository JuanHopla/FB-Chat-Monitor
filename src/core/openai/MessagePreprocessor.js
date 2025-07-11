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
 * Gets new messages since the last processed message without formatting them
 * @param {Array} messages - All messages in the chat
 * @param {string} lastMessageId - ID of the last processed message
 * @returns {Array} New messages since lastMessageId (without formatting)
 */
  getNewMessagesSinceNoFormat(messages, lastMessageId) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[MessagePreprocessor][ERROR] Array de mensajes inválido proporcionado a getNewMessagesSinceNoFormat`);
      logger.error('Invalid messages array provided to getNewMessagesSinceNoFormat');
      return [];
    }

    // If no lastMessageId, return all messages (up to limit)
    if (!lastMessageId) {
      console.log(`[MessagePreprocessor][DEBUG] No se proporcionó lastMessageId, usando todos los mensajes`);
      return messages.slice(-this.config.maxMessagesInNewThread);
    }

    // Find the index of the last processed message
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);

    if (lastIndex === -1) {
      console.log(`[MessagePreprocessor][WARN] Último ID ${lastMessageId} no encontrado, usando fallback por timestamp`);
      logger.warn(`Last message ID ${lastMessageId} not found, using timestamp-based fallback`);
      return this.getNewMessagesUsingTimestampFallbackNoFormat(messages, lastMessageId);
    }

    // Get messages after the last processed one
    const newMessages = messages.slice(lastIndex + 1);
    console.log(`[MessagePreprocessor][DEBUG] Encontrados ${newMessages.length} mensajes nuevos desde ${lastMessageId}`);

    // If no new messages, return just the last message for context
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log(`[MessagePreprocessor][DEBUG] No hay mensajes nuevos, devolviendo solo el último mensaje para contexto`);
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
      console.log(`[MessagePreprocessor][ERROR] Array de mensajes inválido proporcionado a getNewMessagesSince`);
      logger.error('Invalid messages array provided to getNewMessagesSince');
      return [];
    }

    // If no lastMessageId, return all messages (up to limit)
    if (!lastMessageId) {
      console.log(`[MessagePreprocessor][DEBUG] No se proporcionó lastMessageId, usando todos los mensajes`);
      return this.formatMessagesForOpenAI(
        messages.slice(-this.config.maxMessagesInNewThread)
      );
    }

    // Find the index of the last processed message
    const lastIndex = messages.findIndex(msg => msg.id === lastMessageId);

    if (lastIndex === -1) {
      console.log(`[MessagePreprocessor][WARN] Último ID ${lastMessageId} no encontrado, usando fallback por timestamp`);
      logger.warn(`Last message ID ${lastMessageId} not found, using timestamp-based fallback`);
      return this.getNewMessagesUsingTimestampFallback(messages, lastMessageId);
    }

    // Get messages after the last processed one
    const newMessages = messages.slice(lastIndex + 1);
    console.log(`[MessagePreprocessor][DEBUG] Encontrados ${newMessages.length} mensajes nuevos desde ${lastMessageId}`);

    // If no new messages, return just the last message for context
    if (newMessages.length === 0) {
      const lastMessage = messages[messages.length - 1];
      console.log(`[MessagePreprocessor][DEBUG] No hay mensajes nuevos, devolviendo solo el último mensaje para contexto`);
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

    // Retorna los mensajes sin formatear para OpenAI (diferencia clave con el otro método)
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
   * Adjunta transcripciones a mensajes de audio usando AudioTranscriber
   * @param {Array} messages - Mensajes a procesar
   * @returns {Promise<Array>} Mensajes con transcripciones adjuntas
   */
  async attachTranscriptions(messages) {
    if (!messages || !Array.isArray(messages)) {
      console.log("[MessagePreprocessor][ERROR] Array de mensajes inválido proporcionado a attachTranscriptions");
      return messages;
    }

    // Verificar que AudioTranscriber está disponible
    if (!window.audioTranscriber) {
      console.log("[MessagePreprocessor][WARN] AudioTranscriber no disponible para transcripciones");
      return messages;
    }

    // Asegurar que AudioTranscriber está inicializado
    if (!window.audioTranscriber.initialized && typeof window.audioTranscriber.initialize === 'function') {
      await window.audioTranscriber.initialize();
    }

    // MEJORADO: Encontrar mensajes que necesitan transcripción Y también aquellos con hasAudio=true
    const messagesToTranscribe = messages.filter(message =>
    (message.content?.hasAudio &&
      (!message.content.transcribedAudio || message.content.transcribedAudio === '[Transcription Pending]'))
    );

    console.log(`[MessagePreprocessor][DEBUG] attachTranscriptions - Encontrados ${messagesToTranscribe.length} mensajes que necesitan transcripción`);

    // Si no hay mensajes para transcribir, devolver los originales
    if (messagesToTranscribe.length === 0) {
      return messages;
    }

    try {
      // Primero intentar con URLs directas si existen
      for (const message of messagesToTranscribe) {
        // Si el mensaje tiene URL directa, intentar obtener transcripción
        if (message.content.audioUrl) {
          const cleanUrl = message.content.audioUrl.split('?')[0];
          const transcription = window.audioTranscriber.getTranscription(cleanUrl);

          if (transcription) {
            message.content.transcribedAudio = transcription;
            console.log(`[MessagePreprocessor][DEBUG] Transcripción adjuntada a mensaje con URL directa: ${message.id}`);
          }
        }
      }

      // NUEVO: Para los mensajes sin URL directa pero con hasAudio=true, buscar en transcripciones completadas
      // usando timestamp de proximidad para asociarlos
      const remainingMessages = messagesToTranscribe.filter(m =>
        !m.content.transcribedAudio || m.content.transcribedAudio === '[Transcription Pending]'
      );

      if (remainingMessages.length > 0 && window.audioTranscriber.completedTranscriptions.size > 0) {
        console.log(`[MessagePreprocessor][DEBUG] Intentando asociar ${remainingMessages.length} mensajes con transcripciones por timestamp`);

        // Obtener todas las transcripciones completadas y ordenarlas por timestamp
        const transcriptions = Array.from(window.audioTranscriber.completedTranscriptions.entries())
          .filter(([, data]) => data.text && data.text.trim() !== '') // Solo considerar transcripciones no vacías
          .map(([url, data]) => ({
            url,
            text: data.text,
            timestamp: data.timestamp
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        // Ordenar mensajes por timestamp
        remainingMessages.sort((a, b) => a.timestamp - b.timestamp);

        // Asociar por orden de aparición si hay un número similar
        const limit = Math.min(remainingMessages.length, transcriptions.length);

        for (let i = 0; i < limit; i++) {
          remainingMessages[i].content.transcribedAudio = transcriptions[i].text;
          console.log(`[MessagePreprocessor][DEBUG] Asociada transcripción por orden: "${transcriptions[i].text.substring(0, 20)}..." a mensaje ${remainingMessages[i].id}`);
        }
      }

      return messages;
    } catch (error) {
      console.error('[MessagePreprocessor][ERROR] Error al adjuntar transcripciones:', error);
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
   * asegurando roles explícitos, chunking de máximo 10 elementos por mensaje e incluyendo transcripciones.
   * @param {Array} messages - Mensajes del chat
   * @param {Object} [productDetails] - Detalles del producto (opcional)
   * @returns {Array} Mensajes formateados para OpenAI
   */
  formatMessagesForOpenAI(messages, productDetails = null) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[MessagePreprocessor][DEBUG] No hay mensajes para formatear para OpenAI`);
      return [];
    }

    console.log(`[MessagePreprocessor][DEBUG] Formateando ${messages.length} mensajes para OpenAI, producto: ${!!productDetails}`);

    const formattedGroups = [];

    // 1. Agrega el mensaje de producto como primer mensaje si hay detalles
    if (productDetails) {
      const productMsg = this.buildProductDetailMessage(productDetails);
      if (productMsg) {
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

    // 3. Procesa cada grupo con transcripciones
    for (const group of grouped) {
      const formatted = this.convertMessageGroupToOpenAIFormat(group);
      // 4. Chunking de máximo 10 elementos por mensaje
      for (let i = 0; i < formatted.content.length; i += 10) {
        formattedGroups.push({
          role: formatted.role,
          content: formatted.content.slice(i, i + 10)
        });
      }
    }

    console.log(`[MessagePreprocessor][DEBUG] Formateados ${formattedGroups.length} grupos de mensajes para OpenAI`);
    return formattedGroups;
  }

  /**
   * Convierte un grupo de mensajes al formato de OpenAI incluyendo transcripciones
   * @param {Array} messageGroup - Grupo de mensajes del mismo remitente
   * @returns {Object} Mensaje formateado para OpenAI
   */
  convertMessageGroupToOpenAIFormat(messageGroup) {
    const isSentByUs = messageGroup[0].sentByUs;
    const role = isSentByUs ? 'user' : 'assistant';
    const content = [];

    for (const message of messageGroup) {
      let textContent = message.content?.text || '';

      // NUEVO: Si hay transcripción de audio, añadirla
      if (message.content?.hasAudio &&
          message.content.transcribedAudio &&
          message.content.transcribedAudio !== '[Transcription Pending]') {
        textContent += `\n[Audio transcription: "${message.content.transcribedAudio.trim()}"]`;
      }

      if (textContent) {
        content.push({
          type: "text",
          text: this.sanitizeText(textContent)
        });
      }

      // Imágenes si existen
      if (message.content?.images && message.content.images.length > 0) {
        for (const imageUrl of message.content.images) {
          if (!imageUrl) continue;
          content.push({
            type: "image_url",
            image_url: { url: imageUrl }
          });
        }
      }
    }

    return { role, content };
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
