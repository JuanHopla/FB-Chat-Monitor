/**
 * AudioTranscriber - Sistema optimizado para detección y transcripción de audio
 * Integrado con componentes del sistema central
 * 
 * Responsibilities:
 * - Detectar audio en el DOM y extraer sus URLs
 * - Gestionar transcripciones en caché
 * - Procesar transcripciones en paralelo
 * - Proporcionar acceso a transcripciones ya realizadas
 */
class AudioTranscriber {
  constructor() {
    // --- CONFIGURACIÓN ---
    this.DEBUG_MODE = true;
    this.POLLING_INTERVAL_MS = 5000; // Revisar cada 5 segundos
    this.CLICK_ASSOCIATION_WINDOW_MS = 5000; // Ventana de tiempo para asociar por clic
    this.pollingInterval = null;

    // --- Selectores (Para UI y contexto) ---
    this.CHAT_CONTAINER_SELECTOR = 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm, div[role="main"] > div > div > div:last-child';
    this.MESSAGE_WRAPPER_SELECTOR = 'div.x4k7w5x > div > div > div, div[role="main"] > div > div > div:last-child > div';
    this.MESSAGE_ROW_SELECTOR = 'div[role="row"]';
    this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW = 'div[aria-label="Play"][role="button"]';

    // --- Metadatos y Estado ---
    this.processedMediaUrls = new Set(); // URLs ya procesadas (cleanUrl)
    this.pendingTranscriptions = new Map(); // cleanUrl -> {status, timestamp, messageId}
    this.completedTranscriptions = new Map(); // cleanUrl -> {text, timestamp, messageId}
    this.audioUrlsToMessages = new Map(); // cleanUrl -> messageId
    this.messageIdsToAudioUrls = new Map(); // messageId -> cleanUrl
    this.messageIdToTimestamp = new Map(); // messageId -> timestamp
    this.listenerAttached = new Set(); // Elementos con listeners

    // Estado para asociación por clic
    this.expectingAudioForMessageId = null;
    this.expectingAudioTimestamp = 0;

    this.observer = null;
    this.initialized = false;
  }

  /**
   * Inicializa el sistema de transcripción
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Usar logManager para registrar fase de inicialización
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, 'Inicializando AudioTranscriber');

      // Cargar transcripciones en caché desde localStorage
      this.loadCache();

      // Iniciar observer para detectar nuevos audios
      this.setupObserver();

      // Iniciar polling periódico
      window.logManager.step(
        window.logManager.phases.RESOURCE_DETECTION,
        'POLLING_START',
        `Iniciando detección de recursos de audio cada ${this.POLLING_INTERVAL_MS}ms`
      );

      this.pollingInterval = setInterval(() => this.checkForAudioResources(), this.POLLING_INTERVAL_MS);

      // Escaneo inicial
      this.checkForAudioResources();

      // Integración con ScrollManager - suscribirse a eventos
      if (window.scrollManager) {
        window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'INTEGRATION', 'Integrando con ScrollManager');
        window.scrollManager.on('afterScroll', (data) => {
          // Detectar audios después de cada scroll
          this.checkForAudioResources();
        });
      }

      // Integración con EventCoordinator
      if (window.eventCoordinator) {
        window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'INTEGRATION', 'Integrando con EventCoordinator');

        // Suscribirse al evento chatHistoryExtracted para recibir los bloques temporales
        window.eventCoordinator.on('chatHistoryExtracted', async (data) => {
          if (data && data.messages) {
            window.logManager.step(
              window.logManager.phases.ASSOCIATION,
              'HISTORY_RECEIVED',
              `Recibido historial con ${data.messages.length} mensajes y ${data.timeBlocks?.length || 0} bloques temporales`
            );

            // Asociar transcripciones usando los bloques temporales
            await this.associateTranscriptionsWithMessagesFIFO(data);
          }
        });
      }

      this.initialized = true;
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, 'AudioTranscriber inicializado correctamente');
      return true;
    } catch (error) {
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION, `Error al inicializar AudioTranscriber: ${error.message}`);
      return false;
    }
  }

  /**
   * Configura un MutationObserver para detectar nuevos audios
   * @private
   */
  setupObserver() {
    // Primero encontrar el contenedor de mensajes
    const messageWrapper = document.querySelector(this.MESSAGE_WRAPPER_SELECTOR);

    if (!messageWrapper) {
      window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'OBSERVER', 'No se encontró contenedor de mensajes, reintentando más tarde');
      // Intentar más tarde
      setTimeout(() => this.setupObserver(), 2000);
      return;
    }

