// ----- OPENAI INTEGRATION -----

/**
 * OpenAI Manager - Modern orchestrator using only core modules
 * Refactored to delegate to ApiClient, ThreadStore, MessagePreprocessor, and AssistantHandler
 */
class OpenAIManager {
  constructor() {
    this.apiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '') || '';
    this.model = "gpt-4o";
    this.isInitialized = false;
    this.assistants = {
      seller: storageUtils.get('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', ''),
      buyer: storageUtils.get('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', ''),
      default: storageUtils.get('FB_CHAT_MONITOR_DEFAULT_ASSISTANT_ID', '')
    };
    // References only to core modules
    this.apiClient = window.apiClient || null;
    this.threadStore = window.threadStore || null;
    this.messagePreprocessor = window.messagePreprocessor || null;
    this.assistantHandler = window.assistantHandler || null;
  }

  initialize(apiKey = null) {
    if (window.flowLogger) {
      window.flowLogger.phase('INIT', 'Inicializando OpenAIManager');
    }
    if (apiKey) {
      this.apiKey = apiKey;
      CONFIG.AI.apiKey = apiKey;
      storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
      if (CONFIG.audioTranscription) {
        CONFIG.audioTranscription.apiKey = apiKey;
      }
    }
    this.model = "gpt-4o";
    CONFIG.AI.model = "gpt-4o";
    // Initialize only the core components
    if (window.apiClient && typeof window.apiClient.setApiKey === 'function') {
      window.apiClient.setApiKey(this.apiKey);
      this.apiClient = window.apiClient;
    } else if (window.OpenAIApiClient) {
      this.apiClient = new window.OpenAIApiClient(this.apiKey);
      window.apiClient = this.apiClient;
    }
    if (window.threadStore) this.threadStore = window.threadStore;
    if (window.messagePreprocessor) this.messagePreprocessor = window.messagePreprocessor;
    if (window.assistantHandler) this.assistantHandler = window.assistantHandler;
    this.isInitialized = !!this.apiKey;
    if (window.CONFIG?.debug) {
      console.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);
    }
    if (window.flowLogger) {
      window.flowLogger.phase('INIT', this.isInitialized ? 'Inicializado' : 'Fallo de inicialización (sin API Key)', { isInitialized: this.isInitialized });
    }
    return this.isInitialized;
  }

  loadConfig(apiKey = null) {
    if (window.CONFIG?.debug) {
      console.log('loadConfig() called - redirecting to initialize()');
    }
    if (window.flowLogger) {
      window.flowLogger.step('INIT', 'LOAD_CONFIG_CALLED');
    }
    return this.initialize(apiKey);
  }

  async setApiKey(apiKey) {
    if (window.flowLogger) {
      window.flowLogger.step('INIT', 'SET_API_KEY_CALLED');
    }
    this.apiKey = apiKey;
    CONFIG.AI.apiKey = apiKey;
    storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
    if (window.apiClient && typeof window.apiClient.setApiKey === 'function') {
      window.apiClient.setApiKey(apiKey);
      this.apiClient = window.apiClient;
    } else if (window.OpenAIApiClient) {
      this.apiClient = new window.OpenAIApiClient(apiKey);
      window.apiClient = this.apiClient;
    }
    const valid = await this.validateApiKey();
    this.isInitialized = valid;
    if (window.flowLogger) {
      window.flowLogger.phase('INIT', valid ? 'API Key válida' : 'API Key inválida');
    }
    return valid;
  }

  isReady() {
    return !!this.apiKey && !!this.apiClient && !!this.threadStore && !!this.messagePreprocessor && !!this.assistantHandler;
  }

  async validateApiKey() {
    if (!this.apiKey) return false;
    if (window.flowLogger) {
      window.flowLogger.step('INIT', 'VALIDATE_API_KEY');
    }
    if (this.apiClient && typeof this.apiClient.validateApiKey === 'function') {
      const ok = await this.apiClient.validateApiKey();
      if (window.flowLogger) {
        window.flowLogger.step('INIT', 'VALIDATE_API_KEY_RESULT', { ok });
      }
      return ok;
    }
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        if (window.CONFIG?.debug) {
          console.log('API key validated successfully');
        }
        if (window.flowLogger) {
          window.flowLogger.step('INIT', 'VALIDATE_API_KEY_RESULT', { ok: true });
        }
        return true;
      } else {
        const error = await response.json();
        logger.error(`API key validation failed: ${error.error?.message || 'Unknown error'}`);
        if (window.flowLogger) {
          window.flowLogger.step('INIT', 'VALIDATE_API_KEY_RESULT', { ok: false, error: error.error?.message });
        }
        return false;
      }
    } catch (error) {
      logger.error(`API key validation error: ${error.message}`);
      if (window.flowLogger) {
        window.flowLogger.step('INIT', 'VALIDATE_API_KEY_ERROR', { error: error.message });
      }
      return false;
    }
  }

  // --- Public API delegating to core modules ---

  /**
   * Orchestrates response generation using AssistantHandler
   * @param {Object} context {chatId, messages, role, productDetails, forceNewGeneration}
   * @returns {Promise<string>}
   */
  async generateResponse(context) {
    if (!this.isReady()) throw new Error('OpenAI API not ready');
    if (window.ensureAssistantsLoaded) {
      window.ensureAssistantsLoaded();
    }
    if (window.flowLogger) {
      window.flowLogger.phase('GENERATION', 'Inicio de generación', { chatId: context?.chatId, role: context?.role });
    }

    // Verify context structure
    if (!context || typeof context !== 'object') {
      throw new Error('Invalid context object provided');
    }

    // NEW: Verify if it is a regeneration request
    const isRegenerationRequest = context.forceNewGeneration === true;

    // Extract messages, supporting both the old (array) and new (object) formats
    let messagesArray;
    if (Array.isArray(context.messages)) {
      messagesArray = context.messages;
      if (window.CONFIG?.debug) console.debug('[OpenAIManager] Detected old message format (direct array)');
    } else if (context.messages && Array.isArray(context.messages.messages)) {
      messagesArray = context.messages.messages;
      if (window.CONFIG?.debug) console.debug('[OpenAIManager] Detected new message format (object with messages and timeBlocks)');
    } else {
      console.error('[OpenAIManager] Invalid message format:', context.messages);
      throw new Error('Invalid message format in context');
    }

    // NEW: First, apply transcriptions to the messages
    if (window.messagePreprocessor && typeof window.messagePreprocessor.attachTranscriptions === 'function') {
      if (window.CONFIG?.debug) console.debug('[OpenAIManager] Applying transcriptions to context messages...');
      messagesArray = await window.messagePreprocessor.attachTranscriptions(messagesArray);
      if (window.flowLogger) {
        window.flowLogger.step('GENERATION', 'TRANSCRIPTIONS_ATTACHED');
      }
    }

    // Original logs
    if (window.CONFIG?.debug) {
      console.debug('[OpenAIManager] Step 3.1: Received context for response generation:', {
        ...context,
        messages: messagesArray
      });
      console.debug('[OpenAIManager] Step 3.2: Calling assistantHandler.generateResponse...');
    }
    if (window.flowLogger) {
      window.flowLogger.step('GENERATION', 'PAYLOAD_BUILT', { hasProduct: !!context.productDetails, messages: messagesArray?.length || 0, forceNew: !!isRegenerationRequest });
    }

    // Update the context with the processed array and the regeneration flag
    const contextToSend = {
      ...context,
      messages: messagesArray,
      options: {
        forceNewGeneration: isRegenerationRequest
      }
    };

    const result = await this.assistantHandler.generateResponse(
      contextToSend.chatId,
      messagesArray,
      contextToSend.role,
      contextToSend.productDetails,
      contextToSend.options
    );
    if (window.flowLogger) window.flowLogger.step('GENERATION', 'REPLY_RECEIVED', { preview: typeof result === 'string' ? result.substring(0, 80) : '' });
    if (window.CONFIG?.debug) console.debug('[OpenAIManager] Step 3.3: assistantHandler.generateResponse completed. Response:', result);
    return result;
  }

  /**
   * Prepares messages for OpenAI using MessagePreprocessor
   * @param {Object} context
   * @returns {Array}
   */
  prepareMessageContent(context) {
    if (!this.messagePreprocessor) throw new Error('MessagePreprocessor not initialized');
    // Log the payload that will be sent to the assistant
    const payload = this.messagePreprocessor.formatMessagesForOpenAI(context.messages);
    if (window.CONFIG?.debug) {
      console.log('[OpenAIManager] Payload prepared to send to assistant:', payload);
    }
    return payload;
  }

  /**
   * Generates a response using the Assistants API
   * @param {string} fbThreadId - Facebook thread ID
   * @param {Array} messages - Messages in the chat
   * @param {Object} options - Options for response generation
   * @returns {Promise<string>} Generated response
   */
  async generateAssistantResponse(fbThreadId, messages, options = {}) {
    const {
      role = 'seller',
      productData = null,
      forceNewThread = false
    } = options;

    if (window.CONFIG?.debug) {
      console.log(`[OpenAIManager][DEBUG] generateAssistantResponse - threadId: ${fbThreadId}, role: ${role}, hasMessages: ${!!messages}, hasProduct: ${!!productData}`);
    }
    if (window.flowLogger) {
      window.flowLogger.phase('GENERATION', 'Inicio generateAssistantResponse', { fbThreadId, role, hasProduct: !!productData });
    }

    try {
      // Extract messages, supporting both the old (array) and new (object) formats
      let messagesArray;

      if (Array.isArray(messages)) {
        // Old format: messages is directly an array
        messagesArray = messages;
      } else if (messages && Array.isArray(messages.messages)) {
        // New format: messages is an object {messages: [...], timeBlocks: [...]}
        messagesArray = messages.messages;
      } else {
        console.error('[OpenAIManager][ERROR] Invalid message format:', messages);
        throw new Error('Invalid message format');
      }
      // 1. Ensure required components are initialized
      if (window.CONFIG?.debug) {
        console.log(`[OpenAIManager][DEBUG] Verifying component initialization`);
      }
      if (!window.assistantHandler || !window.assistantHandler.initialized) {
        if (window.CONFIG?.debug) {
          console.log(`[OpenAIManager][DEBUG] AssistantHandler needs initialization`);
        }
        if (window.assistantHandler && typeof window.assistantHandler.initialize === 'function') {
          if (window.flowLogger) {
            window.flowLogger.step('GENERATION', 'ASSISTANT_HANDLER_INIT');
          }
          await window.assistantHandler.initialize();
        } else {
          console.error(`[OpenAIManager][ERROR] AssistantHandler not available`);
          if (window.flowLogger) {
            window.flowLogger.phase('GENERATION', 'ASSISTANT_HANDLER_MISSING');
          }
          throw new Error('AssistantHandler not available');
        }
      }

      // Initialize AudioTranscriber to enable parallel transcription
      if (window.audioTranscriber && typeof window.audioTranscriber.initialize === 'function'
        && !window.audioTranscriber.initialized) {
        if (window.CONFIG?.debug) {
          console.log(`[OpenAIManager][DEBUG] Initializing AudioTranscriber`);
        }
        if (window.flowLogger) {
          window.flowLogger.step('GENERATION', 'AUDIO_TRANSCRIBER_INIT');
        }
        await window.audioTranscriber.initialize();
      }

      // 2. If forceNewThread, delete any existing thread
      if (forceNewThread && window.threadStore && window.threadStore.hasThread(fbThreadId)) {
        if (window.CONFIG?.debug) {
          console.log(`[OpenAIManager][DEBUG] Forcing new thread for ${fbThreadId}`);
        }
        logger.debug(`Forcing new thread for ${fbThreadId}`);
        // Get the existing thread info before deletion
        const existingThread = window.threadStore.getThreadInfo(fbThreadId);

        // Delete from thread store
        window.threadStore.threads.delete(fbThreadId);
        window.threadStore.saveThreads();
        if (window.CONFIG?.debug) {
          console.log(`[OpenAIManager][DEBUG] Old thread deleted from ThreadStore`);
        }
        if (window.flowLogger) {
          window.flowLogger.step('GENERATION', 'FORCE_NEW_THREAD', { fbThreadId });
        }
      }

      // 3. Generate response using AssistantHandler
      if (window.CONFIG?.debug) {
        console.log(`[OpenAIManager][DEBUG] Calling assistantHandler.generateResponse`);
      }
      const response = await window.assistantHandler.generateResponse(
        fbThreadId,
        messages,
        role,
        productData
      );

      if (window.CONFIG?.debug) {
        console.log(`[OpenAIManager][DEBUG] Response generated: "${response.substring(0, 50)}${response.length > 50 ? '...' : ''}"`);
      }
      if (window.flowLogger) {
        window.flowLogger.phase('GENERATION', 'Respuesta generada (legacy path)', { preview: typeof response === 'string' ? response.substring(0, 80) : '' });
      }
      return response;
    } catch (error) {
      console.error(`[OpenAIManager][ERROR] Error generating response: ${error.message}`, error);
      logger.error(`Error generating assistant response: ${error.message}`, {}, error);
      if (window.flowLogger) {
        window.flowLogger.phase('GENERATION', 'ERROR', { error: error.message });
      }
      throw error;
    }
  }

  // --- Thread management methods delegate to ThreadStore ---

  getThreadInfo(fbThreadId) {
    if (!this.threadStore) throw new Error('ThreadStore not initialized');
    return this.threadStore.getThreadInfo(fbThreadId);
  }
  saveThreadInfo(fbThreadId, metadata) {
    if (!this.threadStore) throw new Error('ThreadStore not initialized');
    return this.threadStore.saveThreadInfo(fbThreadId, metadata);
  }
  updateLastMessage(fbThreadId, newMessageId, newTimestamp) {
    if (!this.threadStore) throw new Error('ThreadStore not initialized');
    return this.threadStore.updateLastMessage(fbThreadId, newMessageId, newTimestamp);
  }

  // --- Assistant methods delegate to ApiClient ---

  async listAssistants() {
    if (!this.apiClient) throw new Error('ApiClient not initialized');
    const result = await this.apiClient.listAssistants();
    return result.data || [];
  }

  async createOrUpdateAssistant(role, name, instructions) {
    if (!this.apiClient) throw new Error('ApiClient not initialized');
    let assistantId = this.assistants[role];
    const modelToUse = this.model || "gpt-4o";
    const assistantBody = { name, instructions, model: modelToUse };
    let data;
    if (assistantId) {
      data = await this.apiClient.createOrUpdateAssistant(assistantId, assistantBody);
    } else {
      data = await this.apiClient.createOrUpdateAssistant(null, assistantBody);
    }
    assistantId = data.id;
    this.assistants[role] = assistantId;
    storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);
    return assistantId;
  }

  getAssistantIdForRole(role) {
    let assistantId = this.assistants[role];
    if (!assistantId && CONFIG.AI?.assistants?.[role]?.id) {
      assistantId = CONFIG.AI.assistants[role].id;
    }
    return assistantId;
  }

  setAssistantForRole(role, assistantId) {
    if (!['seller', 'buyer'].includes(role)) return false;
    if (!this.config) this.config = {};
    if (!this.config.assistants) this.config.assistants = {};
    this.config.assistants[role] = this.config.assistants[role] || {};
    this.config.assistants[role].id = assistantId;
    // Also update in global CONFIG if necessary
    if (window.CONFIG && window.CONFIG.AI && window.CONFIG.AI.assistants) {
      window.CONFIG.AI.assistants[role].id = assistantId;
    }
    // Optional: save in storage
    if (window.storageUtils) {
      const assistants = window.CONFIG?.AI?.assistants || this.config.assistants;
      window.storageUtils.set('FB_CHAT_ASSISTANTS', assistants);
    }
    return true;
  }
}

