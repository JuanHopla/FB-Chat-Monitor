// ----- OPENAI INTEGRATION -----

/**
 * OpenAI Manager - Handles OpenAI API integration with assistant selection based on role
 */
class OpenAIManager {
  constructor() {
    // Use storageUtils as the primary data source
    this.apiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '') || '';
    this.model = "gpt-4o"; // Fixed to gpt-4o
    this.isInitialized = false;
    this.activeThreads = new Map(); // Store active threads by chatId
    this.threadTTL = 30 * 60 * 1000; // 30 minutes

    // Assistant IDs by role
    this.assistants = {
      seller: storageUtils.get('FB_CHAT_MONITOR_SELLER_ASSISTANT_ID', ''),
      buyer: storageUtils.get('FB_CHAT_MONITOR_BUYER_ASSISTANT_ID', ''),
      default: storageUtils.get('FB_CHAT_MONITOR_DEFAULT_ASSISTANT_ID', '')
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
   * This is a critical method that must work properly
   * @param {string} apiKey - OpenAI API key
   */
  initialize(apiKey = null) {
    try {
      // Update if new API key provided
      if (apiKey) {
        this.apiKey = apiKey;
        CONFIG.AI.apiKey = apiKey;
        storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);

        // Also update the API key for audio transcription
        if (CONFIG.audioTranscription) {
          CONFIG.audioTranscription.apiKey = apiKey;
        }
      }

      // The model is always fixed
      this.model = "gpt-4o";
      CONFIG.AI.model = "gpt-4o";

      // NEW: Create and initialize the OpenAI client if we have an API key
      if (this.apiKey) {
        // Initialize the client to communicate with the OpenAI API
        this.client = {
          beta: {
            threads: {
              create: async () => {
                const response = await fetch('https://api.openai.com/v1/threads', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                  },
                  body: JSON.stringify({})
                });
                
                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(`Error creating thread: ${errorData.error?.message || response.statusText}`);
                }
                
                return response.json();
              },
              messages: {
                create: async (threadId, messageData) => {
                  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${this.apiKey}`,
                      'Content-Type': 'application/json',
                      'OpenAI-Beta': 'assistants=v2'
                    },
                    body: JSON.stringify(messageData)
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error creating message: ${errorData.error?.message || response.statusText}`);
                  }
                  
                  return response.json();
                },
                list: async (threadId, options = {}) => {
                  const queryParams = new URLSearchParams(options).toString();
                  const url = `https://api.openai.com/v1/threads/${threadId}/messages${queryParams ? `?${queryParams}` : ''}`;
                  
                  const response = await fetch(url, {
                    headers: {
                      'Authorization': `Bearer ${this.apiKey}`,
                      'Content-Type': 'application/json',
                      'OpenAI-Beta': 'assistants=v2'
                    }
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error listing messages: ${errorData.error?.message || response.statusText}`);
                  }
                  
                  return response.json();
                }
              },
              runs: {
                create: async (threadId, runData) => {
                  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${this.apiKey}`,
                      'Content-Type': 'application/json',
                      'OpenAI-Beta': 'assistants=v2'
                    },
                    body: JSON.stringify(runData)
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error creating run: ${errorData.error?.message || response.statusText}`);
                  }
                  
                  return response.json();
                },
                retrieve: async (threadId, runId) => {
                  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                    headers: {
                      'Authorization': `Bearer ${this.apiKey}`,
                      'Content-Type': 'application/json',
                      'OpenAI-Beta': 'assistants=v2'
                    }
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error retrieving run: ${errorData.error?.message || response.statusText}`);
                  }
                  
                  return response.json();
                }
              }
            },
            assistants: {
              retrieve: async (assistantId) => {
                const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
                  headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                  }
                });
                
                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(`Error retrieving assistant: ${errorData.error?.message || response.statusText}`);
                }
                
                return response.json();
              },
              list: async (options = {}) => {
                const queryParams = new URLSearchParams(options).toString();
                const url = `https://api.openai.com/v1/assistants${queryParams ? `?${queryParams}` : ''}`;
                
                const response = await fetch(url, {
                  headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                  }
                });
                
                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(`Error listing assistants: ${errorData.error?.message || response.statusText}`);
                }
                
                return response.json();
              }
            }
          }
        };

        logger.debug('OpenAI client created successfully');
        this.isInitialized = true;
      } else {
        this.isInitialized = false;
        logger.debug('initialize(): No API key, setting isInitialized=false');
      }
      
      logger.log(`OpenAI Manager initialized: ${this.isInitialized ? 'SUCCESS' : 'FAILED - No API Key'}`);

      // Schedule thread cleanup
      setInterval(() => this.cleanupOldThreads(), 15 * 60 * 1000); // Every 15 minutes

      // Schedule periodic service verification
      this.schedulePeriodicChecks();

      return this.isInitialized;
    } catch (error) {
      logger.error(`Error initializing OpenAI Manager: ${error.message}`);
      return false;
    }
  }

  /**
   * Alias for initialize() to maintain compatibility with existing code
   * @param {string} apiKey - Optional API key to use
   * @returns {boolean} - Whether the initialization was successful
   */
  loadConfig(apiKey = null) {
    logger.debug('loadConfig() called - redirecting to initialize()');
    return this.initialize(apiKey);
  }

  /**
   * Set a new API key, persist it and validate it
   * @param {string} apiKey
   * @returns {Promise<boolean>} true if the key is valid
   */
  async setApiKey(apiKey) {
    // update in-memory and storage
    this.apiKey = apiKey;
    CONFIG.AI.apiKey = apiKey;

    // Save in storageUtils for greater persistence
    storageUtils.set('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);

    // run real validation against OpenAI
    const valid = await this.validateApiKey();
    this.isInitialized = valid;
    return valid;
  }

  /**
   * Verifies the status of the OpenAI service and corrects problems if possible
   * @returns {boolean} If the service is available and operational
   */
  verifyServiceState() {
    logger.log('Verifying OpenAI service status...');
    
    // Additional verification: ensure that "this" is the correct instance
    if (this !== window.openaiManager) {
      logger.warn('Incorrect openaiManager instance, correcting reference...');
      // This could happen if there are multiple instances or lost context
      Object.assign(this, window.openaiManager);
    }
    
    // Verify if it is initialized, and if not, try to initialize it
    if (!this.isInitialized || !this.apiKey) {
      logger.debug('OpenAI Manager is not initialized, attempting to recover state');
      
      // Try with API key from CONFIG
      if (CONFIG?.AI?.apiKey) {
        logger.debug('Using API key from CONFIG to initialize OpenAI Manager');
        this.apiKey = CONFIG.AI.apiKey;
        this.isInitialized = true; // Force initialization if we have a key
      } 
      // Try with localStorage as a backup
      else {
        const storedApiKey = storageUtils.get('FB_CHAT_MONITOR_OPENAI_KEY', '');
        if (storedApiKey) {
          logger.debug('Using API key from localStorage to initialize OpenAI Manager');
          this.apiKey = storedApiKey;
          this.isInitialized = true; // Force initialization if we have a key
        }
      }
    }
    
    // Highest priority: having an API key should mean we are ready
    const isReady = !!this.apiKey;
    
    // Ensure that isInitialized matches our definition of "ready"
    if (isReady && !this.isInitialized) {
      this.isInitialized = true;
      logger.debug('Correcting isInitialized to TRUE because we have apiKey');
    }
    
    // Verify final status
    logger.log(`Final status of OpenAI Manager: ${isReady ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    logger.debug(`Details: apiKey exists=${!!this.apiKey}, isInitialized=${this.isInitialized}, isReady()=${isReady}`);
    
    return isReady;
  }
  
  /**
   * Schedules periodic checks to keep the service in good condition
   */
  schedulePeriodicChecks() {
    // No need to verify immediately, as initialize() already does it
    // Schedule periodic checks
    setInterval(() => this.verifyServiceState(), 60000); // Every minute
    logger.debug('Periodic service checks scheduled');
  }
  
  /**
   * Improved isReady method to properly check availability
   * @returns {boolean} True if the manager is ready to use
   */
  isReady() {
    // Most reliable check: having an API key is the primary requirement
    const hasApiKey = !!this.apiKey;
    
    if (hasApiKey) {
      // Auto-correct inconsistent state
      if (!this.isInitialized) {
        this.isInitialized = true;
        logger.debug('Auto-corrected isInitialized to true since API key exists');
      }
      return true;
    }
    
    return false;
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
   * Prepare the message content with context for the AI
   * @param {Object} context - Context data
   * @param {boolean} skipImages - Whether to skip including image URLs (default: false)
   * @returns {Array} Message content array for OpenAI API
   */
  prepareMessageContent(context, skipImages = false) {
    if (!context || !context.messages || !Array.isArray(context.messages)) {
      logger.error('Invalid context or messages for OpenAI request');
      return [];
    }

    try {
      // If there are already prepared messages, use them directly
      if (context.preparedMessages) {
        return context.preparedMessages;
      }

      // NEW: Initial log of the received context
      console.log('=== RECEIVED CONTEXT ===');
      console.log('1. Role:', context.role);
      console.log('2. ChatID:', context.chatId);
      console.log('3. Total unprocessed messages:', context.messages?.length || 0);
      console.log('==========================================================');

      // Use the function to chronologically sort the messages
      const organizedMessages = this._organizeMessagesByRole(context.messages);
      
      // Flag to know if the model supports vision (images)
      const modelSupportsVision = !skipImages && (this.model === 'gpt-4o' || this.model.includes('vision'));
      logger.debug(`Preparing messages for model: ${this.model}, supports vision: ${modelSupportsVision}, skipImages: ${skipImages}`);

      // Final array of correctly formatted messages
      const formattedMessages = [];

      // Determine if we have product details for the first message
      if (context.productDetails) {
        const product = context.productDetails;
        
        // IMPROVEMENT: Create a complete and structured product description that includes all available details
        // This version includes both formatted information and the complete structured data
        let productDescription = `== PRODUCT DETAILS ==\n`;
        productDescription += `Title: ${product.title || 'Not available'}\n`;
        productDescription += `Price: ${product.price || 'Not available'}\n`;
        productDescription += `Condition: ${product.condition || 'Not specified'}\n`;
        productDescription += `Location: ${product.location || 'Not specified'}\n\n`;
        productDescription += `Description:\n${product.description || 'No description available'}\n\n`;
        
        // Prepare additional attributes if they exist
        if (product.attributes && Object.keys(product.attributes).length > 0) {
          productDescription += "Additional attributes:\n";
          Object.entries(product.attributes).forEach(([key, value]) => {
            productDescription += `${key}: ${value}\n`;
          });
          productDescription += '\n';
        }
        
        // NEW: Add the complete technical data to ensure all available information is sent
        productDescription += `== COMPLETE PRODUCT DATA ==\n`;
        productDescription += `ID: ${product.id || product.listingId || 'Not available'}\n`;
        productDescription += `URL: ${product.url || product.originalUrl || 'Not available'}\n`;
        productDescription += `Currency: ${product.currency || 'Not specified'}\n`;
        productDescription += `Quantity: ${product.amount || 'Not specified'}\n`;
        
        // Include any other available fields
        const additionalFields = ['seller', 'sellerInfo', 'category', 'listingDate', 'viewCount', 'status', 'marketplace'];
        for (const field of additionalFields) {
          if (product[field]) {
            productDescription += `${field}: ${
              typeof product[field] === 'object' ? 
              JSON.stringify(product[field]) : 
              product[field]}\n`;
          }
        }
        
        // Logs to verify images
        if (product.imageUrls && product.imageUrls.length > 0) {
          console.log(`Attempting to add ${product.imageUrls.length} images to the product message`);
          productDescription += `\nAvailable images: ${product.imageUrls.length}\n`;
          
          // List the first 3 URLs for reference (regardless of whether they are included or not)
          product.imageUrls.slice(0, 3).forEach((url, i) => {
            productDescription += `Image ${i+1}: ${url.substring(0, 100)}...\n`;
          });
        }

        // Add the product message (first message always as "user")
        if (modelSupportsVision && product.imageUrls && product.imageUrls.length > 0 && !skipImages) {
          // Multipart format with images if the model supports it
          const content = [
            { type: "text", text: productDescription }
          ];
          
          // Add up to 3 images (reduced to avoid issues)
          product.imageUrls.slice(0, 3).forEach(imageUrl => {
            // Check that the URL is not from Facebook (avoids access problems)
            if (!imageUrl.includes('fbcdn.net') && !imageUrl.includes('facebook.com')) {
              content.push({
                type: "image_url",
                image_url: { url: imageUrl }
              });
              console.log(`  ✓ Added image: ${imageUrl}`);
            } else {
              logger.debug(`Skipping Facebook image URL to avoid access issues: ${imageUrl}`);
              console.log(`  ✗ Skipped Facebook image: ${imageUrl}`);
            }
          });
          
          formattedMessages.push({ role: "user", content });
          
        } else {
          // Text-only format for models that do not support vision
          let textWithImageRefs = productDescription;
          
          // Mention image URLs as textual references
          if (product.imageUrls && product.imageUrls.length > 0) {
            const imageCount = product.imageUrls.length;
            console.log(`Adding reference to ${imageCount} images in text format`);
            textWithImageRefs += `\n\n[${imageCount} images available]\n`;
          }
          
          formattedMessages.push({ role: "user", content: textWithImageRefs });
        }
      }
      
      // Process each message in the conversation according to its role
      for (const msg of organizedMessages) {
        // If the message has no content, ignore it
        if (!msg.content || (!msg.content.text && (!msg.content.media || !Object.values(msg.content.media).some(v => v)))) {
          continue;
        }
        
        // Determine the correct role based on sentByUs
        const isAssistant = msg.sentByUs;
        const messageRole = isAssistant ? "assistant" : "user";
        
        // Get the text of the message
        const messageText = msg.content.text || '';
        
        // Check if there is media to include
        const hasMedia = msg.content.media && Object.values(msg.content.media).some(v => v);
        
        // For models that support vision, use multipart format if there are images
        if (modelSupportsVision && hasMedia && msg.content.media.images && msg.content.media.images.length > 0 && !skipImages) {
          const content = [
            { type: "text", text: messageText }
          ];
          
          // Add the images to the content (only if they are not from Facebook)
          msg.content.media.images.forEach(image => {
            if (image.url && !image.url.includes('fbcdn.net') && !image.url.includes('facebook.com')) {
              content.push({
                type: "image_url",
                image_url: { url: image.url }
              });
            }
          });
          
          formattedMessages.push({ role: messageRole, content });
          
        } else {
          // For plain text or models without image support
          let fullText = messageText;
          
          // Include media references as text
          if (hasMedia) {
            const mediaDesc = [];
            
            if (msg.content.media.images && msg.content.media.images.length) {
              mediaDesc.push(`${msg.content.media.images.length} image(s)`);
            }
            
            if (msg.content.media.video) {
              mediaDesc.push('video');
            }
            
            if (msg.content.media.audio) {
              mediaDesc.push('audio');
              // If there is a transcript, include it
              if (msg.content.transcribedAudio) {
                fullText += `\nAudio transcript: "${msg.content.transcribedAudio}"`;
              }
            }
            
            if (msg.content.media.files && msg.content.media.files.length) {
              mediaDesc.push(`${msg.content.media.files.length} file(s)`);
            }
            
            if (msg.content.media.location) {
              mediaDesc.push(`location: ${msg.content.media.location.label || 'shared'}`);
            }
            
            if (mediaDesc.length > 0) {
              fullText += `\n[${mediaDesc.join(', ')}]`;
            }
          }
          
          formattedMessages.push({ role: messageRole, content: fullText });
        }
      }
      
      // Ensure the last message is from the "user" role for the assistant to respond
      if (formattedMessages.length > 0) {
        const lastMessage = formattedMessages[formattedMessages.length - 1];
        
        if (lastMessage.role !== "user") {
          // Add an additional message for the user to request a response
          formattedMessages.push({
            role: "user",
            content: `Respond to the last message as ${context.role}, considering all the context of the conversation.`
          });
        }
      }

      console.log('=== EXACT MESSAGE SENT TO OPENAI ===');
      console.log('1.', context.role);
      console.log('2. Messages:', JSON.parse(JSON.stringify(formattedMessages)));
      console.log('=========================================');
      
      return formattedMessages;
    } catch (error) {
      logger.error(`Error preparing messages: ${error.message}`);
      return [];
    }
  }

  /**
   * Organizes messages into user and assistant categories and ensures chronological order
   * CORRECTION: Renamed to _organizeMessagesByRole to avoid confusion,
   * as it's now an internal method (helper function)
   * @param {Array} messages - List of messages
   * @returns {Array} Messages organized by chronological order
   * @private
   */
  _organizeMessagesByRole(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }
    
    try {
      // Make a copy of messages to avoid modifying the original
      const sortedMessages = [...messages];
      
      // Sort messages chronologically by timestamp if it exists
      sortedMessages.sort((a, b) => {
        // If both have timestamp, use it to sort
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        }
        // If only one has timestamp, put it first
        else if (a.timestamp) return -1;
        else if (b.timestamp) return 1;
        
        // If they have sequential id (like msg_chat_1, msg_chat_2)
        if (a.id && b.id && a.id.includes('_') && b.id.includes('_')) {
          const aNum = parseInt(a.id.split('_').pop());
          const bNum = parseInt(b.id.split('_').pop());
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
        }
        
        // Default: keep the original order (which is usually chronological)
        return 0;
      });
      
      // Additional verification to ensure messages have the correct format
      for (let i = 0; i < sortedMessages.length; i++) {
        // Ensure each message has the content property
        if (!sortedMessages[i].content) {
          sortedMessages[i].content = { text: "" };
        }
        // If content is a direct string, convert it to an object
        else if (typeof sortedMessages[i].content === 'string') {
          sortedMessages[i].content = { text: sortedMessages[i].content };
        }
      }
      
      return sortedMessages;
    } catch (error) {
      logger.error(`Error organizing messages: ${error.message}`);
      return [...messages]; // Return a copy of the original messages without changes
    }
  }

  /**
   * Generate a response using OpenAI API
   * @param {Object} context - Context data including role, messages, and product details
   * @returns {Promise<Object>} Generated structured response object or an error object
   */
  async generateResponse(context) {
    // If we are not ready, initialize first
    if (!this.isReady()) {
      logger.warn('OpenAI service not ready. Attempting to initialize...');
      this.initialize();
      
      if (!this.isReady()) {
        logger.error('OpenAI service could not be initialized');
        throw new Error('OpenAI service not properly initialized');
      }
    }
    
    const startTime = Date.now();
    this.metrics.totalCalls++;

    try {
      logger.log(`Generating response as ${context.role} using OpenAI Assistants API`);
      
      // Get or create a thread for this chat
      const threadObj = await this.getOrCreateThread(context.chatId);
      const threadId = threadObj.id;
      
      // NEW: Log of the thread
      console.log(`🧵 Thread used for response: ${threadId} (${threadObj.isNew ? 'NEW' : 'EXISTING'})`);
      
      // Add context messages to the thread (first attempt with images)
      try {
        // Prepare message content with potential images if model supports vision
        const messages = this.prepareMessageContent(context, false); // skipImages = false
        
        // NEW: Explicit log of the sending moment
        console.log(`🚀 SENDING TO OPENAI: ${messages.length} messages, threadId: ${threadId}`);
        
        await this.addMessageToThread(threadId, {
          ...context,
          preparedMessages: messages
        });
      } catch (error) {
        logger.warn(`Error adding messages with images: ${error.message}`);
        logger.warn('Retrying without images...');
        
        // Retry with skipImages=true if we get an error
        const messagesWithoutImages = this.prepareMessageContent(context, true); // skipImages = true
        await this.addMessageToThread(threadId, {
          ...context,
          preparedMessages: messagesWithoutImages
        });
      }
      
      // Get the appropriate assistant ID based on role
      const assistantId = this.getAssistantIdForRole(context.role);
      
      // Run assistant and wait for structured response
      const response = await this.runAssistant(threadId, assistantId);
      
      // Record metrics
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.metrics.successfulCalls++;
      this.metrics.totalResponseTime += duration;
      this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.successfulCalls;
      
      logger.log(`Response generated in ${duration}ms`);
      
      return response;
    } catch (error) {
      // Record metrics for failed calls
      this.metrics.failedCalls++;
      
      // If we receive an error about downloading images, log it specially
      if (error.message && error.message.includes('Error while downloading')) {
        logger.error(`Error generating response due to image download issues. Try with skipImages=true parameter: ${error.message}`);
      } else {
        logger.error(`Error generating response: ${error.message}`);
      }
      
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
      // Prepare message content
      const messageContent = context.preparedMessages || this.prepareMessageContent(context);
      
      // Ensure we have a valid threadId
      if (!threadId) {
        throw new Error('Invalid threadId');
      }

      if (!messageContent || !messageContent.length) {
        throw new Error('No message content to add');
      }
      
      /*// NEW: Log exactly what is being added to the thread
      console.log(`🧵 Adding exactly ${messageContent.length} messages to thread: ${threadId}`);
      console.table(messageContent.map((msg, idx) => ({
        idx,
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? (msg.content.length > 30 ? msg.content.substring(0, 30) + '...' : msg.content)
          : (Array.isArray(msg.content) ? `${msg.content.length} parts` : typeof msg.content)
      })));*/

      // Check if we have OpenAI client initialized
      if (!this.client || !this.client.beta || !this.client.beta.threads || !this.client.beta.threads.messages) {
        // Attempt to re-initialize the client if not available
        logger.warn('OpenAI client not initialized, attempting to recreate it');
        this.initialize(this.apiKey);
        
        // Check again after re-initialization
        if (!this.client || !this.client.beta || !this.client.beta.threads || !this.client.beta.threads.messages) {
          throw new Error('OpenAI client not properly initialized');
        }
      }

      // Add each message to the thread
      for (let i = 0; i < messageContent.length; i++) {
        const msg = messageContent[i];
        
        // Skip system messages as they can't be added directly
        if (msg.role === 'system') {
          continue;
        }
        
        // Ensure message format is valid (especially content array)
        if (Array.isArray(msg.content)) {
          // Ensure each content item has a 'type' field
          msg.content.forEach((item, index) => {
            if (!item.type) {
              logger.warn(`Missing 'type' in content[${index}], defaulting to 'text'`);
              item.type = 'text';
            }
          });
        } else if (typeof msg.content === 'string') {
          // Convert string content to properly formatted array
          msg.content = [{ type: 'text', text: msg.content }];
        }
        
        try {
          await this.client.beta.threads.messages.create(
            threadId,
            {
              role: msg.role,
              content: msg.content
            }
          );
          logger.debug(`Added message #${i+1} with role ${msg.role} to thread ${threadId}`);
        } catch (msgError) {
          logger.error(`Error adding message #${i+1}: ${msgError.message}`);
          throw msgError;
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error adding message to thread: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clears the chat input field
   * @returns {boolean} True if it could be cleared, false if the field was not found
   */
  clearInputField() {
    try {
      const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
      if (!inputField) {
        logger.error('Message input field to clear not found');
        return false;
      }

      // IMPROVED: First check if there is already content in the field
      const isContentEditable = inputField.getAttribute('contenteditable') === 'true';
      const currentContent = isContentEditable ? 
        (inputField.textContent || '').trim() : 
        (inputField.value || '').trim();
        
      if (currentContent) {
        logger.debug(`Field has previous content (${currentContent.length} chars): "${currentContent.substring(0, 30)}..."`);
      } else {
        logger.debug('Field is already empty, no cleaning needed');
        return true; // Already clean, no processing needed
      }

      // PHASE 1: Preserve the current focus
      const activeElement = document.activeElement;

      // PHASE 2: Multiple cleaning strategies
      if (isContentEditable) {
        // Clean directly and aggressively for contenteditable
        inputField.innerHTML = '';
        inputField.textContent = '';
        
        // Use selection and delete
        inputField.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // ADDITIONAL TECHNIQUE: Range API for selection and deletion
        const range = document.createRange();
        range.selectNodeContents(inputField);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        selection.deleteFromDocument();
        
        // ADDITIONAL TECHNIQUE: Set empty text via textContent and innerHTML
        setTimeout(() => {
          inputField.textContent = '';
          inputField.innerHTML = '';
        }, 0);
      } 
      // For standard input/textarea fields
      else if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
        inputField.value = '';
        // Also try with all possible techniques
        inputField.setAttribute('value', '');
      }
      
      // PHASE 3: Trigger multiple events to notify changes
      const events = ['input', 'change', 'keyup', 'keydown'];
      events.forEach(eventType => {
        inputField.dispatchEvent(new Event(eventType, { bubbles: true }));
      });

      // PHASE 4: Verify if it was actually cleaned
      setTimeout(() => {
        const postCleanContent = isContentEditable ? 
          (inputField.textContent || '').trim() : 
          (inputField.value || '').trim();
          
        if (postCleanContent) {
          logger.warn(`Cleaning not effective, remaining content: "${postCleanContent.substring(0, 30)}..."`);
          
          // EMERGENCY CLEANING
          try {
            if (isContentEditable) {
              inputField.innerHTML = '';
              const parent = inputField.parentNode;
              if (parent) {
                const clone = inputField.cloneNode(false);
                parent.replaceChild(clone, inputField);
                clone.dispatchEvent(new Event('input', { bubbles: true }));
              }
            } else if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
                .set.call(inputField, '');
              inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } catch (e) {
            logger.debug(`Error in emergency cleaning: ${e.message}`);
          }
        } else {
          logger.debug('Verification: Field clean after process');
        }
      }, 50);

      // PHASE 5: Restore focus if it was different
      if (activeElement !== inputField && activeElement) {
        try {
          activeElement.focus();
        } catch (e) {
          // Ignore focus errors
        }
      }
      
      logger.debug('Aggressive cleaning of the input field completed');
      return true;
    } catch (error) {
      logger.error(`Error in clearInputField: ${error.message}`, {}, error);
      return false;
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
   * Get or create a thread for a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<Object>} Thread data
   */
  async getOrCreateThread(chatId) {
    // Check if we already have a thread for this chat
    const existingThread = this.activeThreads.get(chatId);
    if (existingThread && (Date.now() - existingThread.lastUsed < this.threadTTL)) {
      // NEW: Log of the existing thread
      console.log(`🧵 Reusing existing thread: ${existingThread.id} for chat: ${chatId}`);
      logger.debug(`Reusing existing thread ${existingThread.id} for chat ${chatId}`);
      
      // Update last used timestamp
      existingThread.lastUsed = Date.now();
      return {id: existingThread.id, isNew: false};
    }

    try {
      // Check if this.client is initialized
      if (!this.client || !this.client.beta || !this.client.beta.threads) {
        // Attempt to reinitialize
        logger.warn('OpenAI client not initialized for thread creation, attempting to recreate');
        this.initialize(this.apiKey);
        
        if (!this.client || !this.client.beta || !this.client.beta.threads) {
          throw new Error('OpenAI client not properly initialized for thread operations');
        }
      }

      // Create a new thread
      const response = await this.client.beta.threads.create();
      const threadId = response.id;

      // NEW: Log of the new thread
      console.log(`🧵 New thread created: ${threadId} for chat: ${chatId}`);
      logger.log(`Created new thread ${threadId} for chat ${chatId}`);

      // Store in active threads
      this.activeThreads.set(chatId, {
        id: threadId,
        lastUsed: Date.now()
      });

      return {id: threadId, isNew: true};
    } catch (error) {
      logger.error(`Error creating thread: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run an assistant on a thread and get the response
   * @param {string} threadId - Thread ID
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<Object>} Parsed JSON structured response object
   */
  async runAssistant(threadId, assistantId) {
    try {
      // NEW: Log with threadId and assistantId
      console.log(`🧵 Running assistant: ${assistantId} on thread: ${threadId}`);
      logger.log(`Running assistant ${assistantId} on thread ${threadId}`);

      // Start a run
      const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          assistant_id: assistantId
        })
      });

      if (!runResponse.ok) {
        const errorData = await runResponse.json().catch(() => ({ error: { message: runResponse.statusText } }));
        throw new Error(`Failed to start run: ${errorData.error?.message || runResponse.statusText}`);
      }

      const run = await runResponse.json();
      logger.debug(`Started run ${run.id} on thread ${threadId} with response_format: json_object`);

      // Poll for completion
      await this.pollRunUntilComplete(threadId, run.id);

      // Get the assistant's message as plain text
      const textResponse = await this.getAssistantResponseFromRun(threadId, run.id);
      
      logger.debug("Retrieved assistant's text response");
      return textResponse;
    } catch (error) {
      logger.error(`Error running assistant: ${error.message}`);
      throw error; 
    }
  }

  /**
   * Polls a run until it's completed, failed, or cancelled.
   * @param {string} threadId - The ID of the thread.
   * @param {string} runId - The ID of the run.
   * @returns {Promise<void>} Resolves when the run is in a terminal state.
   * @throws {Error} If the run fails or is cancelled, or if polling times out.
   */
  async pollRunUntilComplete(threadId, runId) {
    const pollInterval = 1000; // Poll every 1 second
    const maxAttempts = 60; // Max 60 attempts (e.g., 60 seconds)
    let attempts = 0;

    logger.debug(`[pollRunUntilComplete] Starting polling for run ${runId} on thread ${threadId}`);

    return new Promise(async (resolve, reject) => {
      const checkStatus = async () => {
        try {
          attempts++;
          if (attempts > maxAttempts) {
            logger.error(`[pollRunUntilComplete] Polling timed out for run ${runId} after ${maxAttempts} attempts.`);
            reject(new Error(`Polling timed out for run ${runId}`));
            return;
          }

          const runStatusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            }
          });

          if (!runStatusResponse.ok) {
            const errorData = await runStatusResponse.json().catch(() => ({ error: { message: runStatusResponse.statusText } }));
            logger.error(`[pollRunUntilComplete] Error fetching run status for ${runId}: ${errorData.error?.message || runStatusResponse.statusText}`);
            // Depending on the error, you might want to retry or reject immediately.
            // For now, let's retry a few times for transient network issues.
            if (attempts < 5 && (runStatusResponse.status === 500 || runStatusResponse.status === 503)) {
                logger.warn(`[pollRunUntilComplete] Retrying due to server error (status ${runStatusResponse.status}). Attempt ${attempts}/5.`);
                setTimeout(checkStatus, pollInterval * attempts); // Exponential backoff might be better
                return;
            }
            reject(new Error(`Failed to fetch run status: ${errorData.error?.message || runStatusResponse.statusText}`));
            return;
          }

          const runStatus = await runStatusResponse.json();
          logger.debug(`[pollRunUntilComplete] Run ${runId} status: ${runStatus.status} (Attempt: ${attempts})`);

          switch (runStatus.status) {
            case 'queued':
            case 'in_progress':
            case 'requires_action': // If you implement function calling, you'd handle this. For now, we wait.
              setTimeout(checkStatus, pollInterval);
              break;
            case 'completed':
              logger.log(`[pollRunUntilComplete] Run ${runId} completed successfully.`);
              resolve();
              break;
            case 'failed':
              logger.error(`[pollRunUntilComplete] Run ${runId} failed. Reason: ${runStatus.last_error?.message || 'Unknown error'}`);
              reject(new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`));
              break;
            case 'cancelled':
              logger.warn(`[pollRunUntilComplete] Run ${runId} was cancelled.`);
              reject(new Error('Run was cancelled'));
              break;
            case 'expired':
              logger.error(`[pollRunUntilComplete] Run ${runId} expired.`);
              reject(new Error('Run expired'));
              break;
            default:
              logger.error(`[pollRunUntilComplete] Unknown run status for ${runId}: ${runStatus.status}`);
              reject(new Error(`Unknown run status: ${runStatus.status}`));
          }
        } catch (error) {
          logger.error(`[pollRunUntilComplete] Error during polling for run ${runId}: ${error.message}`);
          // Retry for a few attempts in case of network errors
          if (attempts < 5) {
            logger.warn(`[pollRunUntilComplete] Retrying due to polling error. Attempt ${attempts}/5.`);
            setTimeout(checkStatus, pollInterval * attempts);
            return;
          }
          reject(error);
        }
      };

      checkStatus(); // Start the polling
    });
  }

  /**
   * Get the assistant's response from a completed run
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID (Note: runId is not strictly needed if fetching latest messages)
   * @returns {Promise<string>} Raw JSON string response text from the assistant
   */
  async getAssistantResponseFromRun(threadId, runId) { // runId kept for context, though messages are fetched for thread
    try {
      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages?limit=1&order=desc`, { // Fetch latest message
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Failed to retrieve messages: ${errorData.error?.message || response.statusText}`);
      }

      const messagesResponse = await response.json();

      const assistantMessage = messagesResponse.data && messagesResponse.data.length > 0 ? messagesResponse.data[0] : null;

      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        logger.error('No assistant message found as the latest message, or latest message not from assistant.', { messagesData: messagesResponse.data });
        throw new Error('No assistant message found as the latest message in the thread.');
      }

      if (assistantMessage.content && assistantMessage.content.length > 0) {
        const textContentItem = assistantMessage.content.find(contentItem => contentItem.type === 'text');
        if (textContentItem && textContentItem.text && typeof textContentItem.text.value === 'string') {
          logger.debug("Retrieved assistant's message content (expected to be JSON string).");
          return textContentItem.text.value;
        }
      }

      logger.error('No text content found in assistant message or content is not in expected format.', { assistantMessage });
      throw new Error('No text content found in assistant message or content is not in expected format.');
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

    // Use storageUtils for greater persistence
    storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);

    logger.log(`Set assistant ${assistantId} for role ${role}`);
  }

  /**
   * Create or update a wizard with name and instructions.
   * The instructions should guide the assistant to output JSON matching the desired schema.
   * @param {'seller'|'buyer'|'default'} role
   * @param {string} name
   * @param {string} instructions - These instructions MUST guide the assistant to produce JSON.
   * @returns {Promise<string>} assistantId
   */
  async createOrUpdateAssistant(role, name, instructions) {
    if (!this.isInitialized && !this.apiKey) {
        logger.error('API key not initialized. Cannot create or update assistant.');
        throw new Error('API key not initialized');
    }
    let assistantId = this.assistants[role];
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    const modelToUse = this.model || "gpt-4o"; 

    const assistantBody = {
        name,
        instructions, // Crucial: these instructions must tell the assistant to output JSON according to your schema
        model: modelToUse,
        // response_format: { type: "json_object" } // Can be set here too, but setting per-run gives more flexibility
    };

    let requestUrl;
    let method;

    if (assistantId) {
      requestUrl = `https://api.openai.com/v1/assistants/${assistantId}`;
      method = 'POST'; // OpenAI API uses POST for updates to assistants.
      logger.debug(`Updating assistant ${assistantId} for role ${role} with model ${modelToUse}.`);
    } else {
      requestUrl = 'https://api.openai.com/v1/assistants';
      method = 'POST';
      logger.debug(`Creating new assistant for role ${role} with model ${modelToUse}.`);
    }

    try {
        const res = await fetch(requestUrl, {
            method: method,
            headers,
            body: JSON.stringify(assistantBody)
        });

        if (!res.ok) {
            const errText = await res.text();
            logger.error(`Failed to ${assistantId ? 'update' : 'create'} assistant for role ${role}: ${res.status} ${res.statusText}`, { errorBody: errText });
            const errJson = JSON.parse(errText); // Attempt to parse error
            throw new Error(errJson.error?.message || `Failed to ${assistantId ? 'update' : 'create'} assistant: ${res.status}`);
        }

        const data = await res.json();
        assistantId = data.id; // Update assistantId if it was a creation
        this.assistants[role] = assistantId;
        storageUtils.set(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, assistantId);
        logger.log(`Assistant ${assistantId} ${assistantId && method === 'POST' && requestUrl.includes(assistantId) ? 'updated' : 'created'} successfully for role ${role}.`);
        return assistantId;

    } catch (error) {
        // If error is already an Error object with a message, rethrow it. Otherwise, create a new one.
        if (error.message) {
            throw error;
        } else {
            throw new Error(`Unexpected error during assistant ${assistantId ? 'update' : 'creation'}: ${String(error)}`);
        }
    }
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
          'OpenAI-Beta': 'assistants=v2'  // Updated to v2
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
   * Get metrics about API usage
   * @returns {Object} Metrics
   */
  getMetrics() {
    const threadCount = this.activeThreads.size;
    
    // NEW: Method to show detailed information of active threads
    this.logActiveThreads();
    
    return {
      ...this.metrics,
      activeThreads: threadCount,
      averageResponseTime: this.metrics.successfulCalls ? (this.metrics.totalResponseTime / this.metrics.successfulCalls) : 0
    };
  }
  
  /**
   * NEW: Displays information about all active threads in the console
   */
  logActiveThreads() {
    console.log(`🧵 === ACTIVE THREADS (${this.activeThreads.size}) ===`);
    if (this.activeThreads.size === 0) {
      console.log("No active threads at the moment");
      return;
    }
    
    const threadsInfo = [];
    this.activeThreads.forEach((threadInfo, chatId) => {
      const timeSinceLastUse = Math.round((Date.now() - threadInfo.lastUsed) / 1000);
      threadsInfo.push({
        chatId,
        threadId: threadInfo.id,
        lastUsed: new Date(threadInfo.lastUsed).toLocaleTimeString(),
        secondsAgo: timeSinceLastUse,
        expires: Math.round((this.threadTTL - (Date.now() - threadInfo.lastUsed)) / 1000)
      });
    });
    
    console.table(threadsInfo);
  }

  /**
   * Clean up old threads to prevent memory leaks
   */
  cleanupOldThreads() {
    // NEW: Log before cleanup
    const initialCount = this.activeThreads.size;
    console.log(`🧵 Starting cleanup of threads (${initialCount} active)`);
    
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
    } else {
      console.log(`🧵 No expired threads found for deletion (${finalCount} active)`);
    }
  }
}

