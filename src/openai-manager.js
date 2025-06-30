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
    console.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);
    return this.isInitialized;
  }

  loadConfig(apiKey = null) {
    console.log('loadConfig() called - redirecting to initialize()');
    return this.initialize(apiKey);
  }

  async setApiKey(apiKey) {
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
    return valid;
  }

  isReady() {
    return !!this.apiKey && !!this.apiClient && !!this.threadStore && !!this.messagePreprocessor && !!this.assistantHandler;
  }

  async validateApiKey() {
    if (!this.apiKey) return false;
    if (this.apiClient && typeof this.apiClient.validateApiKey === 'function') {
      return await this.apiClient.validateApiKey();
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
        console.log('API key validated successfully');
        return true;
      } else {
        const error = await response.json();
        logger.error(`API key validation failed: ${error.error?.message || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      logger.error(`API key validation error: ${error.message}`);
      return false;
    }
  }

  // --- Public API delegating to core modules ---

  /**
   * Orchestrates response generation using AssistantHandler
   * @param {Object} context {chatId, messages, role, productDetails}
   * @returns {Promise<string>}
   */
  async generateResponse(context) {
    if (!this.isReady()) throw new Error('OpenAI API not ready');
    console.log('[OpenAIManager] Step 3.1: Received context for response generation:', context);
    // Log before delegating to AssistantHandler
    console.log('[OpenAIManager] Step 3.2: Calling assistantHandler.generateResponse...');
    const result = await this.assistantHandler.generateResponse(
      context.chatId,
      context.messages,
      context.role,
      context.productDetails
    );
    console.log('[OpenAIManager] Step 3.3: assistantHandler.generateResponse completed. Response:', result);
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
    console.log('[OpenAIManager] Payload prepared to send to assistant:', payload);
    return payload;
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
    // También actualizar en CONFIG global si es necesario
    if (window.CONFIG && window.CONFIG.AI && window.CONFIG.AI.assistants) {
      window.CONFIG.AI.assistants[role].id = assistantId;
    }
    // Opcional: guardar en storage
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
console.log('[OpenAI Manager] Instance exposed globally as window.openaiManager');

// Minimal global verification
(function ensureGlobalOpenAIManager() {
  if (!window.openaiManager || !window.openaiManager.isReady) {
    window.openaiManager = openAIManager;
  }
  if (CONFIG?.AI?.apiKey && !window.openaiManager.apiKey) {
    window.openaiManager.apiKey = CONFIG.AI.apiKey;
    window.openaiManager.isInitialized = true;
  }
  console.log('[OpenAI Manager] Status after global verification:',
    `apiKey=${!!window.openaiManager.apiKey}`,
    `isInitialized=${window.openaiManager.isInitialized}`,
    `isReady=${typeof window.openaiManager.isReady === 'function' ? window.openaiManager.isReady() : 'method not available'}`);
})();