// Expose
const openAIManager = new OpenAIManager();
window.openaiManager = openAIManager;
if (window.CONFIG?.debug) console.debug('[OpenAI Manager] Instance exposed globally as window.openaiManager');

// Minimal global verification
(function ensureGlobalOpenAIManager() {
  if (!window.openaiManager || !window.openaiManager.isReady) {
    window.openaiManager = openAIManager;
  }
  if (CONFIG?.AI?.apiKey && !window.openaiManager.apiKey) {
    window.openaiManager.apiKey = CONFIG.AI.apiKey;
    window.openaiManager.isInitialized = true;
  }
  if (window.CONFIG?.debug) console.debug('[OpenAI Manager] Status after global verification:',
    `apiKey=${!!window.openaiManager.apiKey}`,
    `isInitialized=${window.openaiManager.isInitialized}`,
    `isReady=${typeof window.openaiManager.isReady === 'function' ? window.openaiManager.isReady() : 'method not available'}`);
  if (window.flowLogger) {
    try {
      window.flowLogger.step('INIT', 'GLOBAL_VERIFY', {
        apiKey: !!window.openaiManager.apiKey,
        isInitialized: window.openaiManager.isInitialized,
        isReady: typeof window.openaiManager.isReady === 'function' ? window.openaiManager.isReady() : false
      });
    } catch (_) {}
  }
})();