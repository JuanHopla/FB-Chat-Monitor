/**
 * AudioTranscriber - Optimized system for audio detection and transcription
 * Integrated with central system components
 *
 * Responsibilities:
 * - Detect audio in the DOM and extract its URLs
 * - Manage cached transcriptions
 * - Process transcriptions in parallel
 * - Provide access to already completed transcriptions
 */
class AudioTranscriber {
  constructor() {
    // --- CONFIGURATION ---
    this.DEBUG_MODE = true;
    this.POLLING_INTERVAL_MS = 5000; // Check every 5 seconds
    this.CLICK_ASSOCIATION_WINDOW_MS = 5000; // Time window to associate by click
    this.pollingInterval = null;

    // --- Selectors (For UI and context) ---
    this.CHAT_CONTAINER_SELECTOR = 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm, div[role="main"] > div > div > div:last-child';
    this.MESSAGE_WRAPPER_SELECTOR = 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div';
    this.MESSAGE_ROW_SELECTOR = 'div[role="row"]';
    this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW = 'div[aria-label="Play"][role="button"]';

    // --- Metadata and State ---
    this.processedMediaUrls = new Set(); // Already processed URLs (cleanUrl)
    this.pendingTranscriptions = new Map(); // cleanUrl -> {status, timestamp, messageId}
    this.completedTranscriptions = new Map(); // cleanUrl -> {text, timestamp, messageId}
    this.audioUrlsToMessages = new Map(); // cleanUrl -> messageId
    this.messageIdsToAudioUrls = new Map(); // messageId -> cleanUrl
    this.messageIdToTimestamp = new Map(); // messageId -> timestamp
    this.listenerAttached = new Set(); // Elements with listeners
    this.transcriptionLogs = [];

    // State for click-based association
    this.expectingAudioForMessageId = null;
    this.expectingAudioTimestamp = 0;

    this.observer = null;
    this.initialized = false;
  }

  /**
   * Initializes the transcription system
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Use logManager to register initialization phase
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, 'Initializing AudioTranscriber');

      // Load cached transcriptions from localStorage
      this.loadCache();

      // Start observer to detect new audio files
      this.setupObserver();

      // Start periodic polling
      window.logManager.step(
        window.logManager.phases.RESOURCE_DETECTION,
        'POLLING_START',
        `Starting audio resource detection every ${this.POLLING_INTERVAL_MS}ms`
      );

      this.pollingInterval = setInterval(() => this.checkForAudioResources(), this.POLLING_INTERVAL_MS);

      // Initial scan
      this.checkForAudioResources();

      // Integration with ScrollManager - subscribe to events
      if (window.scrollManager) {
        window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'INTEGRATION', 'Integrating with ScrollManager');
        window.scrollManager.on('afterScroll', (data) => {
          // Detect audio after each scroll
          this.checkForAudioResources();
        });
      }

      // Integration with EventCoordinator
      if (window.eventCoordinator) {
        window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'INTEGRATION', 'Integrating with EventCoordinator');

        // Subscribe to the chatHistoryExtracted event to receive time blocks
        window.eventCoordinator.on('chatHistoryExtracted', async (data) => {
          if (data && data.messages) {
            window.logManager.step(
              window.logManager.phases.ASSOCIATION,
              'HISTORY_RECEIVED',
              `Received history with ${data.messages.length} messages and ${data.timeBlocks?.length || 0} time blocks`
            );

            // Associate transcriptions using the time blocks
            await this.associateTranscriptionsWithMessagesFIFO(data);
          }
        });
      }

      this.initialized = true;
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, 'AudioTranscriber initialized successfully');
      return true;
    } catch (error) {
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, `Error initializing AudioTranscriber: ${error.message}`);
      return false;
    }
  }

  /**
   * Sets up a MutationObserver to detect new audio files
   * @private
   */
  setupObserver() {
    // First find the message container
    const messageWrapper = document.querySelector(this.MESSAGE_WRAPPER_SELECTOR);

    if (!messageWrapper) {
      window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'OBSERVER', 'Message container not found, retrying later');
      // Try again later
      setTimeout(() => this.setupObserver(), 2000);
      return;
    }

