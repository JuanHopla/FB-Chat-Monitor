/**
 * OpenAI API Client
 *
 * Handles all calls to the OpenAI API in a centralized manner.
 * Provides methods to access endpoints such as threads, messages, and assistants.
 */
class OpenAIApiClient {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.betaHeader = 'assistants=v2';
  }

  /**
   * Sets or updates the API key
   * @param {string} apiKey - The OpenAI API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Creates the basic headers for all requests
   * @param {boolean} includeBeta - Whether to include the beta header for Assistants
   * @returns {Object} Headers for the request
   * @private
   */
  _createHeaders(includeBeta = false) {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (includeBeta) {
      headers['OpenAI-Beta'] = this.betaHeader;
    }

    return headers;
  }

  /**
   * Makes a request to the OpenAI API
   * @param {string} endpoint - Relative endpoint (without the baseUrl)
   * @param {Object} options - Options for fetch
   * @returns {Promise<Object>} - API response
   * @private
   */
  async _fetchWithErrorHandling(endpoint, options) {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || response.statusText;
        } catch (e) {
          errorMessage = response.statusText;
        }
        throw new Error(`Error in request to ${endpoint}: ${errorMessage} (${response.status})`);
      }

      return await response.json();
    } catch (error) {
      // Capture network and other errors
      if (!error.message.includes('Error in request')) {
        error.message = `Error communicating with ${endpoint}: ${error.message}`;
      }
      throw error;
    }
  }

  /**
   * Validates the API key by consulting the list of models
   * @returns {Promise<boolean>} true if the API key is valid
   */
  async validateApiKey() {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this._createHeaders(false)
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
      logger.error(`Error validating API key: ${error.message}`);
      return false;
    }
  }

  // ====== THREADS API ======

  /**
   * Creates a new thread
   * @returns {Promise<Object>} Data of the created thread
   */
  async createThread() {
    return this._fetchWithErrorHandling('/threads', {
      method: 'POST',
      headers: this._createHeaders(true),
      body: JSON.stringify({})
    });
  }

  /**
   * Adds a message to a thread
   * @param {string} threadId - ID of the thread
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} API Response
   */
  async addMessage(threadId, messageData) {
    return this._fetchWithErrorHandling(`/threads/${threadId}/messages`, {
      method: 'POST',
      headers: this._createHeaders(true),
      body: JSON.stringify(messageData)
    });
  }

  /**
   * Lists the messages of a thread
   * @param {string} threadId - ID of the thread
   * @param {Object} options - Query options (limit, order, etc)
   * @returns {Promise<Object>} List of messages
   */
  async listMessages(threadId, options = {}) {
    const queryParams = new URLSearchParams(options).toString();
    const endpoint = `/threads/${threadId}/messages${queryParams ? `?${queryParams}` : ''}`;

    return this._fetchWithErrorHandling(endpoint, {
      method: 'GET',
      headers: this._createHeaders(true)
    });
  }

  // ====== ASSISTANTS API ======

  /**
   * Creates or updates an assistant
   * @param {string|null} assistantId - ID of the assistant (null to create new)
   * @param {Object} assistantData - Assistant data
   * @returns {Promise<Object>} Data of the created/updated assistant
   */
  async createOrUpdateAssistant(assistantId, assistantData) {
    if (assistantId) {
      // Update (PATCH is correct for partial update according to OpenAI API)
      return this._fetchWithErrorHandling(`/assistants/${assistantId}`, {
        method: 'PATCH', // Corrected: POST to PATCH
        headers: this._createHeaders(true),
        body: JSON.stringify(assistantData)
      });
    } else {
      // Create new
      return this._fetchWithErrorHandling('/assistants', {
        method: 'POST',
        headers: this._createHeaders(true),
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
    return this._fetchWithErrorHandling(`/assistants/${assistantId}`, {
      method: 'GET',
      headers: this._createHeaders(true)
    });
  }

  /**
   * Lists all available assistants
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} List of assistants
   */
  async listAssistants(options = {}) {
    const queryParams = new URLSearchParams(options).toString();
    const endpoint = `/assistants${queryParams ? `?${queryParams}` : ''}`;

    return this._fetchWithErrorHandling(endpoint, {
      method: 'GET',
      headers: this._createHeaders(true)
    });
  }

  // ====== RUNS API ======

  /**
   * Creates a new run of an assistant in a thread
   * @param {string} threadId - ID of the thread
   * @param {Object} runData - Data for the run
   * @returns {Promise<Object>} Data of the created run
   */
  async createRun(threadId, runData) {
    return this._fetchWithErrorHandling(`/threads/${threadId}/runs`, {
      method: 'POST',
      headers: this._createHeaders(true),
      body: JSON.stringify(runData)
    });
  }

  /**
   * Gets the status of a run
   * @param {string} threadId - ID of the thread
   * @param {string} runId - ID of the run
   * @returns {Promise<Object>} Run status
   */
  async getRun(threadId, runId) {
    return this._fetchWithErrorHandling(`/threads/${threadId}/runs/${runId}`, {
      method: 'GET',
      headers: this._createHeaders(true)
    });
  }

  // ====== FILES API ======

  /**
   * Checks if an image URL is accessible
   * @param {string} url - Image URL
   * @returns {Promise<boolean>} - true if the image is accessible
   */
  async isImageAccessible(url) {
    // Use the centralized filter
    if (window.ImageFilterUtils) {
      return await window.ImageFilterUtils.isImageAccessible(url);
    }

    // Original code as fallback
    try {
      // Some Facebook URLs may have access restrictions
      const isFacebookUrl = url.includes('fbcdn.net') ||
                           url.includes('facebook.com') ||
                           url.includes('fbsbx.com');

      // Shorter timeout for Facebook URLs
      const timeout = isFacebookUrl ? 3000 : 5000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // To avoid CORS issues with Facebook
        mode: 'no-cors'
      });

      clearTimeout(timeoutId);

      // If it's 'opaque' due to no-cors but there was no error, we consider it accessible
      return response.type === 'opaque' || response.ok;
    } catch (error) {
      logger.debug(`Image not accessible at ${url}: ${error.message}`);
      return false;
    }
  }

  /**
   * Uploads an image file to OpenAI (for Assistants)
   * @param {string|Blob} imageInput - URL or Blob of the image
   * @param {string} filename - File name
   * @returns {Promise<Object>} Uploaded file data
   */
  async uploadFile(imageInput, filename = 'image.jpg') {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    let blob;

    // If it's a URL, try to download it first
    if (typeof imageInput === 'string') {
      try {
        // Use centralized filter if available
        if (window.ImageFilterUtils && window.ImageFilterUtils.isProblematicFacebookImage(imageInput)) {
          throw new Error(`Image rejected by the centralized filter: ${imageInput}`);
        }
        
        // If not, use normal verification
        // Check if it's a Facebook URL with size patterns
        if (imageInput.includes('fbcdn.net') || imageInput.includes('facebook.com')) {
          // Verify it's accessible before even trying
          const isAccessible = await this.isImageAccessible(imageInput);
          if (!isAccessible) {
            throw new Error(`Facebook image URL not accessible or filtered: ${imageInput}`);
          }
        }

        // Attempt download with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds max

        const response = await fetch(imageInput, {
          signal: controller.signal,
          // For Facebook URLs that might require cookies
          credentials: 'omit'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Download error: ${response.status} ${response.statusText}`);
        }

        blob = await response.blob();
      } catch (error) {
        // Specific error for Facebook images that is more user-friendly
        if (imageInput.includes('fbcdn.net') || imageInput.includes('facebook.com')) {
          throw new Error(`Could not access Facebook image: ${error.message}`);
        } else {
          throw new Error(`Error downloading image: ${error.message}`);
        }
      }
    } else if (imageInput instanceof Blob) {
      blob = imageInput;
    } else {
      throw new Error('Invalid input format for uploadFile');
    }

    const form = new FormData();
    form.append('file', blob, filename);
    form.append('purpose', 'assistants');

    try {
      const response = await fetch(`${this.baseUrl}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: form
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error uploading file: ${errText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`Error uploading file: ${error.message}`);
      throw error;
    }
  }
}

// Export the class so it is available
window.OpenAIApiClient = OpenAIApiClient;
