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
   * @param {Array|Object} messageData - Mensajes o objeto {messages, timeBlocks} a procesar
   * @returns {Promise<Array>} Mensajes con transcripciones adjuntas
   */
  async attachTranscriptions(messageData) {
    // Compatibilidad con diferentes formatos de entrada
    let messages = Array.isArray(messageData) ? messageData : messageData?.messages;
    const timeBlocks = messageData?.timeBlocks || [];

    if (!messages || !Array.isArray(messages)) {
      console.log("[MessagePreprocessor][ERROR] Array de mensajes inválido proporcionado a attachTranscriptions");
      return messageData;
    }

    // Verificar que AudioTranscriber está disponible
    if (!window.audioTranscriber) {
      console.log("[MessagePreprocessor][WARN] AudioTranscriber no disponible para transcripciones");
      return messageData;
    }

    // Asegurar que AudioTranscriber está inicializado
    if (!window.audioTranscriber.initialized && typeof window.audioTranscriber.initialize === 'function') {
      await window.audioTranscriber.initialize();
    }

    // Encontrar mensajes que necesitan transcripción
    const messagesToTranscribe = messages.filter(message =>
    (message.content?.hasAudio &&
      (!message.content.transcribedAudio || message.content.transcribedAudio === '[Transcription Pending]'))
    );

    // Usar logger en lugar de console.log directo
    if (window.logger && typeof window.logger.debug === 'function') {
      window.logger.debug(
        `attachTranscriptions - Encontrados ${messagesToTranscribe.length} mensajes que necesitan transcripción`,
        {},
        'MessagePreprocessor'
      );
    } else {
      console.log(`[MessagePreprocessor][DEBUG] attachTranscriptions - Encontrados ${messagesToTranscribe.length} mensajes que necesitan transcripción`);
    }

    if (messagesToTranscribe.length === 0) {
      return messageData; // No hay mensajes para transcribir
    }

    // NUEVO: Esperar brevemente para permitir que algunas transcripciones se completen
    console.log("[MessagePreprocessor][DEBUG] Esperando brevemente para permitir transcripciones en proceso...");
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      // MODIFICACIÓN IMPORTANTE: Pasar el objeto completo con timeBlocks
      if (timeBlocks && timeBlocks.length > 0) {
        // Crear una nueva estructura para pasar a audioTranscriber
        const fullMessageData = {
          messages: messages,
          timeBlocks: timeBlocks
        };
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(fullMessageData);
      } else {
        // Mantener compatibilidad con la versión anterior
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(messages);
      }

      return messages;
    } catch (error) {
      console.error("[MessagePreprocessor][ERROR] Error al asociar transcripciones:", error);
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
 * Procesa imágenes para OpenAI, usando el proxy y la calidad configurada
 * @param {Array} imageUrls - URLs de imágenes a procesar
 * @returns {Promise<Array>} - URLs procesadas
 * @private
 */
  async processImagesForOpenAI(imageUrls) {
    try {
      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return [];
      }

      // Obtener la calidad de imagen de la configuración
      const imageQuality = window.CONFIG?.images?.quality || 'high';
      logger.debug(`[MessagePreprocessor] Procesando ${imageUrls.length} imágenes con calidad: ${imageQuality}`);

      // Usar ImageFilterUtils para procesar las imágenes con la calidad especificada
      if (window.ImageFilterUtils && typeof window.ImageFilterUtils.processImageUrls === 'function') {
        return await window.ImageFilterUtils.processImageUrls(imageUrls, imageQuality);
      } else {
        logger.warn('[MessagePreprocessor] ImageFilterUtils no disponible, devolviendo URLs originales');
        return imageUrls;
      }
    } catch (error) {
      logger.error('[MessagePreprocessor] Error procesando imágenes:', error);
      return imageUrls; // Devolver las originales en caso de error
    }
  }

  /**
   * Construye el mensaje de detalles de producto en formato OpenAI
   * @param {Object} product - Detalles del producto
   * @returns {Object|null} Mensaje OpenAI o null si no hay producto
   */
  async buildProductDetailMessage(product) {
    if (!product) {
      return null;
    }
    const content = [];

    // 1. Obtener el resumen textual del producto primero.
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

    // 2. Obtener las URLs de las imágenes originales.
    let originalImageUrls = [];
    if (Array.isArray(product.allImages) && product.allImages.length > 0) {
      originalImageUrls = product.allImages;
    } else if (Array.isArray(product.images) && product.images.length > 0) {
      originalImageUrls = product.images;
    }

    // 3. MODIFICADO: Procesar las URLs con la calidad configurada
    let processedImageUrls = [];
    if (originalImageUrls.length > 0) {
      // Usar el nuevo método centralizado para procesar imágenes
      processedImageUrls = await this.processImagesForOpenAI(originalImageUrls);
    }

    // 4. Añadir las URLs procesadas al mensaje
    const maxImages = CONFIG.threadSystem?.newThreads?.maxProductImages || 5;
    for (const imgUrl of processedImageUrls.slice(0, maxImages)) {
      if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '') continue;
      content.push({
        type: "image_url",
        image_url: {
          url: imgUrl,
          // Usar la calidad configurada para el detalle de la imagen
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
  // FORMATEO PARA OPENAI
  //===================================================================

  /**
   * Formatea mensajes para OpenAI
   * @param {Array} messages - Mensajes del chat
   * @param {Object} productDetails - Detalles del producto (opcional)
   * @returns {Array} Mensajes formateados para OpenAI
   */
  async formatMessagesForOpenAI(messages, productDetails = null) {
    if (!messages || !Array.isArray(messages)) {
      console.warn('[MessagePreprocessor][WARN] No valid messages to format');
      return [];
    }

    // NUEVO: Log para diagnóstico
    console.log(`[MessagePreprocessor][DEBUG] formatMessagesForOpenAI recibió ${messages.length} mensajes`);

    // Array para mensajes OpenAI
    const openaiMessages = [];

    // Añadir detalles del producto si están disponibles
    if (productDetails) {
      try {
        const productMessage = await this.buildProductDetailMessage(productDetails);
        if (productMessage) {
          openaiMessages.push(productMessage);
        }
      } catch (error) {
        console.error('[MessagePreprocessor][ERROR] Error al construir mensaje de producto:', error);
      }
    }

    // MODIFICADO: Agrupar mensajes pero preservando elementos importantes
    const messageGroups = this.groupMessagesByRoleImproved(messages);

    // NUEVO: Log para diagnóstico de grupos
    console.log(`[MessagePreprocessor][DEBUG] Mensajes agrupados en ${messageGroups.length} grupos`);
    messageGroups.forEach((group, index) => {
      console.log(`[MessagePreprocessor][DEBUG] Grupo ${index + 1}: ${group.length} mensajes, sentByUs=${group[0]?.sentByUs}`);
    });

    // Convertir grupos a formato OpenAI
    for (const messageGroup of messageGroups) {
      if (messageGroup.length === 0) continue;

      const openAIMessage = await this.convertMessageGroupToOpenAIFormat(messageGroup);
      if (openAIMessage) {
        openaiMessages.push(openAIMessage);
      }
    }

    // NUEVO: Log detallado del resultado final
    console.log(`[MessagePreprocessor][PAYLOAD] Contenido completo a enviar: `, JSON.parse(JSON.stringify(openaiMessages)));

    return openaiMessages;
  }

  /**
   * Versión mejorada que agrupa por remitente pero preserva elementos importantes como audios
   * @param {Array} messages - Mensajes a agrupar
   * @returns {Array<Array>} Mensajes agrupados
   */
  groupMessagesByRoleImproved(messages) {
    if (!messages || !Array.isArray(messages)) {
      return [];
    }

    const groups = [];
    let currentGroup = [];
    let currentSender = null;

    // NUEVO: Log para diagnóstico
    console.log(`[MessagePreprocessor][DEBUG] groupMessagesByRole: Procesando ${messages.length} mensajes`);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const isSentByUs = message.sentByUs;

      // MODIFICADO: Iniciar un nuevo grupo si:
      // 1. Es el primer mensaje
      // 2. El remitente cambió
      // 3. El mensaje actual tiene contenido multimedia (audio, imagen, etc.)
      // 4. El mensaje anterior tenía contenido multimedia
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
        // Guardar grupo anterior si existe
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup = [];
        }
        currentSender = isSentByUs;
      }

      // Añadir mensaje al grupo actual
      currentGroup.push(message);
    }

    // No olvidar el último grupo
    if (currentGroup.length > 0) {
      groups.push([...currentGroup]);
    }

    // NUEVO: Log para diagnóstico
    console.log(`[MessagePreprocessor][DEBUG] groupMessagesByRole: Generados ${groups.length} grupos`);

    return groups;
  }

  /**
     * Convierte un grupo de mensajes al formato de OpenAI, manejando correctamente
     * texto, transcripciones de audio e imágenes a través del proxy personalizado.
     * @param {Array} messageGroup - Grupo de mensajes del mismo remitente.
     * @returns {Promise<Object|null>} Mensaje formateado para OpenAI o null si está vacío.
     */
  async convertMessageGroupToOpenAIFormat(messageGroup) {
    const isSentByUs = messageGroup[0].sentByUs;
    const role = isSentByUs ? 'assistant' : 'user';
    const contentParts = [];
    let combinedText = '';

    // Recopilamos primero todas las imágenes para procesarlas en lote
    const imagesToProcess = [];

    for (const message of messageGroup) {
      // 1. Texto del mensaje - sanitizamos y combinamos
      if (message.content?.text) {
        combinedText += `${message.content.text}\n`;
      }

      // 2. Transcripción de audio
      if (message.content?.hasAudio) {
        let audioTranscription = null;

        // Opción 1: Ya tiene transcripción asignada
        if (
          message.content.transcribedAudio &&
          message.content.transcribedAudio !== '[Transcription Pending]'
        ) {
          audioTranscription = message.content.transcribedAudio;
        }
        // Opción 2: Tiene URL de audio, intentar obtener transcripción directamente
        else if (message.content.audioUrl) {
          const cleanUrl = message.content.audioUrl.split('?')[0];
          audioTranscription = window.audioTranscriber?.getTranscription(cleanUrl);
        }
        // Opción 3: Tiene audioMarkerId, buscar en completedTranscriptions
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

        // Añadir transcripción al texto si está disponible
        if (audioTranscription && audioTranscription !== '[Transcription Pending]') {
          combinedText += `\n[Audio transcription: "${audioTranscription.trim()}"]\n`;
        } else {
          combinedText += '\n[Audio message - no transcription available]\n';
        }
      }

      // 3. Recopilamos las imágenes para procesarlas juntas
      if (message.content?.media?.images && message.content.media.images.length > 0) {
        for (const image of message.content.media.images) {
          if (image.url) {
            imagesToProcess.push(image.url);
          }
        }
      }
    }

    // 4. Procesar todas las imágenes juntas con la calidad configurada
    if (imagesToProcess.length > 0) {
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

    // 5. Añadir el texto combinado al principio del contenido
    const sanitizedText = this.sanitizeText(combinedText.trim());
    if (sanitizedText) {
      contentParts.unshift({
        type: "text",
        text: sanitizedText
      });
    }

    // Si después de todo el proceso no hay contenido, ignorar este grupo
    if (contentParts.length === 0) {
      return null;
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
