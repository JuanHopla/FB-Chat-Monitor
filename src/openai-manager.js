// ----- OPENAI INTEGRATION -----

/**
 * OpenAI Manager - Handles OpenAI API integration with assistant selection based on role
 */
class OpenAIManager {
  constructor() {
    // de:
//    this.apiKey = localStorage.getItem('FB_CHAT_MONITOR_OPENAI_KEY') || '';
//    this.model  = localStorage.getItem('FB_CHAT_MONITOR_AI_MODEL') || 'gpt-3.5-turbo';
    // a:
    this.apiKey = CONFIG.AI.apiKey || '';
    this.model  = CONFIG.AI.model  || 'gpt-3.5-turbo';
    this.isInitialized = false;
    this.activeThreads = new Map(); // Store active threads by chatId
    this.threadTTL = 30 * 60 * 1000; // 30 minutes
    
    // Assistant IDs by role
    this.assistants = {
      seller: localStorage.getItem('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID') || '',
      buyer: localStorage.getItem('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID') || '',
      default: localStorage.getItem('FB_CHAT_MONITOR_DEFAULT_ASSISTANT_ID') || ''
    };
    
    // Performance metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokensUsed: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };
  }
  
  /**
   * Initialize the OpenAI Manager with API key and model
   * @param {string} apiKey - OpenAI API key
   * @param {string} model - Model to use (e.g. gpt-4, gpt-3.5-turbo)
   */
  initialize(apiKey = null, model = null) {
    // Update if new values provided
    if (apiKey) {
      this.apiKey = apiKey;
      CONFIG.AI.apiKey = apiKey;                          // mantener en CONFIG
      localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
    }
    
    if (model) {
      this.model = model;
      CONFIG.AI.model = model;                            // mantener en CONFIG
      localStorage.setItem('FB_CHAT_MONITOR_AI_MODEL', model);
    }
    
    this.isInitialized = !!this.apiKey;
    logger.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);
    
    // Schedule thread cleanup
    setInterval(() => this.cleanupOldThreads(), 15 * 60 * 1000); // Every 15 minutes
    