// expose
const openAIManager = new OpenAIManager();
window.openaiManager = openAIManager;
// Ensure that openaiManager is globally accessible
console.log('[OpenAI Manager] Instance exposed globally as window.openaiManager');

// Add a checker that will run after the DOM is loaded AND when the script is executed
(function ensureGlobalOpenAIManager() {
  // Run immediately
  if (!window.openaiManager || !window.openaiManager.isReady) {
    console.warn('[OpenAI Manager] OpenAI Manager not available or missing necessary methods, reinstalling...');
    window.openaiManager = openAIManager;
    
    // Verify that critical methods exist
    if (typeof window.openaiManager.initialize !== 'function') {
      console.error('[OpenAI Manager] CRITICAL ERROR! The initialize method is not available after reinstalling');
      // Add the method if missing
      window.openaiManager.initialize = function(apiKey = null) {
        return openAIManager.initialize(apiKey);
      };
    }
    
    if (typeof window.openaiManager.isReady !== 'function') {
      window.openaiManager.isReady = function() {
        return !!window.openaiManager.apiKey;
      };
    }
    
    if (typeof window.openaiManager.verifyServiceState !== 'function') {
      window.openaiManager.verifyServiceState = function() {
        return openAIManager.verifyServiceState();
      };
    }
  }

  // Verify that the API key is correctly assigned
  if (CONFIG?.AI?.apiKey && !window.openaiManager.apiKey) {
    window.openaiManager.apiKey = CONFIG.AI.apiKey;
    window.openaiManager.isInitialized = true;
  }
  
  console.log('[OpenAI Manager] Status after global verification:', 
              `apiKey=${!!window.openaiManager.apiKey}`,
              `isInitialized=${window.openaiManager.isInitialized}`,
              `isReady=${typeof window.openaiManager.isReady === 'function' ? window.openaiManager.isReady() : 'method not available'}`);
})();

// Also attach to the DOMContentLoaded event for added security
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(() => {
    if (!window.openaiManager) {
      console.error('[OpenAI Manager] Error: openaiManager not detected in window after DOMContentLoaded. Reinstalling...');
      window.openaiManager = openAIManager;
    }
    
    // Also verify the assistants if we have a valid API key
    if (window.openaiManager.isReady() && typeof window.openaiManager.listAssistants === 'function') {
      console.log('[OpenAI Manager] Starting automatic loading of assistants...');
      window.openaiManager.listAssistants()
        .then(assistants => {
          console.log(`[OpenAI Manager] ${assistants.length} assistants found automatically`);
          // If there is a UI handler for assistants, update the interface
          if (window.updateAssistantsList) {
            window.updateAssistantsList(assistants);
          }
        })
        .catch(err => {
          console.warn('[OpenAI Manager] Error loading assistants automatically:', err.message);
        });
    }
  }, 1000);
});