    window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'OBSERVER', 'Observer activated for new messages');

    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            this.processNode(node);
          });
        }
      }
    });

    // Observe changes in the message container
    this.observer.observe(messageWrapper, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Processes a DOM node to search for audio buttons
   * @param {Node} node - The node to process
   */
  processNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // Ensure the node is an element before using querySelectorAll
    if (typeof node.querySelectorAll !== 'function') return;

    // Search for audio play buttons
    node.querySelectorAll(this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW).forEach(playButton => {
      // Check if a listener has already been added
      if (this.listenerAttached.has(playButton)) return;

      // Get messageRow
      const messageRow = playButton.closest(this.MESSAGE_ROW_SELECTOR);
      if (!messageRow) return;

      // If the messageRow doesn't have an ID, generate one
      let messageId = messageRow.dataset.messageId;
      if (!messageId) {
        messageId = this.generateMessageId(messageRow);
        messageRow.dataset.messageId = messageId;
        this.debugLog(`Observer: ID assigned: ${messageId}. Timestamp generated: ${Date.now()}`);
      }

      // Add listener to the audio button
      this.debugLog(`Observer: Adding listener to audio button ${messageId}.`);
      playButton.addEventListener('click', this.handleAudioPlayClick.bind(this));
      this.listenerAttached.add(playButton);
    });
  }

  /**
   * Handles the click on an audio play button
   * @param {Event} event - The click event
   */
  handleAudioPlayClick(event) {
    const audioElement = event.currentTarget;
    const messageRow = audioElement.closest(this.MESSAGE_ROW_SELECTOR);
    if (!messageRow) return;

    let messageId = messageRow.dataset.messageId;
    let timestamp = null;

    if (messageId) {
      // Extract timestamp from messageId if available
      timestamp = this.extractTimestampFromId(messageId);
    } else {
      // Generate an ID if it doesn't exist
      messageId = this.generateMessageId(messageRow);
      messageRow.dataset.messageId = messageId;
      timestamp = Date.now(); // Use current timestamp
    }

    // If timestamp couldn't be obtained from existing or generated ID, use Date.now()
    if (messageId && !this.messageIdToTimestamp.has(messageId)) {
      this.messageIdToTimestamp.set(messageId, timestamp || Date.now());
    }

    // Register audio click event with logManager
    window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'AUDIO_CLICK',
      `User clicked on audio, messageId: ${messageId}`, { messageId, timestamp });

    // Check if it already has an associated URL
    const cleanUrl = this.messageIdsToAudioUrls.get(messageId);
    if (cleanUrl) {
      // We already have the associated URL, show transcription if available
      if (this.completedTranscriptions.has(cleanUrl)) {
        const transcription = this.completedTranscriptions.get(cleanUrl);
        window.logManager.step(window.logManager.phases.TRANSCRIPTION, 'CACHE_HIT',
          `Transcription retrieved from cache for ${messageId}`,
          { messageId, audioUrl: cleanUrl, text: transcription.text.substring(0, 50) });

        // Notify via EventCoordinator
        if (window.eventCoordinator) {
          window.eventCoordinator.emit('audioTranscriptionRetrieved', {
            messageId,
            audioUrl: cleanUrl,
            transcription: transcription.text
          });
        }
      }
    } else {
      // Save audio expectation to associate with the next detected URL
      this.expectingAudioForMessageId = messageId;
      this.expectingAudioTimestamp = Date.now();

      window.logManager.step(window.logManager.phases.ASSOCIATION, 'EXPECTING',
        `Waiting for audio detection for message ${messageId}`);

      // Force an immediate check
      this.checkForAudioResources();
    }
  }

  /**
   * Generates a unique ID for a message
   * @param {Element} element - Message element
   * @returns {string} Generated ID
   */
  generateMessageId(element) {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 10);
    const textContent = element.textContent?.trim().substring(0, 20) || '';
    const cleanText = textContent.replace(/[^a-zA-Z0-9]/g, '_');

    return `msg_${randomPart}_${cleanText}_${timestamp}`;
  }

  /**
   * Extracts a timestamp from a message ID
   * @param {string} messageId - The message ID
   * @returns {number|null} Extracted timestamp or null
   */
  extractTimestampFromId(messageId) {
    if (!messageId || typeof messageId !== 'string') return null;

    // Search for common patterns in message IDs
    // 1. Pattern msg_XXXX_TIMESTAMP
    const endMatch = messageId.match(/_(\d{13,})$/);
    if (endMatch && endMatch[1]) {
      const timestamp = parseInt(endMatch[1], 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    // 2. Pattern msg_THREADID_MESSAGENUMBER
    const parts = messageId.split('_');
    if (parts.length >= 3) {
      const potentialTimestamp = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(potentialTimestamp) && potentialTimestamp > 0) {
        return potentialTimestamp;
      }
    }

    return null;
  }

  /**
   * Extracts timestamp from an audio URL
   * @param {string} url - Audio URL
   * @returns {number|null} Extracted timestamp or null
   */
  extractTimestampFromAudioUrl(url) {
    if (!url || typeof url !== 'string') return null;

    // Pattern for audioclip-TIMESTAMP-XXXX.mp4
    const match = url.match(/audioclip-(\d+)/);
    if (match && match[1]) {
      const timestamp = parseInt(match[1], 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    return null;
  }

  /**
   * Scans the DOM for audio elements and uses the Performance API
   * @returns {number} Number of new audio files found
   */
  checkForAudioResources() {
    // 1. Search for audio elements in the DOM
    const audioElements = document.querySelectorAll('audio[src]');
    const domAudioCount = audioElements.length;

    // 2. Search for audio using the Performance API
    const performanceUrls = this.detectAudioUrlsWithPerformanceAPI();
    const perfAudioCount = performanceUrls.length;

    let newAudiosFound = 0;
    const newAudioUrls = [];

    // Process DOM audio elements
    audioElements.forEach(audioEl => {
      const audioUrl = audioEl.src;
      if (!audioUrl || this.processedMediaUrls.has(audioUrl)) return;

      const row = audioEl.closest(this.MESSAGE_ROW_SELECTOR);
      const messageId = row?.dataset?.messageId || null;

      this.processedMediaUrls.add(audioUrl);
      newAudiosFound++;
      newAudioUrls.push(audioUrl);

      // Collect data for later analysis
      window.logManager.collect('audios', {
        url: audioUrl,
        urlTimestamp: this.extractTimestampFromAudioUrl(audioUrl),
        detectionSource: 'DOM',
        messageId: messageId,
        timestamp: Date.now()
      });

      // Process immediately
      if (!this.pendingTranscriptions.has(audioUrl) &&
        !this.completedTranscriptions.has(audioUrl)) {
        this.processAudioUrl(audioUrl, messageId);
      }
    });

    // Process Performance API audio
    performanceUrls.forEach(audioUrl => {
      const cleanUrl = audioUrl.split('?')[0];
      if (this.processedMediaUrls.has(cleanUrl)) return;

      this.processedMediaUrls.add(cleanUrl);
      newAudiosFound++;
      newAudioUrls.push(audioUrl);

      // Collect data for analysis
      window.logManager.collect('audios', {
        url: audioUrl,
        urlTimestamp: this.extractTimestampFromAudioUrl(audioUrl),
        detectionSource: 'PerformanceAPI',
        timestamp: Date.now()
      });

      let messageIdToUse = null;
      if (this.expectingAudioForMessageId &&
        (Date.now() - this.expectingAudioTimestamp) < this.CLICK_ASSOCIATION_WINDOW_MS) {
        messageIdToUse = this.expectingAudioForMessageId;
        this.audioUrlsToMessages.set(cleanUrl, messageIdToUse);
        this.messageIdsToAudioUrls.set(messageIdToUse, cleanUrl);

        window.logManager.step(window.logManager.phases.ASSOCIATION, 'AUTO_ASSIGN',
          `Associating newly detected audio with waiting message: ${messageIdToUse}`,
          { audioUrl: cleanUrl, messageId: messageIdToUse });

        this.expectingAudioForMessageId = null;
        this.expectingAudioTimestamp = 0;
      }

      if (!this.pendingTranscriptions.has(cleanUrl) &&
        !this.completedTranscriptions.has(cleanUrl)) {
        this.processAudioUrl(audioUrl, messageIdToUse);
      }
    });

    // Only log if new audio files are found
    if (newAudiosFound > 0) {
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION,
        `Found ${newAudiosFound} new audio file(s) (DOM: ${domAudioCount}, PerfAPI: ${perfAudioCount})`,
        { newUrls: newAudioUrls });

      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioResourcesFound', {
          count: newAudiosFound,
          urls: newAudioUrls
        });
      }
    }

    return newAudiosFound;
  }

  /**
   * Detects audio URLs using the Performance API
   * @returns {Array<string>} Found audio URLs
   */
  detectAudioUrlsWithPerformanceAPI() {
    if (!window.performance || !window.performance.getEntriesByType) return [];

    try {
      // Get resource entries (network)
      const resources = window.performance.getEntriesByType('resource') || [];

      // Filter audio URLs - IMPORTANT: DO NOT remove query parameters here
      return resources
        .map(entry => entry.name)
        .filter(url => this.isAudioUrl(url));
    } catch (error) {
      this.debugLog(`Error accessing Performance API: ${error.message}`);
      return [];
    }
  }

  /**
   * Checks if a URL corresponds to a valid audio file and not a video
   * @param {string} url - URL to check
   * @returns {boolean} True if the URL corresponds to an audio file
   */
  isAudioUrl(url) {
    if (!url) return false;

    // Specific pattern for voice audio clips on Facebook
    const voiceClipPattern = /\/audioclip-\d+.*?\.(mp4|m4a|aac|wav|ogg|opus)/i;

    // If it's a voice clip, it's definitely audio
    if (voiceClipPattern.test(url)) {
      return true;
    }

    // NEW: Explicitly exclude URLs that appear to be videos
    const videoPattern = /\/t42\.3356-2\/|\/video-\d+|\/video_redirect/i;
    if (videoPattern.test(url)) {
      //this.debugLog(`URL detected as video, ignoring: ${url}`);
      return false;
    }

    // For other cases, check the extension
    const genericAudioPattern = /\.(m4a|aac|wav|ogg|opus)(?:\?|$)/i;
    return genericAudioPattern.test(url);
  }

  /**
   * Processes an audio URL: downloads and transcribes
   * @param {string} audioUrl - The audio URL
   * @param {string|null} messageId - The associated message ID
   * @returns {Promise<string|null>} Transcription or null if it fails
   */
  async processAudioUrl(audioUrl, messageId = null) {
    // We use the full URL for download
    // But generate a clean ID for internal mapping
    const cleanUrl = audioUrl.split('?')[0];

    // Create a log entry for this transcription
    const logEntry = {
      audioUrl: cleanUrl.split('/').pop(), // Extract only filename for clarity
      messageId: messageId,
      startTime: Date.now(),
      steps: []
    };

    if (this.pendingTranscriptions.has(cleanUrl) || this.completedTranscriptions.has(cleanUrl)) {
      logEntry.status = 'skipped';
      logEntry.reason = 'already_processed';
      this.transcriptionLogs.push(logEntry);

      return this.getTranscription(cleanUrl);
    }

    // Register as pending using the cleanUrl for internal mapping
    this.pendingTranscriptions.set(cleanUrl, {
      status: 'pending',
      timestamp: Date.now(),
      messageId
    });

    logEntry.steps.push({ name: 'start', time: Date.now() });

    try {
      // Download
      logEntry.steps.push({ name: 'download_start', time: Date.now() });
      const audioBlob = await this.getAudioBlob(audioUrl);
      if (!audioBlob) throw new Error('Failed to obtain audio blob');

      const sizeKB = Math.round(audioBlob.size / 1024);
      logEntry.sizeKB = sizeKB;
      logEntry.steps.push({ name: 'download_complete', time: Date.now() });

      // Transcription API
      logEntry.steps.push({ name: 'api_call', time: Date.now() });
      let transcription;
      if (window.apiClient && typeof window.apiClient.transcribeAudio === 'function') {
        transcription = await window.apiClient.transcribeAudio(audioBlob);
      } else {
        transcription = await this.transcribeAudio(audioBlob);
      }
      if (!transcription) throw new Error('Transcription failed or returned empty');

      logEntry.steps.push({ name: 'api_response', time: Date.now() });
      logEntry.textLength = transcription.length;

      // Save result
      const currentEntry = this.pendingTranscriptions.get(cleanUrl);
      this.pendingTranscriptions.delete(cleanUrl);

      this.completedTranscriptions.set(cleanUrl, {
        text: transcription,
        timestamp: Date.now(),
        messageId: currentEntry?.messageId || messageId
      });

      // Associations and cache
      if (currentEntry?.messageId || messageId) {
        const assocId = currentEntry?.messageId || messageId;
        this.audioUrlsToMessages.set(cleanUrl, assocId);
        this.messageIdsToAudioUrls.set(assocId, cleanUrl);
        logEntry.associatedId = assocId;
      }
      this.saveCache();

      // Notify event coordinator
      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioTranscribed', {
          audioUrl: cleanUrl,
          messageId: currentEntry?.messageId || messageId,
          transcription
        });
      }

      // Finalize log
      logEntry.status = 'success';
      logEntry.endTime = Date.now();
      logEntry.duration = logEntry.endTime - logEntry.startTime;
      logEntry.transcription = transcription.substring(0, 50) + (transcription.length > 50 ? "..." : "");
      this.transcriptionLogs.push(logEntry);

      // Keep a minimal log for each completed transcription (this can be useful)
      console.log(`Transcription successful: ${transcription.substring(0, 50)}${transcription.length > 50 ? "..." : ""}`);

      return transcription;

    } catch (error) {
      // Error log
      logEntry.status = 'error';
      logEntry.errorMessage = error.message;
      logEntry.endTime = Date.now();
      logEntry.duration = logEntry.endTime - logEntry.startTime;
      this.transcriptionLogs.push(logEntry);

      // Keep error logs as they are important
      window.logManager.phase(
        window.logManager.phases.TRANSCRIPTION,
        'ERROR',
        `Error transcribing audio: ${error.message}`,
        { url: audioUrl }
      );
      this.pendingTranscriptions.delete(cleanUrl);
      return null;
    }
  }

  /**
   * Gets the blob of an audio file using GM_xmlhttpRequest to avoid CORS
   * @param {string} audioUrl - Full audio URL (with parameters)
   * @returns {Promise<Blob>} Audio blob
   */
  async getAudioBlob(audioUrl) {

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: audioUrl,  // Use full URL with all parameters
        responseType: 'blob',
        timeout: 45000,
        headers: { 'Range': 'bytes=0-' }, // CRUCIAL HEADER
        onload: function (response) {
          if (response.status === 200 || response.status === 206) {
            resolve(response.response);
          } else {
            reject(new Error(`Error downloading audio: ${response.status}`));
          }
        },
        onerror: function (error) {
          reject(new Error("Network error while downloading audio"));
        },
        ontimeout: function () {
          reject(new Error('Timeout expired while downloading audio'));
        }
      });
    });
  }

  /**
   * Transcribes audio using the Whisper API
   * @param {Blob} audioBlob - The audio blob
   * @returns {Promise<string>} The audio transcription
   */
  async transcribeAudio(audioBlob) {
    if (!window.apiClient || typeof window.apiClient.transcribeAudio !== 'function') {
      // Fallback implementation if ApiClient is not available
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp4');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.AI.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.text;
    } else {
      // Use ApiClient if available
      return await window.apiClient.transcribeAudio(audioBlob);
    }
  }

  /**
   * Displays a summary of accumulated transcription logs
   */
  showTranscriptionLogs() {
    if (!this.transcriptionLogs || this.transcriptionLogs.length === 0) {
      console.log('[AudioTranscriber] No transcription logs found');
      return;
    }

    // Statistics
    const successful = this.transcriptionLogs.filter(log => log.status === 'success').length;
    const failed = this.transcriptionLogs.filter(log => log.status === 'error').length;
    const skipped = this.transcriptionLogs.filter(log => log.status === 'skipped').length;
    const totalTime = this.transcriptionLogs
      .filter(log => log.duration)
      .reduce((total, log) => total + log.duration, 0);

    // Show a summary
    console.log(`[AudioTranscriber] Summary of ${this.transcriptionLogs.length} transcriptions:`);
    console.log(`- Successful: ${successful}`);
    console.log(`- Failed: ${failed}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Total time: ${totalTime}ms (average: ${Math.round(totalTime / (successful || 1))}ms per transcription)`);

    // Show details in a collapsed group
    console.groupCollapsed(`[AudioTranscriber] Transcription details (${this.transcriptionLogs.length})`);

    this.transcriptionLogs.forEach((log, index) => {
      const status = log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏭️';
      console.log(`${status} [${index + 1}/${this.transcriptionLogs.length}] ${log.audioUrl} (${log.duration || 0}ms)`);
      if (log.transcription) {
        console.log(`   "${log.transcription}"`);
      }
      if (log.errorMessage) {
        console.log(`   Error: ${log.errorMessage}`);
      }
    });

    console.groupEnd();

    // Clear the array after showing the summary to avoid duplicates
    this.transcriptionLogs = [];
  }

  /**
   * Gets a transcription from the cache
   * @param {string} audioUrl - The audio URL
   * @returns {string|null} The transcription or null if it doesn't exist
   */
  getTranscription(audioUrl) {
    const cleanUrl = audioUrl.split('?')[0];

    // Check in completed transcriptions
    if (this.completedTranscriptions.has(cleanUrl)) {
      const transcriptionData = this.completedTranscriptions.get(cleanUrl);
      return transcriptionData.text;
    }

    // If pending, return null or a placeholder
    if (this.pendingTranscriptions.has(cleanUrl)) {
      return '[Transcription Pending]';
    }

    return null;
  }

  /**
   * Saves the cache to localStorage
   * @private
   */
  saveCache() {
    try {
      // Convert Map to an object for localStorage
      const cache = {};
      this.completedTranscriptions.forEach((value, key) => {
        cache[key] = value;
      });

      localStorage.setItem('FB_CHAT_MONITOR_AUDIO_CACHE', JSON.stringify(cache));
      this.debugLog(`Cache saved: ${this.completedTranscriptions.size} transcriptions`);
    } catch (error) {
      console.error('[AudioTranscriber][ERROR] Error saving cache:', error);
    }
  }

  /**
   * Loads the cache from localStorage
   * @private
   */
  loadCache() {
    try {
      const cache = localStorage.getItem('FB_CHAT_MONITOR_AUDIO_CACHE');
      if (!cache) {
        this.debugLog('No cached transcriptions found');
        return;
      }

      const parsedCache = JSON.parse(cache);
      Object.entries(parsedCache).forEach(([key, value]) => {
        this.completedTranscriptions.set(key, value);
        this.processedMediaUrls.add(key);

        // Recover associations messageId -> audioUrl
        if (value.messageId) {
          this.audioUrlsToMessages.set(key, value.messageId);
          this.messageIdsToAudioUrls.set(value.messageId, key);
        }
      });

      this.debugLog(`Cache loaded: ${this.completedTranscriptions.size} transcriptions`);
    } catch (error) {
      console.error('[AudioTranscriber][ERROR] Error loading cache:', error);
    }
  }

  /**
   * Processes transcriptions in parallel for a set of messages
   * @param {Array} messages - Messages to process
   * @returns {Promise<Array>} Messages with transcriptions
   */
  async processMessagesTranscriptions(messageData) {
    let messages = Array.isArray(messageData) ? messageData : messageData?.messages;

    if (!messages || !Array.isArray(messages)) {
      return messageData;
    }

    // Clean incorrect video transcriptions first
    this.cleanIncorrectVideoTranscriptions(messages);

    // First, associate existing transcriptions
    await this.associateTranscriptionsWithMessagesFIFO(messageData);

    // Then, process messages that still need transcription
    const messagesToProcess = messages.filter(msg =>
      msg.content?.hasAudio &&
      msg.content.type !== "video" &&
      msg.content.audioUrl &&
      (!msg.content.transcribedAudio || msg.content.transcribedAudio === '[Transcription Pending]')
    );

    if (messagesToProcess.length === 0) {
      return messageData;
    }

    this.debugLog(`Processing transcriptions for ${messagesToProcess.length} messages`);

    // Process in parallel with a concurrency limit
    const concurrencyLimit = 3;
    const processBatch = async (batch) => {
      return Promise.all(batch.map(async (msg) => {
        try {
          const transcription = await this.processAudioUrl(msg.content.audioUrl, msg.id);
          if (transcription) {
            msg.content.transcribedAudio = transcription;
          }
        } catch (error) {
          console.error(`[AudioTranscriber][ERROR] Error processing transcription for ${msg.id}:`, error);
          msg.content.transcribedAudio = '[Transcription Failed]';
        }
        return msg;
      }));
    };

    // Split into batches to limit concurrency
    const batches = [];
    for (let i = 0; i < messagesToProcess.length; i += concurrencyLimit) {
      batches.push(messagesToProcess.slice(i, i + concurrencyLimit));
    }

    // Process batches in series to limit concurrency
    for (const batch of batches) {
      await processBatch(batch);
    }

    this.showTranscriptionLogs();

    // Update the original messages with the transcriptions
    return messages.map(msg => {
      if (msg.content?.hasAudio && msg.content.audioUrl) {
        const existingMsg = messagesToProcess.find(m => m.id === msg.id);
        if (existingMsg && existingMsg.content.transcribedAudio) {
          msg.content.transcribedAudio = existingMsg.content.transcribedAudio;
        }
      }
      return msg;
    });
  }

  /**
   * Associates transcriptions with messages based on timestamps
   * @returns {Promise<Object>} Association results
   */
  async associateTranscriptionsWithMessages() {
    console.log('[Media] Starting timestamp-based association...');

    // 1. Get messages with audio that still don't have an associated URL and have a timestamp
    const messagesToAssign = [];
    const messageWrapperElement = document.querySelector(this.MESSAGE_WRAPPER_SELECTOR);

    if (messageWrapperElement) {
      // Find all messages with audio buttons
      messageWrapperElement.querySelectorAll(`${this.MESSAGE_ROW_SELECTOR} ${this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW}`).forEach(playButton => {
        const messageRow = playButton.closest(this.MESSAGE_ROW_SELECTOR);
        if (!messageRow) return;

        const messageId = messageRow.dataset.messageId;
        if (!messageId) return;

        // Check if it already has an associated audio URL
        if (this.messageIdsToAudioUrls.has(messageId)) return;

        // Get timestamp from ID or message
        let timestamp = this.messageIdToTimestamp.get(messageId) ||
          this.extractTimestampFromId(messageId) ||
          Date.now();

        messagesToAssign.push({ messageId, timestamp, element: messageRow });
      });
    } else {
      console.log('[Media Assoc] Message container not found.');
    }

    // Sort messages by timestamp (ascending)
    messagesToAssign.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[Media Assoc] ${messagesToAssign.length} messages need assignment (sorted by timestamp).`);

    // 2. Get completed transcriptions without an assigned messageId and sort them
    const unassignedTranscriptions = Array.from(this.completedTranscriptions.entries())
      .filter(([, data]) => data.messageId === null)
      .map(([url, data]) => ({
        url,
        timestamp: data.timestamp,
        text: data.text
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[Media Assoc] ${unassignedTranscriptions.length} unassigned transcriptions (sorted by timestamp).`);

    // 3. Associate by temporal proximity
    let assignedCount = 0;
    const maxIndex = Math.min(messagesToAssign.length, unassignedTranscriptions.length);

    for (let i = 0; i < maxIndex; i++) {
      const message = messagesToAssign[i];
      const transcription = unassignedTranscriptions[i];

      // Clean URL
      const cleanUrl = transcription.url.split('?')[0];

      // Register association in all directions
      const transcriptionData = this.completedTranscriptions.get(cleanUrl);
      if (transcriptionData) {
        transcriptionData.messageId = message.messageId;
        this.completedTranscriptions.set(cleanUrl, transcriptionData);
      }

      this.audioUrlsToMessages.set(cleanUrl, message.messageId);
      this.messageIdsToAudioUrls.set(message.messageId, cleanUrl);

      console.log(`[Media Assoc] Association made: Message ${message.messageId} ↔ Audio ${cleanUrl}`);

      // Update counter
      assignedCount++;

      // Notify with EventCoordinator
      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioTranscriptionAssociated', {
          messageId: message.messageId,
          audioUrl: cleanUrl,
          transcription: transcriptionData.text
        });
      }
    }

    // Save updated cache
    if (assignedCount > 0) {
      this.saveCache();
    }

    // Emit general event for association completion
    if (window.eventCoordinator) {
      window.eventCoordinator.emit('audioTranscriptionsAssociated', {
        totalAssigned: assignedCount,
        pendingMessages: messagesToAssign.length - assignedCount,
        pendingTranscriptions: unassignedTranscriptions.length - assignedCount
      });
    }

    console.log(`[Media] Timestamp association completed. ${assignedCount} new assignments made.`);

    return {
      assigned: assignedCount,
      pendingMessages: messagesToAssign.length - assignedCount,
      pendingTranscriptions: unassignedTranscriptions.length - assignedCount
    };
  }

  /**
   * Cleans up transcriptions incorrectly assigned to videos
   * @param {Array} messages - Messages to clean
   * @returns {number} Number of cleaned messages
   */
  cleanIncorrectVideoTranscriptions(messages) {
    if (!messages || !Array.isArray(messages)) return 0;

    let cleanedCount = 0;

    // Find messages of type video that have transcriptions
    const videosWithTranscriptions = messages.filter(msg =>
      msg.content?.type === "video" &&
      msg.content.hasAudio === true &&
      msg.content.transcribedAudio &&
      msg.content.transcribedAudio !== '[Transcription Pending]'
    );

    videosWithTranscriptions.forEach(msg => {
      this.debugLog(`Cleaning incorrect transcription from video: ID=${msg.id}`);

      // Save the URL before cleaning (if it exists)
      const audioUrl = msg.content.audioUrl || null;
      const markerId = msg.content.audioMarkerId || null;

      // Clean transcription
      msg.content.transcribedAudio = null;
      msg.content.hasAudio = false; // Mark as no audio (it's a video)
      msg.content.audioMarkerId = null;
      msg.content.audioUrl = null;

      // Clean associations in maps
      if (audioUrl) {
        this.audioUrlsToMessages.delete(audioUrl.split('?')[0]);

        // Update record in completed transcriptions
        const transcription = this.completedTranscriptions.get(audioUrl.split('?')[0]);
        if (transcription) {
          transcription.messageId = null; // Release the association
          this.completedTranscriptions.set(audioUrl.split('?')[0], transcription);
        }
      }

      if (markerId) {
        this.messageIdsToAudioUrls.delete(markerId);
      }

      cleanedCount++;
    });

    if (cleanedCount > 0) {
      this.debugLog(`Cleaned ${cleanedCount} incorrect transcriptions from videos`);
      this.saveCache(); // Update the cache
    }

    return cleanedCount;
  }

  /**
   * Associates transcriptions with messages using URL timestamp sorting (FIFO)
   * @param {Object|Array} messageData - Object with messages and time blocks or an array of messages
   * @returns {Promise<Object>} Association results
   */
  async associateTranscriptionsWithMessagesFIFO(messageData) {
    // Backward compatibility and improved data extraction
    let messages = null;
    let timeBlocks = [];

    // Accumulator arrays for logs
    const associationDetails = [];
    let debugDetails = [];

    // Determine input format and extract data appropriately
    if (Array.isArray(messageData)) {
      messages = messageData;
      window.logManager.phase(window.logManager.phases.ASSOCIATION,
        `Processing direct array with ${messages.length} messages`);
    } else if (messageData && messageData.messages) {
      messages = messageData.messages;
      timeBlocks = messageData.timeBlocks || [];
      window.logManager.phase(window.logManager.phases.ASSOCIATION,
        `Processing object with ${messages.length} messages and ${timeBlocks.length} time blocks`);
    } else {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'ERROR',
        'Unrecognized messageData format', messageData);
      return { assigned: 0, remaining: 0 };
    }

    if (!messages || !Array.isArray(messages)) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'ERROR',
        'Invalid messages array', messageData);
      return { assigned: 0, remaining: 0 };
    }

    // Clean erroneous video transcriptions first
    this.cleanIncorrectVideoTranscriptions(messages);

    // Filter messages that need transcription
    const messagesToAssign = messages.filter(m =>
      m.content?.hasAudio &&
      m.content.type !== "video" &&
      (!m.content.transcribedAudio || m.content.transcribedAudio === '[Transcription Pending]')
    );

    if (messagesToAssign.length === 0) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION,
        "No messages need transcription");
      return { assigned: 0, remaining: 0 };
    }

    // NEW: Wait briefly to allow pending transcriptions to complete
    const pendingCount = this.pendingTranscriptions.size;
    if (pendingCount > 0) {
      window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT',
        `Waiting for ${pendingCount} pending transcriptions to finish...`);

      // Wait up to 5 seconds for pending transcriptions to complete
      const startTime = Date.now();
      const maxWaitTime = 5000; // 5 seconds max

      while (Date.now() - startTime < maxWaitTime && this.pendingTranscriptions.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between checks
      }

      if (this.pendingTranscriptions.size > 0) {
        window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT_INCOMPLETE',
          `After waiting, ${this.pendingTranscriptions.size} transcriptions are still pending`);
      } else {
        window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT_COMPLETE',
          `All pending transcriptions completed`);
      }
    }

    // Get unassigned transcriptions
    const unassignedTranscriptions = Array.from(this.completedTranscriptions.entries())
      .filter(([, data]) => !data.messageId)
      .map(([url, data]) => ({
        url,
        text: data.text,
        timestamp: data.timestamp,
        urlTimestamp: this.extractTimestampFromAudioUrl(url)
      }));

    if (unassignedTranscriptions.length === 0) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION,
        "No available transcriptions to assign");
      return { assigned: 0, remaining: messagesToAssign.length };
    }

    // Accumulate information instead of individual logs
    debugDetails.push(`Associating ${messagesToAssign.length} messages with ${unassignedTranscriptions.length} transcriptions`);

    if (this.DEBUG_MODE) {
      this.debugLog(`Associating ${messagesToAssign.length} messages with ${unassignedTranscriptions.length} transcriptions`);
    }

    // Sort transcriptions by timestamp extracted from URL (crucial)
    unassignedTranscriptions.sort((a, b) => {
      // Prioritize transcriptions with a timestamp extracted from the URL
      if (a.urlTimestamp && b.urlTimestamp) return a.urlTimestamp - b.urlTimestamp;
      if (a.urlTimestamp) return -1; // If only 'a' has a timestamp, place it first
      if (b.urlTimestamp) return 1;  // If only 'b' has a timestamp, place it first
      // Use creation timestamp as a fallback if no timestamp is in the URL
      return a.timestamp - b.timestamp;
    });

    debugDetails.push(`Sorted transcriptions: ${unassignedTranscriptions.map(t => t.urlTimestamp || 'no timestamp').slice(0, 5).join(', ')}${unassignedTranscriptions.length > 5 ? '...' : ''}`);

    // Sort messages by additional data that might indicate order (like ID or timestamp)
    messagesToAssign.forEach(msg => {
      if (msg.id) {
        const timestampFromId = this.extractTimestampFromId(msg.id);
        if (timestampFromId) msg._extractedTimestamp = timestampFromId;
      }

      // If timestamp data is directly on the message, use it
      if (msg.timestamp) msg._extractedTimestamp = msg.timestamp;
    });

    messagesToAssign.sort((a, b) => {
      // If both have an extracted timestamp, use it
      if (a._extractedTimestamp && b._extractedTimestamp) return a._extractedTimestamp - b._extractedTimestamp;
      // If only one has an extracted timestamp
      if (a._extractedTimestamp) return -1;
      if (b._extractedTimestamp) return 1;

      // By DOM position as a fallback (using timeBlockIndex if available)
      if (a.timeBlockIndex !== undefined && b.timeBlockIndex !== undefined)
        return a.timeBlockIndex - b.timeBlockIndex;

      // By numeric part in the ID as a last resort
      const getNumericPart = (id) => {
        if (!id) return 0;
        const matches = id.match(/(\d+)/g);
        return matches ? parseInt(matches[matches.length - 1]) : 0;
      };
      return getNumericPart(a.id) - getNumericPart(b.id);
    });

    debugDetails.push(`Sorted messages: ${messagesToAssign.map(m => m._extractedTimestamp || 'no timestamp').slice(0, 5).join(', ')}${messagesToAssign.length > 5 ? '...' : ''}`);

    // Association using the determined chronological order
    let assignedCount = 0;
    const assignedMessages = new Set();
    const assignedTranscriptions = new Set();

    debugDetails.push("Using timestamp-based association");

    // Associate messages and transcriptions in the determined order
    const assignableCount = Math.min(messagesToAssign.length, unassignedTranscriptions.length);

    debugDetails.push(`Assigning ${assignableCount} transcriptions by chronological order`);

    for (let i = 0; i < assignableCount; i++) {
      const message = messagesToAssign[i];
      const transcriptionData = unassignedTranscriptions[i];

      // Perform the association
      message.content.transcribedAudio = transcriptionData.text;

      // If the message doesn't have an audio URL, assign the one from the transcription
      if (!message.content.audioUrl) {
        message.content.audioUrl = transcriptionData.url;
      }

      // Update record in completedTranscriptions
      const cleanUrl = transcriptionData.url.split('?')[0];
      const transcriptionEntry = this.completedTranscriptions.get(cleanUrl);
      if (transcriptionEntry) {
        transcriptionEntry.messageId = message.id;
        this.completedTranscriptions.set(cleanUrl, transcriptionEntry);
      }

      // Establish bidirectional relationships
      this.audioUrlsToMessages.set(cleanUrl, message.id);
      this.messageIdsToAudioUrls.set(message.id, cleanUrl);

      // Mark as assigned
      assignedMessages.add(message.id);
      assignedTranscriptions.add(transcriptionData.url);

      assignedCount++;

      // Accumulate association details instead of individual logs
      associationDetails.push({
        messageId: message.id,
        urlTimestamp: transcriptionData.urlTimestamp,
        messageTimestamp: message._extractedTimestamp || 'N/A',
        transcriptionPreview: transcriptionData.text.substring(0, 30) + '...'
      });

      // Collect additional data for analysis in a structured format
      window.logManager.collect('associations', {
        messageId: message.id,
        text: transcriptionData.text.substring(0, 100),
        urlTimestamp: transcriptionData.urlTimestamp,
        messageTimestamp: message._extractedTimestamp,
        correlationIndex: i,
        associationType: 'timestamp-fifo'
      });
    }

    // Save updated cache
    this.saveCache();

    // Show summary of results
    window.logManager.phase(window.logManager.phases.ASSOCIATION,
      `Association completed: ${assignedCount} of ${messagesToAssign.length} messages associated`);

    // Show expandable debug details if in debug mode
    if (this.DEBUG_MODE && associationDetails.length > 0) {
      console.groupCollapsed(`[AudioTranscriber] Details of ${assignedCount} associations (expand to view)`);

      // Show accumulated debug information
      debugDetails.forEach(detail => console.log(detail));

      // Show association table
      console.table(associationDetails);
      console.groupEnd();
    }

    // Show collected data in a structured way but with error protection
    try {
      window.logManager.showCollected('associations', true);
    } catch (error) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'WARN',
        `Error showing association data: ${error.message}`);
    }

    return {
      assigned: assignedCount,
      remaining: messagesToAssign.length - assignedCount
    };
  }

  /**
   * Extracts the timestamp from an audio URL
   * @param {string} url - The audio URL
   * @returns {number|null} The extracted timestamp or null
   */
  extractTimestampFromAudioUrl(url) {
    if (!url || typeof url !== 'string') return null;

    // Pattern for audioclip-TIMESTAMP-XXXX.mp4
    const match = url.match(/audioclip-(\d+)/);
    if (match && match[1]) {
      const timestamp = parseInt(match[1], 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    return null;
  }

  /**
   * Clears the transcription state for a new chat
   * @param {string} chatId - The current chat ID
   */
  resetForNewChat(chatId) {
    // We don't delete completed transcriptions, but we mark a new context
    this.currentChatId = chatId;

    // Clear associations specific to the previous chat
    this.expectingAudioForMessageId = null;
    this.expectingAudioTimestamp = 0;

    this.debugLog(`State reset for new chat: ${chatId}`);
  }

  /**
   * Debug log with a consistent prefix and format
   * @param {string} message - The message to log
   * @private
   */
  debugLog(message) {
    if (this.DEBUG_MODE) {
      window.logManager.step('GENERAL', 'DEBUG', message);
    }
  }
}

// Create global singleton instance
const audioTranscriber = new AudioTranscriber();

// Expose globally
window.audioTranscriber = audioTranscriber;