/**
 * Assistant Handler - "The Operator"
 * 
 * Responsibilities:
 * - Receive a threadId and messages prepared by MessagePreprocessor
 * - Use ApiClient to add messages to the thread
 * - Create runs in the thread
 * - Wait for the run to complete
 * - Get and return the final response
 */

class AssistantHandler {
  constructor() {
    // Configuration
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
    this.maxWaitTime = 60000; // 1 minute
    this.initialized = false;
  }

  /**
   * Initializes the assistant handler
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Check required dependencies
      if (!window.apiClient || !window.threadStore || !window.messagePreprocessor) {
        logger.error('Missing required dependencies for AssistantHandler');
        return false;
      }

      // Initialize ThreadStore if not already done
      if (window.threadStore && typeof window.threadStore.initialize === 'function' &&
        !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }

      this.initialized = true;
      console.log('AssistantHandler initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AssistantHandler', {}, error);
      return false;
    }
  }

  /**
     * Generates a response based on the chat context
     * @param {string} fbThreadId - Facebook thread ID
     * @param {Array} allMessages - All messages in the chat
     * @param {string} chatRole - Role (seller or buyer)
     * @param {Object} productData - Product information
     * @returns {Promise<string>} Generated response
     */
  async generateResponse(fbThreadId, allMessages, chatRole, productData) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!fbThreadId || !allMessages || !Array.isArray(allMessages)) {
      throw new Error('Invalid parameters for generateResponse');
    }

    // Validate and set default chatRole if needed
    if (chatRole !== 'seller' && chatRole !== 'buyer') {
      logger.warn(`Invalid chat role: ${chatRole}, defaulting to seller`);
      chatRole = 'seller';
    }

    console.log(`Generating response for thread ${fbThreadId} as ${chatRole}`);
    console.log(`[AssistantHandler] Step 4.1: Generating response for thread ${fbThreadId} as ${chatRole}`);

    try {
      // Primero asegurar que ThreadStore está inicializado
      if (window.threadStore && typeof window.threadStore.initialize === 'function' &&
        !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }

      // Primera verificación del thread
      let threadInfo = window.threadStore?.getThreadInfo(fbThreadId);

      // Choose appropriate flow
      if (!threadInfo) {
        return await this.handleNewThread(fbThreadId, allMessages, chatRole, productData);
      } else {
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo);
      }
    } catch (error) {
      logger.error(`Error generating response: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Handles a new thread that doesn't exist yet
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} productData - Product information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleNewThread(fbThreadId, allMessages, chatRole, productData) {
    console.log(`[AssistantHandler][DEBUG] handleNewThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    console.log('No existing thread found, creating new one');
    console.log('[AssistantHandler] Processing new thread flow...');

    // Verificar nuevamente con recarga forzada antes de crear el thread
    // Para asegurar que no se haya creado por otra operación en paralelo
    if (window.threadStore) {
      const threadInfoCheck = window.threadStore.getThreadInfo(fbThreadId, true); // Forzar recarga
      if (threadInfoCheck) {
        console.log(`[AssistantHandler][DEBUG] Thread encontrado en verificación final, usando existente en lugar de crear nuevo`);
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfoCheck);
      }
    }

    // Crear nuevo thread solo si realmente no existe después de la verificación final
    console.log(`[AssistantHandler][DEBUG] Creando nuevo thread en OpenAI para ${fbThreadId}`);
    const threadInfo = await this.createNewThread(fbThreadId, chatRole);

    // Get assistant ID for the role
    console.log(`[AssistantHandler][DEBUG] Obteniendo ID de asistente para role: ${chatRole}`);
    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      console.log(`[AssistantHandler][ERROR] No se encontró ID de asistente para role: ${chatRole}`);
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] ID de asistente obtenido: ${assistantId}`);

    // Prepare messages with product info and transcriptions
    console.log('[AssistantHandler] Step 4.2: Preparing messages for new thread...');

    // 1. Attach product info to messages if available
    console.log(`[AssistantHandler][DEBUG] Adjuntando información de producto: ${!!productData}`);
    const messagesWithProduct = window.messagePreprocessor.attachProductInfo(allMessages, productData);
    console.log('[AssistantHandler] [DEBUG] After attachProductInfo:', messagesWithProduct);

    // 2. Process transcriptions (in parallel with other operations)
    console.log(`[AssistantHandler][DEBUG] Procesando transcripciones de audio`);
    let messagesWithTranscriptions;
    if (window.messagePreprocessor.attachTranscriptions.constructor.name === 'AsyncFunction') {
      messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(messagesWithProduct);
    } else {
      messagesWithTranscriptions = window.messagePreprocessor.attachTranscriptions(messagesWithProduct);
    }
    console.log('[AssistantHandler] [DEBUG] After attachTranscriptions:', messagesWithTranscriptions);

    // 3. Format messages for OpenAI (limit to recent messages for new threads)
    console.log(`[AssistantHandler][DEBUG] Formateando mensajes para OpenAI (limitando a los ${Math.min(messagesWithTranscriptions.length, 50)} más recientes)`);
    const openAIMessages = window.messagePreprocessor.formatMessagesForOpenAI(
      messagesWithTranscriptions.slice(-50)
    );

    // Filter and validate messages
    console.log(`[AssistantHandler][DEBUG] Validando mensajes: ${openAIMessages.length} grupos de mensajes`);
    const validatedMessages = this.validateMessages(openAIMessages);
    console.log(`[AssistantHandler][DEBUG] Mensajes validados: ${validatedMessages.length} grupos`);

    if (!validatedMessages.length) {
      console.log(`[AssistantHandler][WARN] No hay mensajes válidos para procesar en este nuevo thread`);
      logger.warn('No valid messages to process for new thread');
      return '';
    }

    // 4. Add messages to the OpenAI thread
    console.log(`[AssistantHandler][DEBUG] Agregando ${validatedMessages.length} mensajes al hilo ${threadInfo.openaiThreadId}`);
    for (const message of validatedMessages) {
      await window.apiClient.addMessage(threadInfo.openaiThreadId, message);
    }

    // 5. Create a run with the appropriate assistant
    console.log(`[AssistantHandler][DEBUG] Creando run con assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(threadInfo.openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run creado: ${runId}`);

    // 6. Wait for completion and process response
    console.log(`[AssistantHandler][DEBUG] Esperando completación del run ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(
      threadInfo.openaiThreadId,
      runId,
      this.maxWaitTime
    );
    console.log(`[AssistantHandler][DEBUG] Run completado con status: ${runResult.status}`);

    // 7. Process results
    if (runResult.status === 'completed' && runResult.output) {
      // Update thread info with latest message ID
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const messageId = lastMessage.id || window.messagePreprocessor.generateMessageId(lastMessage.content?.text, Date.now());
        console.log(`[AssistantHandler][DEBUG] Actualizando lastMessageId a ${messageId}`);
        window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      }

      console.log(`[AssistantHandler][DEBUG] Procesando respuesta del run completado`);
      const response = this.processResponse(runResult.output);
      console.log(`[AssistantHandler][DEBUG] Respuesta procesada: "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`);
      return response;
    } else if (runResult.status === 'failed') {
      console.log(`[AssistantHandler][ERROR] Run falló: ${runResult.error?.message || 'Unknown error'}`);
      throw new Error(`Run failed: ${runResult.error?.message || 'Unknown error'}`);
    } else {
      console.log(`[AssistantHandler][ERROR] Run no completó: ${runResult.status}`);
      throw new Error(`Run did not complete: ${runResult.status}`);
    }
  }

  /**
   * Handles an existing thread that already has history
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} threadInfo - Existing thread information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo) {
    console.log(`[AssistantHandler][DEBUG] handleExistingThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);

    // Caso especial: thread existe pero sin lastMessageId
    if (!threadInfo.lastMessageId) {
      console.log(`[AssistantHandler][DEBUG] Thread existe pero tiene lastMessageId nulo. Procesando como primera interacción real.`);
      console.log(`Thread exists but has null lastMessageId. Processing as first real interaction.`);
      console.log('[AssistantHandler] Processing existing thread with first-time flow...');
    } else {
      console.log(`[AssistantHandler][DEBUG] Procesando thread existente con lastMessageId: ${threadInfo.lastMessageId}`);
      console.log(`Processing existing thread with last message ID: ${threadInfo.lastMessageId}`);
      console.log('[AssistantHandler] Processing existing thread flow...');
    }

    // Get assistant ID for the role
    console.log(`[AssistantHandler][DEBUG] Obteniendo ID de asistente para role: ${chatRole}`);
    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      console.log(`[AssistantHandler][ERROR] No se encontró ID de asistente para role: ${chatRole}`);
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] ID de asistente obtenido: ${assistantId}`);

    // MODIFICACIÓN: Primero obtener los nuevos mensajes sin transcripción
    console.log(`[AssistantHandler][DEBUG] Obteniendo nuevos mensajes desde el último procesado: ${threadInfo.lastMessageId}`);
    const newMessages = window.messagePreprocessor.getNewMessagesSinceNoFormat(
      allMessages,
      threadInfo.lastMessageId
    );
    console.log(`[AssistantHandler][DEBUG] Encontrados ${newMessages.length} mensajes nuevos`);

    // MODIFICACIÓN: Procesar transcripciones SOLO para los nuevos mensajes
    console.log(`[AssistantHandler][DEBUG] Procesando transcripciones solo para los ${newMessages.length} mensajes nuevos`);
    let messagesWithTranscriptions;
    if (window.messagePreprocessor.attachTranscriptions.constructor.name === 'AsyncFunction') {
      messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(newMessages);
    } else {
      messagesWithTranscriptions = window.messagePreprocessor.attachTranscriptions(newMessages);
    }
    console.log('[AssistantHandler][DEBUG] After attachTranscriptions:', messagesWithTranscriptions);

    // Formatear mensajes para OpenAI
    console.log(`[AssistantHandler][DEBUG] Formateando ${messagesWithTranscriptions.length} mensajes nuevos para OpenAI`);
    const openAIMessages = window.messagePreprocessor.formatMessagesForOpenAI(messagesWithTranscriptions);
    console.log('[AssistantHandler][DEBUG] New messages for OpenAI:', openAIMessages);

    // Filter and validate messages
    console.log(`[AssistantHandler][DEBUG] Validando mensajes: ${openAIMessages.length} grupos de mensajes`);
    const validatedMessages = this.validateMessages(openAIMessages);
    console.log(`[AssistantHandler][DEBUG] Mensajes validados: ${validatedMessages.length} grupos`);

    if (!validatedMessages.length) {
      console.log(`[AssistantHandler][WARN] No hay mensajes nuevos válidos para procesar en este thread existente`);
      logger.warn('No new valid messages to process for existing thread');
      return '';
    }

    // Add new messages to the OpenAI thread
    console.log(`[AssistantHandler][DEBUG] Agregando ${validatedMessages.length} mensajes al hilo ${threadInfo.openaiThreadId}`);
    for (const message of validatedMessages) {
      await window.apiClient.addMessage(threadInfo.openaiThreadId, message);
    }

    // Create a run with the appropriate assistant
    console.log(`[AssistantHandler][DEBUG] Creando run con assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(threadInfo.openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run creado: ${runId}`);

    // Wait for completion and process response
    console.log(`[AssistantHandler][DEBUG] Esperando completación del run ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(
      threadInfo.openaiThreadId,
      runId,
      this.maxWaitTime
    );
    console.log(`[AssistantHandler][DEBUG] Run completado con status: ${runResult.status}`);

    // Process results
    if (runResult.status === 'completed' && runResult.output) {
      // Update thread info with latest message ID
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        const messageId = lastMessage.id || window.messagePreprocessor.generateMessageId(lastMessage.content?.text, Date.now());
        console.log(`[AssistantHandler][DEBUG] Actualizando lastMessageId a ${messageId}`);
        window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      }

      console.log(`[AssistantHandler][DEBUG] Procesando respuesta del run completado`);
      const response = this.processResponse(runResult.output);
      console.log(`[AssistantHandler][DEBUG] Respuesta procesada: "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`);
      return response;
    } else if (runResult.status === 'failed') {
      console.log(`[AssistantHandler][ERROR] Run falló: ${runResult.error?.message || 'Unknown error'}`);
      throw new Error(`Run failed: ${runResult.error?.message || 'Unknown error'}`);
    } else {
      console.log(`[AssistantHandler][ERROR] Run no completó: ${runResult.status}`);
      throw new Error(`Run did not complete: ${runResult.status}`);
    }
  }

  /**
   * Creates a new OpenAI thread and stores the mapping
   * @param {string} fbThreadId - Facebook thread ID
   * @param {string} chatRole - Role (seller or buyer)
   * @returns {Promise<Object>} Thread info
   * @private
   */
  async createNewThread(fbThreadId, chatRole) {
    try {
      console.log(`Creating new thread for ${fbThreadId} as ${chatRole}`);

      // Create the thread in OpenAI
      const { id: openaiThreadId } = await window.apiClient.createThread();

      // Create and store thread info
      const threadInfo = window.threadStore.createThreadInfo(
        fbThreadId,
        openaiThreadId,
        chatRole
      );

      console.log(`New thread created successfully: ${openaiThreadId}`);
      return threadInfo;
    } catch (error) {
      logger.error(`Error creating new thread: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Validates messages for the OpenAI API
   * @param {Array} messages - Messages to validate
   * @returns {Array} Valid messages
   * @private
   */
  validateMessages(messages) {
    console.log(`[AssistantHandler][DEBUG] validateMessages - validando ${messages ? messages.length : 0} mensajes`);
    if (!messages || !Array.isArray(messages)) {
      console.log(`[AssistantHandler][ERROR] Array de mensajes inválido en validateMessages`);
      return [];
    }

    // Remove messages with empty content or not an array
    const validMessages = messages.filter(msg =>
      Array.isArray(msg.content) && msg.content.length > 0
    );

    console.log(`[AssistantHandler][DEBUG] Validación completada: ${validMessages.length}/${messages.length} mensajes válidos`);
    if (messages.length > 0 && validMessages.length === 0) {
      console.log(`[AssistantHandler][DEBUG] Mensajes inválidos encontrados:`, messages);
    }

    return validMessages;
  }

  /**
   * Gets an assistant ID according to the role
   * @param {string} role - Role ('seller' or 'buyer')
   * @returns {string} Assistant ID
   */
  getAssistantIdForRole(role) {
    // DEBUG: Log the current assistant config for troubleshooting
    logger.debug('AssistantHandler: CONFIG.AI.assistants:', JSON.stringify(window.CONFIG?.AI?.assistants));
    logger.debug('AssistantHandler: CONFIG:', JSON.stringify(window.CONFIG));

    // Check for configuration
    if (!window.CONFIG || !window.CONFIG.AI || !window.CONFIG.AI.assistants) {
      logger.error('Assistant configuration not found');
      // RECOVERY ATTEMPT: Force reload from window.CONFIG if it exists globally
      if (typeof CONFIG !== 'undefined' && CONFIG.AI && CONFIG.AI.assistants) {
        window.CONFIG = CONFIG;
        logger.warn('AssistantHandler: CONFIG.AI.assistants recovered from global CONFIG variable');
      } else {
        return null;
      }
    }

    // Get the assistant for the role
    const assistant = window.CONFIG.AI.assistants[role];
    if (!assistant || !assistant.id) {
      logger.error(`No assistant configured for role: ${role}`);
      return null;
    }

    return assistant.id;
  }

  /**
   * Processes the response to extract the text
   * @param {Array} messages - Thread messages from API
   * @returns {string} Response text
   */
  processResponse(messages) {
    console.log(`[AssistantHandler][DEBUG] processResponse - procesando ${messages ? messages.length : 0} mensajes`);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log(`[AssistantHandler][ERROR] No hay mensajes en la respuesta para procesar`);
      logger.error('No messages in response to process');
      return '';
    }

    try {
      // Full log for debugging
      console.log('[AssistantHandler][DEBUG] Messages received from API:', messages);

      // Find the first assistant message
      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      if (!assistantMessage) {
        console.log(`[AssistantHandler][WARN] No se encontró mensaje de asistente en la respuesta`);
        logger.warn('No assistant message found in response');
        return '';
      }
      console.log(`[AssistantHandler][DEBUG] Mensaje de asistente encontrado con contenido tipo: ${typeof assistantMessage.content}`);

      // Extract the response text, supporting various formats
      let responseText = '';

      if (Array.isArray(assistantMessage.content)) {
        // Supports formats: {type: 'text', text: '...'} and {type: 'text', text: {value: '...'}}
        responseText = assistantMessage.content
          .filter(part => part.type === 'text')
          .map(part => {
            if (typeof part.text === 'string') return part.text;
            if (part.text && typeof part.text.value === 'string') return part.text.value;
            return '';
          })
          .join(' ')
          .trim();
      } else if (typeof assistantMessage.content === 'string') {
        responseText = assistantMessage.content.trim();
      } else if (typeof assistantMessage.content === 'object' && assistantMessage.content.text) {
        if (typeof assistantMessage.content.text === 'string') {
          responseText = assistantMessage.content.text.trim();
        } else if (typeof assistantMessage.content.text.value === 'string') {
          responseText = assistantMessage.content.text.value.trim();
        }
      }

      console.log(`[AssistantHandler][DEBUG] Respuesta procesada: "${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"`);
      return responseText;
    } catch (error) {
      console.log(`[AssistantHandler][ERROR] Error procesando respuesta: ${error.message}`, error);
      logger.error(`Error processing response: ${error.message}`, {}, error);
      return '';
    }
  }

  /**
   * Runs an assistant in a thread and returns the response
   * @param {string} threadId - OpenAI thread ID
   * @param {string} assistantId - Assistant ID to use
   * @param {Array} messages - Messages prepared to add
   * @returns {Promise<string>} Generated response
   */
  async run(threadId, assistantId, messages) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!threadId || !assistantId || !messages) {
      throw new Error('Missing required parameters for run');
    }

    try {
      // Add messages to the thread
      for (const message of messages) {
        await window.apiClient.addMessage(threadId, message);
      }

      // Create a run
      const { runId } = await window.apiClient.createRun(threadId, assistantId);

      // Wait for completion
      const runResult = await window.apiClient.waitForRunCompletion(
        threadId,
        runId,
        this.maxWaitTime
      );

      // Process the response
      if (runResult.status === 'completed' && runResult.output) {
        return this.processResponse(runResult.output);
      } else if (runResult.status === 'failed') {
        throw new Error(`Run failed: ${runResult.error?.message || 'Unknown error'}`);
      } else {
        throw new Error(`Run did not complete: ${runResult.status}`);
      }
    } catch (error) {
      logger.error(`Error in run method: ${error.message}`, {}, error);
      throw error;
    }
  }
}

// Create global singleton instance
const assistantHandler = new AssistantHandler();

// Expose globally
window.assistantHandler = assistantHandler;
