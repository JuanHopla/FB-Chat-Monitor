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
        if (window.logManager) {
          window.logManager.phase('INITIALIZATION', 'ERROR', 'Dependencias requeridas no disponibles para AssistantHandler');
        } else {
          logger.error('Missing required dependencies for AssistantHandler');
        }
        return false;
      }

      // Initialize ThreadStore if not already done
      if (window.threadStore && typeof window.threadStore.initialize === 'function' &&
        !window.threadStore.initialized) {
        await window.threadStore.initialize();
      }

      this.initialized = true;
      if (window.logManager) {
        window.logManager.phase(window.logManager.phases.INITIALIZATION, 'AssistantHandler inicializado correctamente');
      } else {
        console.log('AssistantHandler initialized successfully');
      }
      return true;
    } catch (error) {
      if (window.logManager) {
        window.logManager.phase(window.logManager.phases.INITIALIZATION, 'ERROR', 
          `Fallo al inicializar AssistantHandler: ${error.message}`, error);
      } else {
        logger.error('Failed to initialize AssistantHandler', {}, error);
      }
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
  async generateResponse(fbThreadId, allMessages, chatRole, productData, options = {}) {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!fbThreadId || !allMessages || !Array.isArray(allMessages)) {
      throw new Error('Invalid parameters for generateResponse');
    }

    // Validate and set default chatRole if needed
    if (chatRole !== 'seller' && chatRole !== 'buyer') {
      if (window.logManager) {
        window.logManager.step(window.logManager.phases.GENERATION, 'WARNING',
          `Rol no válido: ${chatRole}, usando 'seller' como predeterminado`);
      } else {
        console.warn(`Invalid chat role: ${chatRole}, defaulting to 'seller'`);
      }
      chatRole = 'seller';
    }

    if (window.logManager) {
      window.logManager.phase(window.logManager.phases.GENERATION,
        `Generando respuesta para conversación ${fbThreadId} como ${chatRole}`);
    } else {
      console.log(`Generating response for thread ${fbThreadId} as ${chatRole}`);
      console.log(`[AssistantHandler] Step 4.1: Generating response for thread ${fbThreadId} as ${chatRole}`);
    }

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
        if (window.logManager) {
          window.logManager.step(window.logManager.phases.GENERATION, 'FLOW',
            'Flujo de hilo nuevo seleccionado');
        }
        return await this.handleNewThread(fbThreadId, allMessages, chatRole, productData);
      } else {
        if (window.logManager) {
          window.logManager.step(window.logManager.phases.GENERATION, 'FLOW',
            'Flujo de hilo existente seleccionado');
        }
        // MODIFICADO: Pasar las opciones a handleExistingThread
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo, options);
      }
    } catch (error) {
      if (window.logManager) {
        window.logManager.step(window.logManager.phases.GENERATION, 'ERROR',
          `Error al generar respuesta: ${error.message}`, error);
      } else {
        console.error(`[AssistantHandler] Error generating response: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Handles a new thread.
   * This now includes logic to handle manual follow-up requests if the last message
   * in the initial set was from the assistant.
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} productData - Product information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleNewThread(fbThreadId, allMessages, chatRole, productData) {
    if (window.logManager) {
      window.logManager.step('GENERATION', 'NEW_THREAD', 
        `Procesando nuevo hilo - fbThreadId: ${fbThreadId}, mensajes: ${allMessages.length}, rol: ${chatRole}`);
    } else {
      console.log(`[AssistantHandler][DEBUG] handleNewThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    }

    // --- LÓGICA DE SEGUIMIENTO PARA NUEVOS HILOS ---
    const lastMessage = allMessages.length > 0 ? allMessages[allMessages.length - 1] : null;
    let isFollowUpRequest = false;

    if (lastMessage && lastMessage.sentByUs) {
      if (window.logManager) {
        window.logManager.step('GENERATION', 'FOLLOW_UP', 'Detectada solicitud de seguimiento manual en hilo nuevo');
      } else {
        console.log('[AssistantHandler] Detectada solicitud de seguimiento manual en un hilo nuevo.');
      }
      
      if (!this._canPerformFollowUp(allMessages)) {
        if (window.logManager) {
          window.logManager.step('GENERATION', 'FOLLOW_UP', 'Límite de seguimiento alcanzado. No se creará hilo para evitar spam.');
        } else {
          console.warn('[AssistantHandler] Límite de seguimiento alcanzado para este nuevo hilo. No se creará el hilo para evitar spam.');
        }
        alert('Max follow-ups reached (3). The other user must respond to continue.');
        return ''; // Detener ejecución
      }
      
      if (window.logManager) {
        window.logManager.step('GENERATION', 'FOLLOW_UP', 'Verificación de seguimiento pasada. Añadiendo instrucción de seguimiento');
      } else {
        console.log('[AssistantHandler] Verificación de seguimiento pasada. Se añadirá instrucción de seguimiento.');
      }
      isFollowUpRequest = true;
    }
    // --- FIN DE LA LÓGICA DE SEGUIMIENTO ---

    console.log('No existing thread found, creating new one');
    console.log('[AssistantHandler] Processing new thread flow...');

    if (window.threadStore) {
      const threadInfoCheck = window.threadStore.getThreadInfo(fbThreadId, true);
      if (threadInfoCheck) {
        console.log(`[AssistantHandler][DEBUG] Thread encontrado en verificación final, usando existente en lugar de crear nuevo`);
        return await this.handleExistingThread(fbThreadId, allMessages, chatRole, threadInfoCheck);
      }
    }

    console.log(`[AssistantHandler][DEBUG] Creando nuevo thread en OpenAI para ${fbThreadId}`);
    const threadInfo = await this.createNewThread(fbThreadId, chatRole);

    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] ID de asistente obtenido: ${assistantId}`);

    console.log('[AssistantHandler] Step 4.2: Preparing messages for new thread...');

    // NUEVO: Esperar explícitamente por transcripciones pendientes
    if (window.audioTranscriber && window.audioTranscriber.pendingTranscriptions.size > 0) {
      const pendingCount = window.audioTranscriber.pendingTranscriptions.size;
      console.log(`[AssistantHandler][DEBUG] Esperando por ${pendingCount} transcripciones pendientes...`);

      // Esperar hasta 5 segundos para transcripciones pendientes
      const maxWaitTime = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime && window.audioTranscriber.pendingTranscriptions.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Esperar 500ms entre verificaciones

        // Verificar cuántas siguen pendientes
        const currentPending = window.audioTranscriber.pendingTranscriptions.size;
        if (currentPending < pendingCount) {
          console.log(`[AssistantHandler][DEBUG] Progreso: ${pendingCount - currentPending} transcripciones completadas, ${currentPending} pendientes`);
        }
      }

      // Si después de esperar todavía hay pendientes, ejecutar asociación FIFO
      if (window.audioTranscriber.pendingTranscriptions.size > 0) {
        console.log(`[AssistantHandler][DEBUG] Algunas transcripciones siguen pendientes. Aplicando asociación FIFO...`);
        await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(allMessages);
      } else {
        console.log(`[AssistantHandler][DEBUG] Todas las transcripciones completadas con éxito`);
      }
    }

    const messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(allMessages);

    // NUEVO: Añadir este log completo:
    console.log('==================== ARRAY COMPLETO DE MENSAJES CON TRANSCRIPCIONES ====================');
    console.log('[AssistantHandler] [DEBUG] After attachTranscriptions:', JSON.parse(JSON.stringify(messagesWithTranscriptions)));

    // NUEVO: Log adicional para visualizar específicamente los mensajes con audio y sus transcripciones
    const audioMessages = messagesWithTranscriptions.filter(msg => msg.content?.hasAudio);
    console.log(`[AssistantHandler] [DEBUG] ${audioMessages.length} mensajes con audio encontrados:`);
    audioMessages.forEach((msg, idx) => {
      console.log(`[${idx}] Mensaje ID: ${msg.id}`);
      console.log(`    - audioUrl: ${msg.content.audioUrl ? 'Disponible' : 'No disponible'}`);
      console.log(`    - transcripción: ${msg.content.transcribedAudio || 'No disponible'}`);
      if (msg.content.transcribedAudio) {
        console.log(`    - texto completo: "${msg.content.transcribedAudio}"`);
      }
    });
    console.log('===================================================================================');

    const openAIMessages = await window.messagePreprocessor.formatMessagesForOpenAI(
      messagesWithTranscriptions.slice(-50),
      productData
    );

    const validatedMessages = this.validateMessages(openAIMessages);
    if (!validatedMessages.length) {
      logger.warn('No valid messages to process for new thread');
      return '';
    }

    console.log(`[AssistantHandler][DEBUG] Agregando ${validatedMessages.length} mensajes al hilo ${threadInfo.openaiThreadId}`);
    for (const message of validatedMessages) {
      await window.apiClient.addMessage(threadInfo.openaiThreadId, message);
    }

    // Si es una solicitud de seguimiento, añadir la instrucción especial ahora
    if (isFollowUpRequest) {
      const followUpInstruction = {
        role: 'user',
        content: '[System Instruction] The user has not responded to your last message. Please generate a brief, friendly follow-up message to re-engage them.'
      };
      await window.apiClient.addMessage(threadInfo.openaiThreadId, followUpInstruction);
    }

    console.log(`[AssistantHandler][DEBUG] Creando run con assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(threadInfo.openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run creado: ${runId}`);

    console.log(`[AssistantHandler][DEBUG] Esperando completación del run ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(threadInfo.openaiThreadId, runId, this.maxWaitTime);
    console.log(`[AssistantHandler][DEBUG] Run completado con status: ${runResult.status}`);

    if (runResult.status === 'completed' && runResult.output) {
      if (allMessages.length > 0) {
        const lastMsg = allMessages[allMessages.length - 1];
        const messageId = lastMsg.id || window.messagePreprocessor.generateMessageId(lastMsg.content?.text, Date.now());
        window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      }
      return this.processResponse(runResult.output);
    } else {
      const errorMsg = `Run did not complete: ${runResult.status}. Error: ${runResult.error?.message || 'Unknown'}`;
      console.log(`[AssistantHandler][ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }
  /**
   * Handles an existing thread.
   * This function decides whether to respond to new user messages or to generate a manual follow-up.
   * It includes a "3-strike" rule to prevent excessive follow-ups on unresponsive chats.
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} allMessages - All messages in the chat
   * @param {string} chatRole - Role (seller or buyer)
   * @param {Object} threadInfo - Existing thread information
   * @returns {Promise<string>} Generated response
   * @private
   */
  async handleExistingThread(fbThreadId, allMessages, chatRole, threadInfo, options = {}) {
    console.log(`[AssistantHandler][DEBUG] handleExistingThread - fbThreadId: ${fbThreadId}, messages: ${allMessages.length}, role: ${chatRole}`);
    const { openaiThreadId, lastMessageId } = threadInfo;

    const assistantId = this.getAssistantIdForRole(chatRole);
    if (!assistantId) {
      throw new Error(`No assistant ID configured for role: ${chatRole}`);
    }
    console.log(`[AssistantHandler][DEBUG] ID de asistente obtenido: ${assistantId}`);

    const newMessages = window.messagePreprocessor.getNewMessagesSinceNoFormat(allMessages, lastMessageId);
    console.log(`[AssistantHandler][DEBUG] Encontrados ${newMessages.length} mensajes nuevos desde el preprocesador.`);

    const hasTrulyNewMessages = newMessages.length > 0 && newMessages[0].id !== lastMessageId;
    // NUEVO: fuerza la generación de una nueva respuesta (regeneración)
    const isRegenerationRequest = options.forceNewGeneration === true;

    let actionTaken = false;

    if (hasTrulyNewMessages || isRegenerationRequest) {
      // --- ACTION A: Responder a nuevos mensajes o regenerar respuesta ---
      if (isRegenerationRequest) {
        console.log('[AssistantHandler] El usuario solicitó generar una respuesta alternativa.');
      } else {
        console.log(`[AssistantHandler] Se encontraron ${newMessages.length} mensajes nuevos del usuario. Procesando para responder.`);
      }

      // (Reusar lógica de transcripciones y preprocesamiento)
      const msgsToProcess = isRegenerationRequest ? newMessages.slice(-1) : newMessages;
      // Esperar transcripciones si hay mensajes de audio
      const audioMessages = msgsToProcess.filter(m => m.content?.hasAudio);
      if (audioMessages.length && window.audioTranscriber) {
        const pendingCount = window.audioTranscriber.pendingTranscriptions.size;
        if (pendingCount > 0) {
          console.log(`[AssistantHandler][DEBUG] Esperando por ${pendingCount} transcripciones pendientes...`);
          const start = Date.now();
          const maxWait = 5000;
          while (Date.now() - start < maxWait && window.audioTranscriber.pendingTranscriptions.size > 0) {
            await new Promise(r => setTimeout(r, 500));
          }
          if (window.audioTranscriber.pendingTranscriptions.size > 0) {
            console.log('[AssistantHandler][DEBUG] Aplicando asociación FIFO para transcripciones pendientes');
            await window.audioTranscriber.associateTranscriptionsWithMessagesFIFO(msgsToProcess);
          }
        }
      }

      const messagesWithTranscriptions = await window.messagePreprocessor.attachTranscriptions(msgsToProcess);

      console.log('==================== ARRAY COMPLETO DE MENSAJES PROCESADOS ====================');
      console.log('[AssistantHandler] [DEBUG] After attachTranscriptions (existing):', JSON.stringify(messagesWithTranscriptions));
      console.log('===================================================================================');

      const openAIMessages = await window.messagePreprocessor.formatMessagesForOpenAI(messagesWithTranscriptions);
      const validatedMessages = this.validateMessages(openAIMessages);

      if (validatedMessages.length) {
        actionTaken = true;
        console.log(`[AssistantHandler][DEBUG] Agregando ${validatedMessages.length} mensajes al hilo ${openaiThreadId}`);
        for (const message of validatedMessages) {
          await window.apiClient.addMessage(openaiThreadId, message);
        }
      } else {
        console.warn('[AssistantHandler] Después de formatear no hay mensajes válidos. No se agregaron mensajes.');
      }
    } else {
      // --- ACTION B: Generar follow-up manual ---
      console.log('[AssistantHandler] No hay mensajes nuevos. El usuario ha solicitado un seguimiento manual.');
      if (this._canPerformFollowUp(allMessages)) {
        actionTaken = true;
        console.log('[AssistantHandler] Verificación pasada: Menos de 3 respuestas consecutivas del asistente. Generando seguimiento.');
        const followUpInstruction = {
          role: 'user',
          content: '[System Instruction] The user has not responded to your last message. Please generate a brief, friendly follow-up message to re-engage them.'
        };
        await window.apiClient.addMessage(openaiThreadId, followUpInstruction);
      } else {
        console.warn('[AssistantHandler] Límite de seguimiento alcanzado. No se generará una nueva respuesta.');
        alert('Max follow-ups reached (3). The other user must respond to continue.');
      }
    }

    if (!actionTaken) {
      console.log('[AssistantHandler] No se tomó ninguna acción. Finalizando el proceso.');
      return '';
    }

    // Crear y esperar el run de OpenAI
    console.log(`[AssistantHandler][DEBUG] Creando run con assistant ${assistantId}`);
    const { runId } = await window.apiClient.createRun(openaiThreadId, assistantId);
    console.log(`[AssistantHandler][DEBUG] Run creado: ${runId}`);

    console.log(`[AssistantHandler][DEBUG] Esperando completación del run ${runId}`);
    const runResult = await window.apiClient.waitForRunCompletion(openaiThreadId, runId, this.maxWaitTime);
    console.log(`[AssistantHandler][DEBUG] Run completado con status: ${runResult.status}`);

    if (runResult.status === 'completed' && runResult.output) {
      const lastMsg = allMessages[allMessages.length - 1];
      const messageId = lastMsg.id || window.messagePreprocessor.generateMessageId(lastMsg.content?.text, Date.now());
      window.threadStore.updateLastMessage(fbThreadId, messageId, Date.now());
      return this.processResponse(runResult.output);
    } else {
      const err = `Run did not complete: ${runResult.status}. Error: ${runResult.error?.message || 'Unknown'}`;
      console.error(`[AssistantHandler][ERROR] ${err}`);
      throw new Error(err);
    }
  }

  /**
   * Checks if a follow-up is allowed based on the "3-strike" rule.
   * A follow-up is not allowed if the last 3 messages were all sent by us (assistant).
   * @param {Array} allMessages - The entire message history of the chat.
   * @returns {boolean} True if a follow-up is allowed, false otherwise.
   * @private
   */
  _canPerformFollowUp(allMessages) {
    if (allMessages.length < 3) {
      return true;
    }
    const lastThreeMessages = allMessages.slice(-3);
    const allFromAssistant = lastThreeMessages.every(msg => msg.sentByUs === true);
    if (allFromAssistant) {
      console.log('[AssistantHandler] Verificación de seguimiento fallida: Las últimas 3 respuestas fueron del asistente.');
      return false;
    }
    return true;
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
