/**
 * API Client for OpenAI - "The Communicator"
 * 
 * Responsibilities:
 * - Handle all direct communications with OpenAI API
 * - Manage authentication with API key
 * - Implement methods for thread, message, and run operations
 * - Handle error cases and retries
 * - Transcribe audio via Whisper API
 */

class ApiClient {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://api.openai.com/v1';
    this.model = 'gpt-4o';
    this.maxRetries = 3;
    this.initialRetryDelay = 1000;
    this.initialized = false;
    // Updated: v2 version of the Assistants API header
    this.betaHeader = 'assistants=v2';
  }

  /**
   * Initializes the API client with key and model
   * @param {string} apiKey - OpenAI API key
   * @param {string} model - Model name (optional)
   * @returns {boolean} Success status
   */
  initialize(apiKey, model = null) {
    if (!apiKey) {
      logger.error('API key is required for initialization');
      return false;
    }

    this.apiKey = apiKey;
    
    if (model) {
      this.model = model;
    } else if (window.CONFIG?.AI?.model) {
      this.model = window.CONFIG.AI.model;
    }

    this.initialized = true;
    console.log('ApiClient initialized successfully');
    return true;
  }

  /**
   * Sets the API key
   * @param {string} apiKey - OpenAI API key
   */
  setApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      logger.error('Invalid API key');
      return false;
    }

    this.apiKey = apiKey;
    this.initialized = true;
    return true;
  }

  /**
   * Creates a new thread in OpenAI
   * @returns {Promise<{id: string}>} Created thread info
   */
  async createThread() {
    try {
      console.log('Creating new thread');
      
      const response = await this.makeRequest('/threads', {
        method: 'POST',
        body: JSON.stringify({})
      });

      console.log(`Thread created successfully: ${response.id}`);
      return { id: response.id };
    } catch (error) {
      logger.error(`Error creating thread: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Adds a message to a thread
   * @param {string} threadId - OpenAI thread ID
   * @param {Object} message - Message to add
   * @returns {Promise<Object>} Added message details
   */
  async addMessage(threadId, message) {
    // Convert single message to array
    const messageArray = Array.isArray(message) ? message : [message];
    
    // Process each message separately
    const results = [];
    for (const msg of messageArray) {
      // Check if it's a simple object or one with OpenAI structure
      const messageBody = msg.role ? msg : {
        role: msg.sentByUs ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content.text
      };
      
      const response = await this.makeRequest(`/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageBody)
      });
      
      results.push(response);
    }
    
    return results.length === 1 ? results[0] : results;
  }

  /**
   * Creates a run on a thread with a specific assistant
   * @param {string} threadId - OpenAI thread ID
   * @param {string} assistantId - Assistant ID to use
   * @returns {Promise<{runId: string}>} Run information
   */
  async createRun(threadId, assistantId) {
    try {
      if (!assistantId) {
        throw new Error('No assistant ID provided');
      }

      console.log(`Creating run on thread ${threadId.substring(0, 8)}... with assistant ${assistantId.substring(0, 8)}...`);
      
      const response = await this.makeRequest(`/threads/${threadId}/runs`, {
        method: 'POST',
        body: JSON.stringify({
          assistant_id: assistantId
        })
      });

      console.log(`Run created successfully: ${response.id}`);
      return { runId: response.id };
    } catch (error) {
      logger.error(`Error creating run: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Gets the current status of a run
   * @param {string} threadId - OpenAI thread ID
   * @param {string} runId - Run ID to check
   * @returns {Promise<{status: string, output: any}>} Status information
   */
  async getRunStatus(threadId, runId) {
    try {
      const response = await this.makeRequest(`/threads/${threadId}/runs/${runId}`);
      
      // If the run is completed, get the messages
      if (response.status === 'completed') {
        console.log(`Run ${runId.substring(0, 8)}... completed, retrieving messages`);
        const messages = await this.getLatestMessages(threadId);
        
        return {
          status: response.status,
          output: messages
        };
      }
      
      // If failed, provide error details
      if (response.status === 'failed') {
        logger.error(`Run failed: ${response.last_error?.code} - ${response.last_error?.message}`);
        return {
          status: response.status,
          error: response.last_error,
          output: null
        };
      }
      
      // For in-progress runs
      return {
        status: response.status,
        output: null
      };
    } catch (error) {
      logger.error(`Error getting run status: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Gets the latest messages from a thread
   * @param {string} threadId - OpenAI thread ID
   * @param {number} limit - Maximum number of messages to return
   * @returns {Promise<Array>} List of messages
   */
  async getLatestMessages(threadId, limit = 5) {
    try {
      const response = await this.makeRequest(`/threads/${threadId}/messages?limit=${limit}`);
      return response.data || [];
    } catch (error) {
      logger.error(`Error getting messages: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Waits for a run to complete, polling at specified intervals
   * @param {string} threadId - OpenAI thread ID
   * @param {string} runId - Run ID to check
   * @param {number} maxWaitTime - Maximum time to wait (ms)
   * @param {number} pollInterval - Polling interval (ms)
   * @returns {Promise<{status: string, output: any}>} Final status
   */
  async waitForRunCompletion(threadId, runId, maxWaitTime = 60000, pollInterval = 1000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const runStatus = await this.getRunStatus(threadId, runId);
      
      // Return immediately if completed or failed
      if (runStatus.status === 'completed' || runStatus.status === 'failed') {
        return runStatus;
      }
      
      // Log progress for long-running operations
      if ((Date.now() - startTime) > 5000 && (Date.now() - startTime) % 5000 < pollInterval) {
        console.log(`Still waiting for run ${runId.substring(0, 8)}... (${runStatus.status}): ${Math.round((Date.now() - startTime)/1000)}s elapsed`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    logger.warn(`Run ${runId.substring(0, 8)}... did not complete within the timeout period`);
    return { status: 'timeout', output: null };
  }

  /**
   * Transcribes audio to text using Whisper API
   * @param {Blob} audioBlob - Audio blob data
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioBlob) {
    try {
      if (!audioBlob || !(audioBlob instanceof Blob)) {
        throw new Error('Invalid audio blob');
      }
      
      console.log(`Transcribing audio (${Math.round(audioBlob.size / 1024)} KB)`);
      
      // Create a FormData instance for file upload
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');
      
      // Use fetch directly for FormData compatibility
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Transcription failed: ${response.status} ${errorText}`);
      }
      
      // Whisper API returns plain text when response_format is set to 'text'
      const transcript = await response.text();
      
      console.log(`Transcription successful: ${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}`);
      return transcript;
    } catch (error) {
      logger.error(`Error transcribing audio: ${error.message}`, {}, error);
      throw error;
    }
  }

  /**
   * Lists all available assistants
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} List of assistants
   */
  async listAssistants(options = {}) {
    const queryParams = new URLSearchParams(options).toString();
    const endpoint = `/assistants${queryParams ? `?${queryParams}` : ''}`;

    return await this.makeRequest(endpoint, {
      method: 'GET',
      headers: {
        'OpenAI-Beta': this.betaHeader,
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Creates or updates an assistant
   * @param {string|null} assistantId - ID of the assistant (null to create new)
   * @param {Object} assistantData - Assistant data
   * @returns {Promise<Object>} Data of the created/updated assistant
   */
  async createOrUpdateAssistant(assistantId, assistantData) {
    if (assistantId) {
      // Update (PATCH is correct for partial update according to OpenAI API)
      return await this.makeRequest(`/assistants/${assistantId}`, {
        method: 'PATCH',
        headers: {
          'OpenAI-Beta': this.betaHeader,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assistantData)
      });
    } else {
      // Create new
      return await this.makeRequest('/assistants', {
        method: 'POST',
        headers: {
          'OpenAI-Beta': this.betaHeader,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assistantData)
      });
    }
  }

  /**
   * Gets assistant information
   * @param {string} assistantId - ID of the assistant
   * @returns {Promise<Object>} Assistant data
   */
  async getAssistant(assistantId) {
    return await this.makeRequest(`/assistants/${assistantId}`, {
      method: 'GET',
      headers: {
        'OpenAI-Beta': this.betaHeader,
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Makes a request to the OpenAI API with retry logic
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   * @private
   */
  async makeRequest(endpoint, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        // Updated: v2 version of the Assistants API header
        'OpenAI-Beta': 'assistants=v2',
        ...options.headers
      },
      ...options
    };

    let retries = 0;
    let lastError = null;

    while (retries <= this.maxRetries) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, requestOptions);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
          
          // Handle specific error cases
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after') || Math.pow(2, retries) * this.initialRetryDelay;
            logger.warn(`Rate limited by OpenAI (429). Retrying after ${retryAfter}ms`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            retries++;
            continue;
          }
          
          // Handle authentication errors
          if (response.status === 401) {
            throw new Error('Authentication failed: Invalid API key');
          }
          
          // Generic error
          throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        lastError = error;
        
        // Don't retry for authentication errors
        if (error.message.includes('Invalid API key')) {
          throw error;
        }
        
        // For network errors, retry after delay
        if (retries < this.maxRetries && 
            (error.name === 'TypeError' || error.message.includes('network') || error.message.includes('failed'))) {
          const delay = Math.pow(2, retries) * this.initialRetryDelay;
          logger.warn(`Request failed, retrying (${retries+1}/${this.maxRetries+1}) after ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        }
        
        // For other errors or when retries are exhausted, throw
        throw error;
      }
    }
    
    throw lastError || new Error('Request failed after retries');
  }
}

// Create global singleton instance
const apiClient = new ApiClient();

// Expose globally
window.apiClient = apiClient;