    window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'OBSERVER', 'Observer activado para nuevos mensajes');

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

    // Observar cambios en el contenedor de mensajes
    this.observer.observe(messageWrapper, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Procesa un nodo DOM para buscar botones de audio
   * @param {Node} node - El nodo a procesar
   */
  processNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    // Asegurarse de que el nodo es un elemento antes de usar querySelectorAll
    if (typeof node.querySelectorAll !== 'function') return;

    // Buscar botones de reproducción de audio
    node.querySelectorAll(this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW).forEach(playButton => {
      // Verificar si ya se agregó un listener
      if (this.listenerAttached.has(playButton)) return;

      // Obtener messageRow
      const messageRow = playButton.closest(this.MESSAGE_ROW_SELECTOR);
      if (!messageRow) return;

      // Si el messageRow no tiene ID, generarle uno
      let messageId = messageRow.dataset.messageId;
      if (!messageId) {
        messageId = this.generateMessageId(messageRow);
        messageRow.dataset.messageId = messageId;
        this.debugLog(`Observer: ID asignado: ${messageId}. Timestamp generado: ${Date.now()}`);
      }

      // Añadir listener al botón de audio
      this.debugLog(`Observer: Añadiendo listener a botón de audio ${messageId}.`);
      playButton.addEventListener('click', this.handleAudioPlayClick.bind(this));
      this.listenerAttached.add(playButton);
    });
  }

  /**
   * Maneja el clic en un botón de reproducción de audio
   * @param {Event} event - El evento de clic
   */
  handleAudioPlayClick(event) {
    const audioElement = event.currentTarget;
    const messageRow = audioElement.closest(this.MESSAGE_ROW_SELECTOR);
    if (!messageRow) return;

    let messageId = messageRow.dataset.messageId;
    let timestamp = null;

    if (messageId) {
      // Extraer timestamp del messageId si está disponible
      timestamp = this.extractTimestampFromId(messageId);
    } else {
      // Generar un ID si no existe
      messageId = this.generateMessageId(messageRow);
      messageRow.dataset.messageId = messageId;
      timestamp = Date.now(); // Usar timestamp actual
    }

    // Si no se pudo obtener timestamp ni del ID existente ni del generado, usar Date.now()
    if (messageId && !this.messageIdToTimestamp.has(messageId)) {
      this.messageIdToTimestamp.set(messageId, timestamp || Date.now());
    }

    // Registrar evento de clic en audio con logManager
    window.logManager.step(window.logManager.phases.RESOURCE_DETECTION, 'AUDIO_CLICK',
      `Usuario hizo clic en audio, messageId: ${messageId}`, { messageId, timestamp });

    // Verificar si ya tiene URL asociada
    const cleanUrl = this.messageIdsToAudioUrls.get(messageId);
    if (cleanUrl) {
      // Ya tenemos la URL asociada, mostrar transcripción si está disponible
      if (this.completedTranscriptions.has(cleanUrl)) {
        const transcription = this.completedTranscriptions.get(cleanUrl);
        window.logManager.step(window.logManager.phases.TRANSCRIPTION, 'CACHE_HIT',
          `Transcripción recuperada de caché para ${messageId}`,
          { messageId, audioUrl: cleanUrl, text: transcription.text.substring(0, 50) });

        // Notificar a través del EventCoordinator
        if (window.eventCoordinator) {
          window.eventCoordinator.emit('audioTranscriptionRetrieved', {
            messageId,
            audioUrl: cleanUrl,
            transcription: transcription.text
          });
        }
      }
    } else {
      // Guardar expectativa de audio para asociar con próxima URL detectada
      this.expectingAudioForMessageId = messageId;
      this.expectingAudioTimestamp = Date.now();

      window.logManager.step(window.logManager.phases.ASSOCIATION, 'EXPECTING',
        `Esperando detección de audio para mensaje ${messageId}`);

      // Forzar un chequeo inmediato
      this.checkForAudioResources();
    }
  }

  /**
   * Genera un ID único para un mensaje
   * @param {Element} element - Elemento del mensaje
   * @returns {string} ID generado
   */
  generateMessageId(element) {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 10);
    const textContent = element.textContent?.trim().substring(0, 20) || '';
    const cleanText = textContent.replace(/[^a-zA-Z0-9]/g, '_');

    return `msg_${randomPart}_${cleanText}_${timestamp}`;
  }

  /**
   * Extrae un timestamp de un ID de mensaje
   * @param {string} messageId - ID del mensaje
   * @returns {number|null} Timestamp extraído o null
   */
  extractTimestampFromId(messageId) {
    if (!messageId || typeof messageId !== 'string') return null;

    // Buscar patrones comunes en IDs de mensajes
    // 1. Patrón msg_XXXX_TIMESTAMP
    const endMatch = messageId.match(/_(\d{13,})$/);
    if (endMatch && endMatch[1]) {
      const timestamp = parseInt(endMatch[1], 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }

    // 2. Patrón msg_THREADID_MESSAGENUMBER
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
   * Extrae timestamp de una URL de audio
   * @param {string} url - URL del audio
   * @returns {number|null} Timestamp extraído o null
   */
  extractTimestampFromAudioUrl(url) {
    if (!url || typeof url !== 'string') return null;

    // Patrón para audioclip-TIMESTAMP-XXXX.mp4
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
   * Escanea el DOM en busca de elementos de audio y usa la API de Performance
   * @returns {number} Número de nuevos audios encontrados
   */
  checkForAudioResources() {
    // 1. Buscar audios en el DOM
    const audioElements = document.querySelectorAll('audio[src]');
    const domAudioCount = audioElements.length;

    // 2. Buscar audios con la API de Performance
    const performanceUrls = this.detectAudioUrlsWithPerformanceAPI();
    const perfAudioCount = performanceUrls.length;

    let newAudiosFound = 0;
    const newAudioUrls = [];

    // Procesar audios del DOM
    audioElements.forEach(audioEl => {
      const audioUrl = audioEl.src;
      if (!audioUrl || this.processedMediaUrls.has(audioUrl)) return;

      const row = audioEl.closest(this.MESSAGE_ROW_SELECTOR);
      const messageId = row?.dataset?.messageId || null;

      this.processedMediaUrls.add(audioUrl);
      newAudiosFound++;
      newAudioUrls.push(audioUrl);

      // Recolectar datos para análisis posterior
      window.logManager.collect('audios', {
        url: audioUrl,
        urlTimestamp: this.extractTimestampFromAudioUrl(audioUrl),
        detectionSource: 'DOM',
        messageId: messageId,
        timestamp: Date.now()
      });

      // Procesar inmediatamente
      if (!this.pendingTranscriptions.has(audioUrl) &&
        !this.completedTranscriptions.has(audioUrl)) {
        this.processAudioUrl(audioUrl, messageId);
      }
    });

    // Procesar audios de Performance API
    performanceUrls.forEach(audioUrl => {
      const cleanUrl = audioUrl.split('?')[0];
      if (this.processedMediaUrls.has(cleanUrl)) return;

      this.processedMediaUrls.add(cleanUrl);
      newAudiosFound++;
      newAudioUrls.push(audioUrl);

      // Recolectar datos para análisis
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
          `Asociando audio recién detectado con mensaje esperando: ${messageIdToUse}`,
          { audioUrl: cleanUrl, messageId: messageIdToUse });

        this.expectingAudioForMessageId = null;
        this.expectingAudioTimestamp = 0;
      }

      if (!this.pendingTranscriptions.has(cleanUrl) &&
        !this.completedTranscriptions.has(cleanUrl)) {
        this.processAudioUrl(audioUrl, messageIdToUse);
      }
    });

    // Sólo logueamos si hay nuevos audios
    if (newAudiosFound > 0) {
      window.logManager.phase(window.logManager.phases.RESOURCE_DETECTION,
        `Se encontraron ${newAudiosFound} nuevo(s) audio(s) (DOM: ${domAudioCount}, PerfAPI: ${perfAudioCount})`,
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
   * Detecta URLs de audio mediante la API de Performance
   * @returns {Array<string>} URLs de audio encontradas
   */
  detectAudioUrlsWithPerformanceAPI() {
    if (!window.performance || !window.performance.getEntriesByType) return [];

    try {
      // Obtener entradas de recursos (red)
      const resources = window.performance.getEntriesByType('resource') || [];

      // Filtrar URLs de audio - IMPORTANTE: NO eliminamos los parámetros de consulta aquí
      return resources
        .map(entry => entry.name)
        .filter(url => this.isAudioUrl(url));
    } catch (error) {
      this.debugLog(`Error accediendo a Performance API: ${error.message}`);
      return [];
    }
  }

  /**
   * Verifica si una URL corresponde a un audio válido y no a un video
   * @param {string} url - URL a verificar
   * @returns {boolean} True si la URL corresponde a un audio
   */
  isAudioUrl(url) {
    if (!url) return false;

    // Patrón específico para clips de audio de voz en Facebook
    const voiceClipPattern = /\/audioclip-\d+.*?\.(mp4|m4a|aac|wav|ogg|opus)/i;

    // Si es un clip de voz, definitivamente es audio
    if (voiceClipPattern.test(url)) {
      return true;
    }

    // NUEVO: Excluir explícitamente URLs que parecen ser de video
    const videoPattern = /\/t42\.3356-2\/|\/video-\d+|\/video_redirect/i;
    if (videoPattern.test(url)) {
      //this.debugLog(`URL detectada como video, ignorando: ${url}`);
      return false;
    }

    // Para otros casos, verificar la extensión
    const genericAudioPattern = /\.(m4a|aac|wav|ogg|opus)(?:\?|$)/i;
    return genericAudioPattern.test(url);
  }

  /**
   * Procesa una URL de audio: descarga y transcribe
   * @param {string} audioUrl - URL del audio
   * @param {string|null} messageId - ID del mensaje asociado
   * @returns {Promise<string|null>} Transcripción o null si falla
   */
  async processAudioUrl(audioUrl, messageId = null) {
    // Usamos la URL completa para la descarga
    // Pero generamos un ID limpio para el mapeo interno
    const cleanUrl = audioUrl.split('?')[0];

    if (this.pendingTranscriptions.has(cleanUrl) || this.completedTranscriptions.has(cleanUrl)) {
      window.logManager.step(window.logManager.phases.TRANSCRIPTION, 'SKIP',
        `Audio ${cleanUrl} ya está siendo procesado o completado`);
      return this.getTranscription(cleanUrl);
    }

    // Registrar como pendiente usando el cleanUrl para el mapeo interno
    this.pendingTranscriptions.set(cleanUrl, {
      status: 'pending',
      timestamp: Date.now(),
      messageId
    });

    // --- Array para coleccionar logs estructurados de este audio ---
    const audioLogArray = [];

    // 1. Log de inicio
    window.logManager.phase(
      window.logManager.phases.TRANSCRIPTION,
      `Iniciando transcripción: ${audioUrl.substring(0, 50)}...${messageId ? ` (asociado a ${messageId})` : ''}`,
      { url: audioUrl, messageId }
    );
    audioLogArray.push({ event: 'START', url: audioUrl, messageId, timestamp: Date.now() });

    try {
      // 2. Descarga
      window.logManager.step(window.logManager.phases.TRANSCRIPTION, 'DOWNLOAD', 'Descargando audio');
      audioLogArray.push({ event: 'DOWNLOAD_START', timestamp: Date.now() });

      const audioBlob = await this.getAudioBlob(audioUrl);
      if (!audioBlob) throw new Error('Failed to obtain audio blob');

      const sizeKB = Math.round(audioBlob.size / 1024);
      window.logManager.step(
        window.logManager.phases.TRANSCRIPTION,
        'DOWNLOAD_COMPLETE',
        `Audio descargado: ${sizeKB} KB`
      );
      audioLogArray.push({ event: 'DOWNLOAD_COMPLETE', sizeKB, timestamp: Date.now() });

      // 3. Llamada a la API
      window.logManager.step(window.logManager.phases.TRANSCRIPTION, 'API_CALL', 'Enviando audio a API');
      audioLogArray.push({ event: 'API_CALL', timestamp: Date.now() });

      let transcription;
      if (window.apiClient && typeof window.apiClient.transcribeAudio === 'function') {
        transcription = await window.apiClient.transcribeAudio(audioBlob);
      } else {
        transcription = await this.transcribeAudio(audioBlob);
      }
      if (!transcription) throw new Error('Transcription failed or returned empty');

      audioLogArray.push({
        event: 'API_RESPONSE',
        textSnippet: transcription.substring(0, 50),
        timestamp: Date.now()
      });

      // 4. Marcar completado y almacenar
      const currentEntry = this.pendingTranscriptions.get(cleanUrl);
      this.pendingTranscriptions.delete(cleanUrl);

      this.completedTranscriptions.set(cleanUrl, {
        text: transcription,
        timestamp: Date.now(),
        messageId: currentEntry?.messageId || messageId
      });

      audioLogArray.push({
        event: 'COMPLETE',
        cleanUrl,
        messageId: currentEntry?.messageId || messageId,
        timestamp: Date.now()
      });

      // Asociaciones y cache
      if (currentEntry?.messageId || messageId) {
        const assocId = currentEntry?.messageId || messageId;
        this.audioUrlsToMessages.set(cleanUrl, assocId);
        this.messageIdsToAudioUrls.set(assocId, cleanUrl);
      }
      this.saveCache();

      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioTranscribed', {
          audioUrl: cleanUrl,
          messageId: currentEntry?.messageId || messageId,
          transcription
        });
      }

      // 5. Emitir un solo log estructurado con todo el array
      window.logManager.phase(
        window.logManager.phases.TRANSCRIPTION,
        'STRUCTURED_LOGS',
        'Historial estructurado de logs de transcripción',
        audioLogArray
      );

      return transcription;

    } catch (error) {
      window.logManager.phase(
        window.logManager.phases.TRANSCRIPTION,
        'ERROR',
        `Error al transcribir audio: ${error.message}`,
        { url: audioUrl, error }
      );
      this.pendingTranscriptions.delete(cleanUrl);
      return null;
    }
  }

  /**
   * Obtiene el blob de un audio usando GM_xmlhttpRequest para evitar CORS
   * @param {string} audioUrl - URL completa del audio (con parámetros)
   * @returns {Promise<Blob>} Blob de audio
   */
  async getAudioBlob(audioUrl) {
    this.debugLog(`Iniciando descarga de audio: ${audioUrl}`);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: audioUrl,  // Usar URL completa con todos los parámetros
        responseType: 'blob',
        timeout: 45000,
        headers: { 'Range': 'bytes=0-' }, // HEADER CRUCIAL
        onload: function (response) {
          if (response.status === 200 || response.status === 206) {
            resolve(response.response);
          } else {
            reject(new Error(`Error descargando audio: ${response.status}`));
          }
        },
        onerror: function (error) {
          reject(new Error("Error de red al descargar audio"));
        },
        ontimeout: function () {
          reject(new Error('Tiempo de espera agotado al descargar audio'));
        }
      });
    });
  }

  /**
   * Transcribe un audio usando la API de Whisper
   * @param {Blob} audioBlob - Blob del audio
   * @returns {Promise<string>} Transcripción del audio
   */
  async transcribeAudio(audioBlob) {
    if (!window.apiClient || typeof window.apiClient.transcribeAudio !== 'function') {
      // Implementación de respaldo si no está disponible ApiClient
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp4');
      formData.append('model', 'whisper-1');
      formData.append('language', 'es');

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
      // Usar ApiClient si está disponible
      return await window.apiClient.transcribeAudio(audioBlob);
    }
  }

  /**
   * Obtiene una transcripción de la caché
   * @param {string} audioUrl - URL del audio
   * @returns {string|null} Transcripción o null si no existe
   */
  getTranscription(audioUrl) {
    const cleanUrl = audioUrl.split('?')[0];

    // Verificar en transcripciones completadas
    if (this.completedTranscriptions.has(cleanUrl)) {
      const transcriptionData = this.completedTranscriptions.get(cleanUrl);
      return transcriptionData.text;
    }

    // Si está pendiente, devolver null o placeholder
    if (this.pendingTranscriptions.has(cleanUrl)) {
      return '[Transcription Pending]';
    }

    return null;
  }

  /**
   * Guarda la caché en localStorage
   * @private
   */
  saveCache() {
    try {
      // Convertir Map a objeto para localStorage
      const cache = {};
      this.completedTranscriptions.forEach((value, key) => {
        cache[key] = value;
      });

      localStorage.setItem('FB_CHAT_MONITOR_AUDIO_CACHE', JSON.stringify(cache));
      this.debugLog(`Caché guardada: ${this.completedTranscriptions.size} transcripciones`);
    } catch (error) {
      console.error('[AudioTranscriber][ERROR] Error guardando caché:', error);
    }
  }

  /**
   * Carga la caché desde localStorage
   * @private
   */
  loadCache() {
    try {
      const cache = localStorage.getItem('FB_CHAT_MONITOR_AUDIO_CACHE');
      if (!cache) {
        this.debugLog('No se encontraron transcripciones en caché');
        return;
      }

      const parsedCache = JSON.parse(cache);
      Object.entries(parsedCache).forEach(([key, value]) => {
        this.completedTranscriptions.set(key, value);
        this.processedMediaUrls.add(key);

        // Recuperar asociaciones messageId -> audioUrl
        if (value.messageId) {
          this.audioUrlsToMessages.set(key, value.messageId);
          this.messageIdsToAudioUrls.set(value.messageId, key);
        }
      });

      this.debugLog(`Caché cargada: ${this.completedTranscriptions.size} transcripciones`);
    } catch (error) {
      console.error('[AudioTranscriber][ERROR] Error cargando caché:', error);
    }
  }

  /**
   * Procesa transcripciones en paralelo para un conjunto de mensajes
   * @param {Array} messages - Mensajes a procesar
   * @returns {Promise<Array>} Mensajes con transcripciones
   */
  async processMessagesTranscriptions(messageData) {
    let messages = Array.isArray(messageData) ? messageData : messageData?.messages;

    if (!messages || !Array.isArray(messages)) {
      return messageData;
    }

    // Limpiar transcripciones incorrectas de videos primero
    this.cleanIncorrectVideoTranscriptions(messages);

    // Primero asociar transcripciones existentes
    await this.associateTranscriptionsWithMessagesFIFO(messageData);

    // Luego procesar mensajes que aún necesitan transcripción
    const messagesToProcess = messages.filter(msg =>
      msg.content?.hasAudio &&
      msg.content.type !== "video" &&
      msg.content.audioUrl &&
      (!msg.content.transcribedAudio || msg.content.transcribedAudio === '[Transcription Pending]')
    );

    if (messagesToProcess.length === 0) {
      return messageData;
    }

    this.debugLog(`Procesando transcripciones para ${messagesToProcess.length} mensajes`);

    // Procesar en paralelo con un límite de concurrencia
    const concurrencyLimit = 3;
    const processBatch = async (batch) => {
      return Promise.all(batch.map(async (msg) => {
        try {
          const transcription = await this.processAudioUrl(msg.content.audioUrl, msg.id);
          if (transcription) {
            msg.content.transcribedAudio = transcription;
          }
        } catch (error) {
          console.error(`[AudioTranscriber][ERROR] Error procesando transcripción para ${msg.id}:`, error);
          msg.content.transcribedAudio = '[Transcription Failed]';
        }
        return msg;
      }));
    };

    // Dividir en batches para limitar concurrencia
    const batches = [];
    for (let i = 0; i < messagesToProcess.length; i += concurrencyLimit) {
      batches.push(messagesToProcess.slice(i, i + concurrencyLimit));
    }

    // Procesar batches en serie para limitar concurrencia
    for (const batch of batches) {
      await processBatch(batch);
    }

    // Actualizar los mensajes originales con las transcripciones
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
   * Asocia transcripciones con mensajes basado en timestamps
   * @returns {Promise<Object>} Resultados de la asociación
   */
  async associateTranscriptionsWithMessages() {
    console.log('[Media] Iniciando asociación basada en timestamps...');

    // 1. Obtener mensajes con audio SIN URL asociada aún y con timestamp
    const messagesToAssign = [];
    const messageWrapperElement = document.querySelector(this.MESSAGE_WRAPPER_SELECTOR);

    if (messageWrapperElement) {
      // Buscar todos los mensajes con botones de audio
      messageWrapperElement.querySelectorAll(`${this.MESSAGE_ROW_SELECTOR} ${this.AUDIO_PLAY_BUTTON_SELECTOR_IN_ROW}`).forEach(playButton => {
        const messageRow = playButton.closest(this.MESSAGE_ROW_SELECTOR);
        if (!messageRow) return;

        const messageId = messageRow.dataset.messageId;
        if (!messageId) return;

        // Verificar si ya tiene una URL de audio asociada
        if (this.messageIdsToAudioUrls.has(messageId)) return;

        // Obtener timestamp del ID o mensaje
        let timestamp = this.messageIdToTimestamp.get(messageId) ||
          this.extractTimestampFromId(messageId) ||
          Date.now();

        messagesToAssign.push({ messageId, timestamp, element: messageRow });
      });
    } else {
      console.log('[Media Assoc] No se encontró el contenedor de mensajes.');
    }

    // Ordenar mensajes por timestamp (ascendente)
    messagesToAssign.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[Media Assoc] ${messagesToAssign.length} mensajes necesitan asignación (ordenados por timestamp).`);

    // 2. Obtener transcripciones completadas SIN messageId asignado y ordenarlas
    const unassignedTranscriptions = Array.from(this.completedTranscriptions.entries())
      .filter(([, data]) => data.messageId === null)
      .map(([url, data]) => ({
        url,
        timestamp: data.timestamp,
        text: data.text
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    console.log(`[Media Assoc] ${unassignedTranscriptions.length} transcripciones sin asignar (ordenadas por timestamp).`);

    // 3. Asociar por proximidad temporal
    let assignedCount = 0;
    const maxIndex = Math.min(messagesToAssign.length, unassignedTranscriptions.length);

    for (let i = 0; i < maxIndex; i++) {
      const message = messagesToAssign[i];
      const transcription = unassignedTranscriptions[i];

      // Limpiar URL
      const cleanUrl = transcription.url.split('?')[0];

      // Registrar asociación en todas direcciones
      const transcriptionData = this.completedTranscriptions.get(cleanUrl);
      if (transcriptionData) {
        transcriptionData.messageId = message.messageId;
        this.completedTranscriptions.set(cleanUrl, transcriptionData);
      }

      this.audioUrlsToMessages.set(cleanUrl, message.messageId);
      this.messageIdsToAudioUrls.set(message.messageId, cleanUrl);

      console.log(`[Media Assoc] Asociación realizada: Mensaje ${message.messageId} ↔ Audio ${cleanUrl}`);

      // Actualizar contador
      assignedCount++;

      // Notificar con EventCoordinator
      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioTranscriptionAssociated', {
          messageId: message.messageId,
          audioUrl: cleanUrl,
          transcription: transcriptionData.text
        });
      }
    }

    // Guardar caché actualizada
    if (assignedCount > 0) {
      this.saveCache();
    }

    // Emitir evento general de asociación completada
    if (window.eventCoordinator) {
      window.eventCoordinator.emit('audioTranscriptionsAssociated', {
        totalAssigned: assignedCount,
        pendingMessages: messagesToAssign.length - assignedCount,
        pendingTranscriptions: unassignedTranscriptions.length - assignedCount
      });
    }

    console.log(`[Media] Asociación por Timestamp completada. ${assignedCount} nuevas asignaciones realizadas.`);

    return {
      assigned: assignedCount,
      pendingMessages: messagesToAssign.length - assignedCount,
      pendingTranscriptions: unassignedTranscriptions.length - assignedCount
    };
  }

  /**
 * Limpia transcripciones incorrectamente asignadas a videos
 * @param {Array} messages - Mensajes a limpiar
 * @returns {number} Número de mensajes limpiados
 */
  cleanIncorrectVideoTranscriptions(messages) {
    if (!messages || !Array.isArray(messages)) return 0;

    let cleanedCount = 0;

    // Buscar mensajes de tipo video que tengan transcripciones
    const videosWithTranscriptions = messages.filter(msg =>
      msg.content?.type === "video" &&
      msg.content.hasAudio === true &&
      msg.content.transcribedAudio &&
      msg.content.transcribedAudio !== '[Transcription Pending]'
    );

    videosWithTranscriptions.forEach(msg => {
      this.debugLog(`Limpiando transcripción incorrecta de video: ID=${msg.id}`);

      // Guardar la URL antes de limpiar (si existe)
      const audioUrl = msg.content.audioUrl || null;
      const markerId = msg.content.audioMarkerId || null;

      // Limpiar transcripción
      msg.content.transcribedAudio = null;
      msg.content.hasAudio = false;  // Marcar como sin audio (es un video)
      msg.content.audioMarkerId = null;
      msg.content.audioUrl = null;

      // Limpiar asociaciones en los mapas
      if (audioUrl) {
        this.audioUrlsToMessages.delete(audioUrl.split('?')[0]);

        // Actualizar registro en transcripciones completadas
        const transcription = this.completedTranscriptions.get(audioUrl.split('?')[0]);
        if (transcription) {
          transcription.messageId = null; // Liberar la asociación
          this.completedTranscriptions.set(audioUrl.split('?')[0], transcription);
        }
      }

      if (markerId) {
        this.messageIdsToAudioUrls.delete(markerId);
      }

      cleanedCount++;
    });

    if (cleanedCount > 0) {
      this.debugLog(`Se limpiaron ${cleanedCount} transcripciones incorrectas de videos`);
      this.saveCache(); // Actualizar la caché
    }

    return cleanedCount;
  }

  /**
   * Asocia transcripciones con mensajes usando ordenamiento por timestamp de URL
   * @param {Object|Array} messageData - Objeto con mensajes y bloques temporales o array de mensajes
   * @returns {Promise<Object>} Resultados de la asociación
   */
  async associateTranscriptionsWithMessagesFIFO(messageData) {
    // Compatibilidad con versiones anteriores y extracción de datos mejorada
    let messages = null;
    let timeBlocks = [];

    // Determinar formato de entrada y extraer datos adecuadamente
    if (Array.isArray(messageData)) {
      messages = messageData;
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 
        `Procesando array directo con ${messages.length} mensajes`);
    } else if (messageData && messageData.messages) {
      messages = messageData.messages;
      timeBlocks = messageData.timeBlocks || [];
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 
        `Procesando objeto con ${messages.length} mensajes y ${timeBlocks.length} bloques temporales`);
    } else {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'ERROR', 
        'Formato de messageData no reconocido', messageData);
      return { assigned: 0, remaining: 0 };
    }

    if (!messages || !Array.isArray(messages)) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'ERROR',
        'Array de mensajes inválido', messageData);
      return { assigned: 0, remaining: 0 };
    }

    // Limpiar transcripciones erróneas de videos primero
    this.cleanIncorrectVideoTranscriptions(messages);

    // Filtrar mensajes que necesitan transcripción
    const messagesToAssign = messages.filter(m =>
      m.content?.hasAudio &&
      m.content.type !== "video" &&
      (!m.content.transcribedAudio || m.content.transcribedAudio === '[Transcription Pending]')
    );

    if (messagesToAssign.length === 0) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION,
        "No hay mensajes que necesiten transcripción");
      return { assigned: 0, remaining: 0 };
    }

    // NUEVO: Esperar brevemente para permitir que las transcripciones pendientes se completen
    const pendingCount = this.pendingTranscriptions.size;
    if (pendingCount > 0) {
      window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT',
        `Esperando a que terminen ${pendingCount} transcripciones pendientes...`);

      // Esperar hasta 5 segundos para que las transcripciones pendientes se completen
      const startTime = Date.now();
      const maxWaitTime = 5000; // 5 segundos máximo

      while (Date.now() - startTime < maxWaitTime && this.pendingTranscriptions.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Esperar 500ms entre verificaciones
      }

      if (this.pendingTranscriptions.size > 0) {
        window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT_INCOMPLETE',
          `Después de esperar, aún quedan ${this.pendingTranscriptions.size} transcripciones pendientes`);
      } else {
        window.logManager.step(window.logManager.phases.ASSOCIATION, 'WAIT_COMPLETE',
          `Todas las transcripciones pendientes completadas`);
      }
    }

    // Obtener transcripciones sin asignar
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
        "No hay transcripciones disponibles para asignar");
      return { assigned: 0, remaining: messagesToAssign.length };
    }

    if (window.logger) {
      window.logger.process('ASSOCIATION', `Asociando ${messagesToAssign.length} mensajes con ${unassignedTranscriptions.length} transcripciones`);
    } else {
      this.debugLog(`Asociando ${messagesToAssign.length} mensajes con ${unassignedTranscriptions.length} transcripciones`);
    }

    // MODIFICACIÓN IMPORTANTE: Ordenar siempre por timestamp
    // Ordenar transcripciones por timestamp extraído de URL (crucial)
    unassignedTranscriptions.sort((a, b) => {
      // Priorizar transcripciones con timestamp extraído de URL
      if (a.urlTimestamp && b.urlTimestamp) return a.urlTimestamp - b.urlTimestamp;
      if (a.urlTimestamp) return -1;  // Si solo a tiene timestamp, colocarlo primero
      if (b.urlTimestamp) return 1;   // Si solo b tiene timestamp, colocarlo primero
      // Usar el timestamp de creación como respaldo si no hay timestamp en URL
      return a.timestamp - b.timestamp;
    });

    if (window.logger) {
      window.logger.substep('ASSOCIATION', 'ORDERING',
        `Transcripciones ordenadas por timestamp de URL: ${unassignedTranscriptions.map(t => t.urlTimestamp || 'sin timestamp').join(', ')}`);
    }

    // Ordenar mensajes por datos adicionales que podrían indicar orden (como ID o timestamp)
    messagesToAssign.forEach(msg => {
      if (msg.id) {
        const timestampFromId = this.extractTimestampFromId(msg.id);
        if (timestampFromId) msg._extractedTimestamp = timestampFromId;
      }

      // Si hay datos de timestamp directamente en el mensaje, usarlos
      if (msg.timestamp) msg._extractedTimestamp = msg.timestamp;
    });

    messagesToAssign.sort((a, b) => {
      // Si ambos tienen timestamp extraído, usarlo
      if (a._extractedTimestamp && b._extractedTimestamp) return a._extractedTimestamp - b._extractedTimestamp;
      // Si solo uno tiene timestamp extraído
      if (a._extractedTimestamp) return -1;
      if (b._extractedTimestamp) return 1;

      // Por posición en el DOM como respaldo (usando timeBlockIndex si está disponible)
      if (a.timeBlockIndex !== undefined && b.timeBlockIndex !== undefined)
        return a.timeBlockIndex - b.timeBlockIndex;

      // Por posición numérica en el ID como último recurso
      const getNumericPart = (id) => {
        if (!id) return 0;
        const matches = id.match(/(\d+)/g);
        return matches ? parseInt(matches[matches.length - 1]) : 0;
      };
      return getNumericPart(a.id) - getNumericPart(b.id);
    });

    if (window.logger) {
      window.logger.substep('ASSOCIATION', 'ORDERING',
        `Mensajes ordenados: ${messagesToAssign.map(m => m._extractedTimestamp || 'sin timestamp').join(', ')}`);
    }

    // Asociación usando el orden cronológico determinado
    let assignedCount = 0;
    const assignedMessages = new Set();
    const assignedTranscriptions = new Set();

    if (window.logger) window.logger.process('ASSOCIATION', "Utilizando asociación basada en timestamps");
    else this.debugLog("Utilizando asociación basada en timestamps");

    // Asociar mensajes y transcripciones en el orden determinado
    const assignableCount = Math.min(messagesToAssign.length, unassignedTranscriptions.length);

    if (window.logger) window.logger.substep('ASSOCIATION', 'ASSIGNING', `Asignando ${assignableCount} transcripciones por orden cronológico`);
    else this.debugLog(`Asignando ${assignableCount} transcripciones por orden cronológico`);

    for (let i = 0; i < assignableCount; i++) {
      const message = messagesToAssign[i];
      const transcriptionData = unassignedTranscriptions[i];

      // Realizar la asociación
      message.content.transcribedAudio = transcriptionData.text;

      // Si el mensaje no tiene URL de audio, asignarle la de la transcripción
      if (!message.content.audioUrl) {
        message.content.audioUrl = transcriptionData.url;
      }

      // Actualizar registro en completedTranscriptions
      const cleanUrl = transcriptionData.url.split('?')[0];
      const transcriptionEntry = this.completedTranscriptions.get(cleanUrl);
      if (transcriptionEntry) {
        transcriptionEntry.messageId = message.id;
        this.completedTranscriptions.set(cleanUrl, transcriptionEntry);
      }

      // Establecer relaciones bidireccionales
      this.audioUrlsToMessages.set(cleanUrl, message.id);
      this.messageIdsToAudioUrls.set(message.id, cleanUrl);

      // Marcar como asignados
      assignedMessages.add(message.id);
      assignedTranscriptions.add(transcriptionData.url);

      assignedCount++;

      // Log detallado para debugging
      if (window.logger) {
        window.logger.substep('ASSOCIATION', 'ASSIGNED',
          `Mensaje ${message.id} asociado con "${transcriptionData.text.substring(0, 30)}..."`,
          {
            messageId: message.id,
            urlTimestamp: transcriptionData.urlTimestamp,
            messageTimestamp: message._extractedTimestamp || 'N/A'
          });
      } else {
        this.debugLog(`Asociado: Mensaje ${message.id} con transcripción "${transcriptionData.text.substring(0, 30)}..."`);
      }

      // Recolectar datos adicionales para análisis en formato estructurado
      window.logManager.collect('associations', {
        messageId: message.id,
        text: transcriptionData.text.substring(0, 100),
        urlTimestamp: transcriptionData.urlTimestamp,
        messageTimestamp: message._extractedTimestamp,
        correlationIndex: i,
        associationType: 'timestamp-fifo'
      });
    }

    // Guardar caché actualizada
    this.saveCache();

    // Mostrar resultado
    window.logManager.phase(window.logManager.phases.ASSOCIATION,
      `Asociación completada: ${assignedCount} de ${messagesToAssign.length} mensajes asociados`);

    // Mostrar datos recolectados de forma estructurada pero con protección contra errores
    try {
      window.logManager.showCollected('associations', true);
    } catch (error) {
      window.logManager.phase(window.logManager.phases.ASSOCIATION, 'WARN',
        `Error mostrando datos de asociaciones: ${error.message}`);
    }

    return {
      assigned: assignedCount,
      remaining: messagesToAssign.length - assignedCount
    };
  }

  /**
   * Extrae el timestamp de una URL de audio
   * @param {string} url - URL del audio
   * @returns {number|null} Timestamp extraído o null
   */
  extractTimestampFromAudioUrl(url) {
    if (!url || typeof url !== 'string') return null;

    // Patrón para audioclip-TIMESTAMP-XXXX.mp4
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
   * Limpia el estado de transcripciones para un nuevo chat
   * @param {string} chatId - ID del chat actual
   */
  resetForNewChat(chatId) {
    // No eliminamos las transcripciones completadas, pero marcamos un nuevo contexto
    this.currentChatId = chatId;

    // Limpiar asociaciones específicas del chat anterior
    this.expectingAudioForMessageId = null;
    this.expectingAudioTimestamp = 0;

    this.debugLog(`Estado reseteado para nuevo chat: ${chatId}`);
  }

  /**
   * Debug log con prefijo y formato consistente
   * @param {string} message - Mensaje a registrar
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