    return this.isInitialized;
  }

  /**
   * Set a new API key, persist it and validate it
   * @param {string} apiKey
   * @returns {Promise<boolean>} true if the key is valid
   */
  async setApiKey(apiKey) {
    // update in-memory and localStorage
    this.apiKey = apiKey;
    CONFIG.AI.apiKey = apiKey;
    localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);

    // run real validation against OpenAI
    const valid = await this.validateApiKey();
    this.isInitialized = valid;
    return valid;
  }

  /**
   * Validate the API key with OpenAI
   * @returns {Promise<boolean>} True if the key is valid
   */
  async validateApiKey() {
    if (!this.apiKey) {
      return false;
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
        logger.log('API key validated successfully');
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
  
  /**
   * Generate a response using OpenAI Assistants API
   * @param {Object} context - Context data including role, messages, and product details
   * @returns {Promise<string>} Generated response text
   */
  async generateResponse(context) {
    if (!this.isInitialized) {
      throw new Error('OpenAI Manager not initialized with valid API key');
    }
    
    const startTime = Date.now();
    this.metrics.totalCalls++;
    
    try {
      // Determine which assistant to use based on role
      const assistantId = this.getAssistantIdForRole(context.role);
      if (!assistantId) {
        throw new Error(`No assistant configured for role: ${context.role}`);
      }
      
      logger.debug(`Using assistant ${assistantId} for role ${context.role}`);
      
      // Get or create a thread for this chat
      const thread = await this.getOrCreateThread(context.chatId);
      
      // Add message to the thread with context
      await this.addMessageToThread(thread.id, context);
      
      // Run the assistant on the thread
      const response = await this.runAssistant(thread.id, assistantId);
      
      // Update metrics
      this.metrics.successfulCalls++;
      const responseTime = Date.now() - startTime;
      this.metrics.totalResponseTime += responseTime;
      this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.successfulCalls;
      
      logger.debug(`Response generated in ${responseTime}ms`);
      
      return response;
    } catch (error) {
      this.metrics.failedCalls++;
      logger.error(`Error generating response: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the appropriate assistant ID for the given role
   * @param {string} role - 'seller' or 'buyer'
   * @returns {string} Assistant ID
   */
  getAssistantIdForRole(role) {
    // First try to get the role-specific assistant
    let assistantId = this.assistants[role];
    
    // If not found, fall back to default assistant
    if (!assistantId) {
      assistantId = this.assistants.default;
      logger.debug(`No assistant for role ${role}, using default assistant`);
    }
    
    // If still not found, use the configuration
    if (!assistantId) {
      if (role === 'seller' && CONFIG.AI?.assistants?.seller?.id) {
        assistantId = CONFIG.AI.assistants.seller.id;
      } else if (role === 'buyer' && CONFIG.AI?.assistants?.buyer?.id) {
        assistantId = CONFIG.AI.assistants.buyer.id;
      }
    }
    
    return assistantId;
  }
  
  /**
   * Get an existing thread or create a new one for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} Thread data
   */
  async getOrCreateThread(chatId) {
    // Check if we already have a thread for this chat
    const existingThread = this.activeThreads.get(chatId);
    if (existingThread && (Date.now() - existingThread.lastUsed < this.threadTTL)) {
      // Update last used timestamp
      existingThread.lastUsed = Date.now();
      this.activeThreads.set(chatId, existingThread);
      return existingThread;
    }
    
    // Create a new thread
    try {
      const response = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create thread');
      }
      
      const thread = await response.json();
      this.activeThreads.set(chatId, {
        id: thread.id,
        lastUsed: Date.now()
      });
      
      logger.debug(`Created new thread ${thread.id} for chat ${chatId}`);
      return thread;
    } catch (error) {
      logger.error(`Error creating thread: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a message with context to a thread
   * @param {string} threadId - Thread ID
   * @param {Object} context - Context including messages and product details
   */
  async addMessageToThread(threadId, context) {
    try {
      // Prepare the message content
      const messageContent = this.prepareMessageContent(context);
      
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({
          role: 'user',
          content: messageContent
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to add message to thread');
      }
      
      logger.debug(`Added message to thread ${threadId}`);
      return await response.json();
    } catch (error) {
      logger.error(`Error adding message to thread: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Prepare the message content with context for the AI
   * @param {Object} context - Context data
   * @returns {Array} Message content array for OpenAI API
   */
  prepareMessageContent(context) {
    const { role, messages, productDetails, analysis } = context;
    
    // Start with a text part containing the JSON context
    const content = [{
      type: 'text',
      text: JSON.stringify({
        role: role,
        product: productDetails ? {
          id: productDetails.id,
          title: productDetails.title,
          price: productDetails.price,
          description: productDetails.description,
          condition: productDetails.condition,
          location: productDetails.location,
          category: productDetails.category
        } : null,
        // Take last 10 messages for context
        conversation: messages.slice(-10).map(msg => ({
          text: typeof msg.content === 'string' ? msg.content : msg.content.text,
          fromUser: !msg.sentByUs,
          hasImages: msg.content.images && msg.content.images.length > 0,
          hasAudio: msg.content.audio && msg.content.audio.length > 0,
          timestamp: msg.timestamp
        })),
        analysis: analysis || null
      })
    }];
    
    // Add images if available (maximum 4)
    if (productDetails && productDetails.imageUrls) {
      for (let i = 0; i < Math.min(4, productDetails.imageUrls.length); i++) {
        content.push({
          type: 'image_url',
          image_url: { url: productDetails.imageUrls[i] }
        });
      }
    }
    
    // Also add any images from the last message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.content.images && lastMessage.content.images.length > 0) {
      const remainingImgSlots = 4 - (productDetails?.imageUrls?.length || 0);
      
      for (let i = 0; i < Math.min(remainingImgSlots, lastMessage.content.images.length); i++) {
        content.push({
          type: 'image_url',
          image_url: { url: lastMessage.content.images[i] }
        });
      }
    }
    
    return content;
  }
  
  /**
   * Run an assistant on a thread and get the response
   * @param {string} threadId - Thread ID
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<string>} Response text
   */
  async runAssistant(threadId, assistantId) {
    try {
      // Start a run
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({
          assistant_id: assistantId
        })
      });
      
      if (!runResponse.ok) {
        const error = await runResponse.json();
        throw new Error(error.error?.message || 'Failed to start run');
      }
      
      const run = await runResponse.json();
      logger.debug(`Started run ${run.id} on thread ${threadId}`);
      
      // Poll for completion with exponential backoff
      const result = await this.pollRunUntilComplete(threadId, run.id);
      
      // Get the assistant's message
      const response = await this.getAssistantResponseFromRun(threadId, run.id);
      return response;
    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Poll a run until it's completed or failed
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @returns {Promise<Object>} Final run status
   */
  async pollRunUntilComplete(threadId, runId) {
    const maxAttempts = 60; // Maximum attempts to avoid infinite polling
    const timeout = 30000; // 30 second timeout
    let attempts = 0;
    let status = null;
    let delay = 1000; // Start with 1s delay
    
    const startTime = Date.now();
    
    while (attempts < maxAttempts && (Date.now() - startTime < timeout)) {
      attempts++;
      
      // Check the run status
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to check run status');
      }
      
      status = await response.json();
      
      // If completed or failed, break the loop
      if (['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
        break;
      }
      
      // If still running, wait with exponential backoff
      logger.debug(`Run ${runId} status: ${status.status}, attempt ${attempts}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 5000); // Increase delay up to 5s max
    }
    
    if (status.status !== 'completed') {
      throw new Error(`Run failed with status: ${status.status}`);
    }
    
    return status;
  }
  
  /**
   * Get the assistant's response from a completed run
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID 
   * @returns {Promise<string>} Response text
   */
  async getAssistantResponseFromRun(threadId, runId) {
    try {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to retrieve messages');
      }
      
      const messages = await response.json();
      
      // Find the first assistant message (should be the newest one)
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
      
      if (!assistantMessage) {
        throw new Error('No assistant message found');
      }
      
      // Extract the text content
      if (assistantMessage.content && assistantMessage.content.length > 0) {
        const textContent = assistantMessage.content.find(content => content.type === 'text');
        if (textContent) {
          return textContent.text.value;
        }
      }
      
      throw new Error('No text content found in assistant message');
    } catch (error) {
      logger.error(`Error retrieving assistant response: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set the assistant ID for a specific role
   * @param {string} role - Role ('seller' or 'buyer')
   * @param {string} assistantId - Assistant ID 
   */
  setAssistantForRole(role, assistantId) {
    if (!['seller', 'buyer', 'default'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    
    this.assistants[role] = assistantId;
    localStorage.setItem(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);
    logger.log(`Set assistant ${assistantId} for role ${role}`);
  }
  
  /**
   * Create or update a wizard with name and instructions.
   * @param {'seller'|'buyer'} role
   * @param {string} name
   * @param {string} instructions
   * @returns {Promise<string>} assistantId
   */
  async createOrUpdateAssistant(role, name, instructions) {
    if (!this.isInitialized) throw new Error('API key no inicializada');
    let assistantId = this.assistants[role];
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };
    // Upgrade existing
    if (assistantId) {
      const res = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, instructions })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to update assistant');
      }
    } else {
      // Create new
      const res = await fetch('https://api.openai.com/v1/assistants', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, instructions })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create assistant');
      }
      const data = await res.json();
      assistantId = data.id;
    }
    this.assistants[role] = assistantId;
    return assistantId;
  }
  
  /**
   * Get all available assistants from OpenAI
   * @returns {Promise<Array>} List of assistants
   */
  async listAssistants() {
    try {
      const response = await fetch('https://api.openai.com/v1/assistants?limit=100', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to list assistants');
      }
      
      const assistants = await response.json();
      return assistants.data;
    } catch (error) {
      logger.error(`Error listing assistants: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clean up old threads to prevent memory leaks
   */
  cleanupOldThreads() {
    const now = Date.now();
    let count = 0;
    
    for (const [chatId, threadData] of this.activeThreads.entries()) {
      if (now - threadData.lastUsed > this.threadTTL) {
        this.activeThreads.delete(chatId);
        count++;
      }
    }
    
    if (count > 0) {
      logger.debug(`Cleaned up ${count} expired threads`);
    }
  }
  
  /**
   * Get metrics about API usage
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeThreads: this.activeThreads.size
    };
  }
}

// expose
const openAIManager = new OpenAIManager();
window.openAIManager = openAIManager;
