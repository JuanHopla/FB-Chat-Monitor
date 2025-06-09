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
   * @param {Object} context
   * @returns {Promise<Array>} Message content array
   */
  async prepareMessageContent(context) {
    if (!context || !context.messages || !Array.isArray(context.messages)) {
      logger.error('Invalid context for message preparation');
      return [];
    }

    try {
      // Format in chronological order and assign correct roles
      const formattedMessages = this._organizeMessagesByRole(context.messages);

      // Add product details as first message
      if (context.productDetails) {
        // Destructure common fields for clarity
        const { title, price, condition, description, url, images, image, sellerProfilePic } = context.productDetails;
        
        // Create product details content array for multimodal format
        const productContent = [];
        
        // Add combined text elements with validation to stay under OpenAI's limit of 10 content elements per message
        let productDetailsText = "PRODUCT DETAILS:\n";
        
        // Add product category header if available
        let category = context.productDetails.category || context.productDetails.categoryName || "";
        let isCar = false;
        let isApartment = false;
        
        // Detect category from fields if not explicitly provided
        if (!category) {
          if (context.productDetails.make || context.productDetails.model || 
              context.productDetails.year || context.productDetails.mileage) {
            category = "CARS";
            isCar = true;
          } else if (context.productDetails.bedrooms || context.productDetails.bathrooms || 
                    context.productDetails.squareMeters || context.productDetails.squareFeet) {
            category = "APARTMENTS";
            isApartment = true;
          }
        } else {
          // Check if existing category matches our special categories
          isCar = /cars?|vehicles?|autos?|automóviles?/i.test(category);
          isApartment = /apartments?|house|home|real estate|propiedad|casa|apartamento/i.test(category);
        }
        
        // Add category if detected
        if (category) {
          productDetailsText += `Category: ${category}\n`;
        }
        
        // Add core product details
        productDetailsText += `Title: ${title || 'N/A'}\n`;
        productDetailsText += `Price: ${price || 'N/A'}\n`;
        productDetailsText += `Condition: ${condition || 'N/A'}\n`;
        
        // ALWAYS include car fields, even if they are not present
        productDetailsText += "Car Details: ";
        if (isCar) {
          const carDetails = [];
          if (context.productDetails.make) carDetails.push(`Make: ${context.productDetails.make}`);
          if (context.productDetails.model) carDetails.push(`Model: ${context.productDetails.model}`);
          if (context.productDetails.year) carDetails.push(`Year: ${context.productDetails.year}`);
          if (context.productDetails.mileage) carDetails.push(`Mileage: ${context.productDetails.mileage}`);
          if (context.productDetails.transmission) carDetails.push(`Transmission: ${context.productDetails.transmission}`);
          if (context.productDetails.fuel) carDetails.push(`Fuel Type: ${context.productDetails.fuel}`);
          
          if (carDetails.length > 0) {
            productDetailsText += carDetails.join(', ') + '\n';
          } else {
            productDetailsText += 'N/A\n';
          }
        } else {
          productDetailsText += 'N/A\n';
        }
        
        // ALWAYS include apartment fields, even if they are not present
        productDetailsText += "Property Details: ";
        if (isApartment) {
          const propertyDetails = [];
          if (context.productDetails.bedrooms) propertyDetails.push(`Bedrooms: ${context.productDetails.bedrooms}`);
          if (context.productDetails.bathrooms) propertyDetails.push(`Bathrooms: ${context.productDetails.bathrooms}`);
          
          const area = context.productDetails.squareMeters || context.productDetails.squareFeet;
          const areaUnit = context.productDetails.squareMeters ? 'm²' : 'ft²';
          if (area) propertyDetails.push(`Area: ${area} ${areaUnit}`);
          if (context.productDetails.floor) propertyDetails.push(`Floor: ${context.productDetails.floor}`);
          
          if (propertyDetails.length > 0) {
            productDetailsText += propertyDetails.join(', ') + '\n';
          } else {
            productDetailsText += 'N/A\n';
          }
        } else {
          productDetailsText += 'N/A\n';
        }
        
        // EXCLUDE image fields before assembling Additional Details
        const standardFields = [
          'title','price','condition','description','url',
          'images','image','imageUrls','sellerProfilePic',
          'category','categoryName','make','model','year','mileage',
          'transmission','fuel','bedrooms','bathrooms','squareMeters',
          'squareFeet','floor'
        ];
        const additionalFields = [];
        for (const [key, value] of Object.entries(context.productDetails)) {
          if (!standardFields.includes(key) && value != null) {
            additionalFields.push(`${key}: ${value}`);
          }
        }
        if (additionalFields.length) {
          productDetailsText += `Additional Details: ${additionalFields.join(', ')}\n`;
        }
        
        // description and URL at the end
        productDetailsText += `Description: ${description || 'N/A'}\n`;
        if (url) productDetailsText += `URL: ${url}\n`;

        productContent.push({ type: "text", text: productDetailsText.trim() });

        // --------------------------------------------------------
        // Always filter HEAD and build image_url
        // --------------------------------------------------------
        const testUrls = [
          ...(Array.isArray(images) ? images.slice(0, 6) : []),
          ...(image ? [image] : []),
          ...(sellerProfilePic ? [sellerProfilePic] : [])
        ];
        const validItems = [];
        for (const imgUrl of testUrls) {
          try {
            const resp = await fetch(imgUrl, { method: 'HEAD' });
            if (resp.ok) {
              validItems.push({ type: "image_url", image_url: { url: imgUrl } });
            }
          } catch { /* omit */ }
        }
        if (validItems.length) {
          productContent.push(...validItems);
        } else {
          productContent.push({ type: "image_url", image_url: { url: '' } });
        }

        formattedMessages.unshift({
          role: "user",
          content: productContent
        });
            }


      // Convert message objects to proper format for the API with validation
      const finalMessages = formattedMessages.map((message, index) => {
        // If message has no content, use a default empty text message
        if (!message.content) {
          logger.debug(`Message #${index} has no content. Using default empty text.`);
          return {
            role: message.role || "user",
            content: [{ type: "text", text: " " }] // Space as minimum valid content
          };
        }

        // Ensure message has a valid role
        if (!message.role || !["user", "assistant", "system"].includes(message.role)) {
          message.role = "user"; // Default to user if role is invalid
        }

        // If content is already in array format, validate each item
        if (Array.isArray(message.content)) {
          const validContent = message.content
            .map(item => {
              // PASSTHROUGH para imágenes
              if (item.type === 'image_url' && item.image_url?.url !== undefined) {
                return item;
              }
              // Conserva textos
              if (item.type === 'text' && typeof item.text === 'string') {
                return item;
              }
              // descartar todo lo demás
              return null;
            })
            .filter(item => item !== null);

          return {
            role: message.role,
            content: validContent.length ? validContent : [{ type: "text", text: " " }]
          };
        }
        
        // For string content, convert to proper format
        if (typeof message.content === 'string') {
          return {
            role: message.role,
            content: [{
              type: "text",
              text: message.content || " " // Use space if empty
            }]
          };
        }
        
        // For content object with text and media
        if (typeof message.content === 'object' && message.content !== null) {
          const contentArray = [];
          
          // Add text content if available and valid
          if (message.content.text && typeof message.content.text === 'string') {
            contentArray.push({
              type: "text",
              text: message.content.text.trim() || " " // Space as fallback
            });
          }
          
          // Add images if available and not skipping
          if (message.content.imageUrls && Array.isArray(message.content.imageUrls)) {
            message.content.imageUrls.forEach(imageUrl => {
              if (imageUrl && typeof imageUrl === 'string') {
                contentArray.push({
                  type: "image_url",
                  image_url: {
                    url: imageUrl
                  }
                });
              }
            });
          }
          
          // Ensure we have at least one valid content item
          if (contentArray.length === 0) {
            contentArray.push({
              type: "text",
              text: " " // Space as minimum valid content
            });
          }
          
          return {
            role: message.role,
            content: contentArray
          };
        }
        
        // Fallback for unexpected formats
        return {
          role: message.role,
          content: [{
            type: "text",
            text: " " // Space as minimum valid content
          }]
        };
      });

      // Final validation to log any potential issues
      finalMessages.forEach((msg, index) => {
        // Check content array is valid
        const hasValidContent = msg.content && Array.isArray(msg.content) && msg.content.length > 0;
        
        if (!hasValidContent) {
          logger.warn(`Message #${index} has an invalid content array. Role: ${msg.role}`);
        } else {
          // Check each content item
          msg.content.forEach((item, itemIndex) => {
            if (item.type === "text" && (!item.text || typeof item.text !== 'string')) {
              logger.warn(`Message #${index}, content item #${itemIndex} has invalid text.`);
            }
            if (item.type === "image_url" && (!item.image_url || !item.image_url.url)) {
              logger.warn(`Message #${index}, content item #${itemIndex} has invalid image_url.`);
            }
          });
        }
      });

      // Log the exact messages being sent to OpenAI
      logger.debug('=== EXACT MESSAGE SENT TO OPENAI ===');
      logger.debug('1. Context Role:', context.role);
      logger.debug('2. Messages:', JSON.stringify(finalMessages));
      console.log('OPENAI_PAYLOAD →', finalMessages);
      return finalMessages;
    } catch (error) {
      logger.error(`Error preparing message content: ${error.message}`, {}, error);
      return [];
    }
  }

  /**
   * Organizes messages into user and assistant categories and ensures chronological order
   * @param {Array} messages - List of messages
   * @returns {Array} Messages organized by chronological order with proper roles
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
      
      // Assign proper roles based on sentByUs flag
      for (let i = 0; i < sortedMessages.length; i++) {
        const message = sortedMessages[i];
        
        // Ensure each message has content
        if (!message.content) {
          message.content = { text: "" };
        }
        // If content is a direct string, convert it to an object
        else if (typeof message.content === 'string') {
          message.content = { text: message.content };
        }
        
        // Assign the correct role based on who sent the message
        // CORRECTION: The logic must be:
        // - If it was sent by us (sentByUs=true), then it is the assistant
        // - If it was sent by the other (sentByUs=false), then it is the user
        if (typeof message.sentByUs === 'boolean') {
          message.role = message.sentByUs ? "assistant" : "user";
        } else if (!message.role || !["user", "assistant", "system"].includes(message.role)) {
          // If there is no information about who sent it and it does not have a valid role,
          // assign a role based on alternation
          // We assume that the first message is always from the user
          message.role = (i % 2 === 0) ? "user" : "assistant";
        }
      }
      
      logger.debug(`Messages organized: ${sortedMessages.length} messages with proper roles`);
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
    try {
      if (!this.isReady()) {
        logger.error('OpenAI API not ready');
        throw new Error('OpenAI API not ready');
      }

      // Extract role and validate (default to 'buyer')
      const role = context?.role || 'buyer';
      logger.log(`Generating response as ${role} using OpenAI Assistants API`);

      // Ensure API instance is properly initialized/refreshed
      if (!this.client) {
        const success = await this.initialize();
        logger.log(`OpenAI Manager initialized: ${success ? 'SUCCESS' : 'FAILED'}`);
        if (!success) {
          throw new Error('Could not initialize OpenAI API');
        }
      }

      // Get appropriate assistant ID for this role
      const assistantId = this.getAssistantIdForRole(role);

      // Get or create a thread for the conversation
      // Extract chatId from context, with fallback to a default one
      const chatId = context.chatId || 'default_chat';
      
      // siempre omitimos imágenes (skipImages = true)
      const thread = await this.getOrCreateThread(chatId);
-     await this.addMessageToThread(thread.id, context, false); // include images
+     await this.addMessageToThread(thread.id, context);
      return await this.runAssistant(thread.id, assistantId);

    } catch (error) {
      logger.error(`Error generating response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Uploads an image URL to OpenAI Files (purpose "assistants") and returns the file_id
   * @param {string} imageUrl
   * @returns {Promise<string>}
   */
  async uploadImageFile(imageUrl) {
    // download the image as a blob
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Download failed: ${resp.statusText}`);z
    const blob = await resp.blob();

    // prepare the form
    const form = new FormData();
    form.append('file', blob, 'image.jpg');
    form.append('purpose', 'assistants');

    // upload to OpenAI
    const upload = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: form
    });
    if (!upload.ok) {
      const err = await upload.text();
      throw new Error(`Upload failed: ${err}`);
    }
    const body = await upload.json();
    return body.id;
  }

  /**
   * Add a message with context to a thread
   * @param {string} threadId - Thread ID
   * @param {Object} context - Context including messages and product details
   */
  async addMessageToThread(threadId, context) {
    try {
      // Always wait for message preparation (includes images)
      const messageContent = context.preparedMessages || await this.prepareMessageContent(context);
      
      // Make sure we have a valid threadId
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
        
        // Skip system messages as they cannot be added directly
        if (msg.role === 'system') {
          continue;
        }
        
        // Make sure the message format is valid (especially the content array)
        if (!Array.isArray(msg.content) || msg.content.length === 0) {
          logger.warn(`Message #${i+1} has invalid content structure. Skipping.`);
          continue;
        }
        
        // ---- Automatic image upload handling ----
        // Verify that skipImages (the function parameter) is defined and boolean.
        // If skipImages is true, the image will not be attempted to be uploaded.
        const shouldProcessImage = (typeof skipImages === 'boolean' ? !skipImages : true);

        if (shouldProcessImage && msg.content[0].type === 'image_url' && msg.content[0].image_url && msg.content[0].image_url.url) {
          try {
            const url = msg.content[0].image_url.url;
            logger.debug(`Attempting to upload image: ${url}`);
            const fileId = await this.uploadImageFile(url);
            await this.client.beta.threads.messages.create(threadId, {
              role: msg.role,
              content: [{ type: "image_file", image_file: { file_id: fileId } }]
            });
            logger.debug(`Image uploaded and sent as file ${fileId} for message #${i+1}`);
            continue; // Move to the next message
          } catch (uploadError) {
            logger.error(`Image upload error for message #${i+1} (URL: ${msg.content[0].image_url.url}): ${uploadError.message}. Sending as URL if possible or skipping image content.`);
            // If the upload fails, it will be attempted to be sent as image_url or it will be omitted if the content is only the failed image.
            // If the original message had text + image, and the image fails to upload,
            // here you could decide to send only the text or the original message with image_url.
            // For simplicity, if the upload fails, the original message (which could be image_url) will be sent.
            // If `prepareMessageContent` has already removed the image because `skipImages` was true, msg.content will not have the image.
          }
        }

        // Normal sending for text or fallback
        try {
          await this.client.beta.threads.messages.create(
            threadId,
            {
              role: msg.role,
              content: msg.content // This content should already be prepared according to skipImages
            }
          );
          logger.debug(`Added message #${i+1} with role ${msg.role} to thread ${threadId}`);
        } catch (msgError) {
          logger.error(`Error adding message #${i+1} to thread ${threadId}: ${msgError.message}`, { messageData: msg });
          throw msgError; // Rethrow the error so it can be caught by generateResponse if necessary
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error in addMessageToThread (threadId: ${threadId}): ${error.message}`);
      throw error; // Rethrow the error so generateResponse can handle it
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
   * @param {string} role - 'seller' or 'buyer'
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