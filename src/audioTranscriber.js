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
      this.debugLog('Inicializando AudioTranscriber...');

      // Cargar transcripciones en caché desde localStorage
      this.loadCache();

      // Iniciar observer para detectar nuevos audios
      this.setupObserver();

      // Iniciar polling periódico
      this.debugLog(`Iniciando detección de recursos de audio cada ${this.POLLING_INTERVAL_MS}ms.`);
      this.pollingInterval = setInterval(() => this.checkForAudioResources(), this.POLLING_INTERVAL_MS);

      // Escaneo inicial
      this.checkForAudioResources();

      // Integración con ScrollManager - suscribirse a eventos
      if (window.scrollManager) {
        this.debugLog('Integrando con ScrollManager');
        window.scrollManager.on('afterScroll', (data) => {
          // Detectar audios después de cada scroll
          this.checkForAudioResources();
        });
      }

      // Integración con EventCoordinator
      if (window.eventCoordinator) {
        this.debugLog('Integrando con EventCoordinator');
      }

      this.initialized = true;
      logger.log('AudioTranscriber initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AudioTranscriber', {}, error);
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
      this.debugLog('No se encontró el contenedor de mensajes para configurar el observer');
      // Intentar más tarde
      setTimeout(() => this.setupObserver(), 2000);
      return;
    }

    this.debugLog('Observer activado para nuevos mensajes.');

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

    // Verificar si ya tiene URL asociada
    const cleanUrl = this.messageIdsToAudioUrls.get(messageId);
    if (cleanUrl) {
      // Ya tenemos la URL asociada, mostrar transcripción si está disponible
      if (this.completedTranscriptions.has(cleanUrl)) {
        const transcription = this.completedTranscriptions.get(cleanUrl);
        this.debugLog(`Transcripción recuperada de caché para ${messageId}: "${transcription.text}"`);

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
      this.debugLog(`Esperando detección de audio para mensaje ${messageId}`);

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

    // Intentar extraer el timestamp del ID del mensaje
    const timestampMatch = messageId.match(/_(\d{13,})(?:_|$)/);
    if (timestampMatch && timestampMatch[1]) {
      const timestamp = parseInt(timestampMatch[1], 10);
      if (!isNaN(timestamp) && timestamp > 1600000000000) { // > 2020
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

      let messageIdToUse = null;
      if (this.expectingAudioForMessageId &&
          (Date.now() - this.expectingAudioTimestamp) < this.CLICK_ASSOCIATION_WINDOW_MS) {
        messageIdToUse = this.expectingAudioForMessageId;
        this.audioUrlsToMessages.set(cleanUrl, messageIdToUse);
        this.messageIdsToAudioUrls.set(messageIdToUse, cleanUrl);
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
      this.debugLog(
        `Se encontraron ${newAudiosFound} nuevo(s) audio(s) ` +
        `(DOM: ${domAudioCount}, PerfAPI: ${perfAudioCount})`
      );
      this.debugLog(`URLs: ${newAudioUrls.join(', ')}`);
      logger.debug(`AudioTranscriber: Found ${newAudiosFound} new audio resources`);

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
   * Verifica si una URL corresponde a un audio válido
   * @param {string} url - URL a verificar
   * @returns {boolean} True si la URL corresponde a un audio
   */
  isAudioUrl(url) {
    const audioUrlPattern = /https:\/\/cdn\.fbsbx\.com\/v\/t\d+\.\d+-\d+\/.*?\.(mp4|m4a|aac|wav|ogg|opus)/i;
    const voiceClipPattern = /https:\/\/cdn\.fbsbx\.com\/v\/.*?\/audioclip-\d+.*?\.(mp4|m4a|aac|wav|ogg|opus)/i;

    return audioUrlPattern.test(url) || voiceClipPattern.test(url);
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
      this.debugLog(`Audio ${cleanUrl} ya está siendo procesado o completado`);
      return this.getTranscription(cleanUrl);
    }

    // Registrar como pendiente usando el cleanUrl para el mapeo interno
    this.pendingTranscriptions.set(cleanUrl, {
      status: 'pending',
      timestamp: Date.now(),
      messageId
    });

    this.debugLog(`Procesando URL de audio: ${audioUrl}${messageId ? ` (asociado a ${messageId})` : ''}`);

    try {
      // Obtener blob de audio USANDO LA URL COMPLETA
      const audioBlob = await this.getAudioBlob(audioUrl); // Pasamos la URL completa
      if (!audioBlob) {
        throw new Error('Failed to obtain audio blob');
      }

      // Transcribir usando ApiClient si está disponible, o nuestro método
      let transcription;
      if (window.apiClient && typeof window.apiClient.transcribeAudio === 'function') {
        // Usar ApiClient para transcribir (método preferido)
        transcription = await window.apiClient.transcribeAudio(audioBlob);
      } else {
        // Fallback a nuestro método de transcripción
        transcription = await this.transcribeAudio(audioBlob);
      }

      if (!transcription) {
        throw new Error('Transcription failed or returned empty');
      }

      // Actualizar a completado
      const currentEntry = this.pendingTranscriptions.get(cleanUrl);
      this.pendingTranscriptions.delete(cleanUrl);

      // Guardar en caché con messageId si existe
      this.completedTranscriptions.set(cleanUrl, {
        text: transcription,
        timestamp: Date.now(),
        messageId: currentEntry?.messageId || messageId
      });

      // Actualizar asociaciones si hay messageId
      const associatedMessageId = currentEntry?.messageId || messageId;
      if (associatedMessageId) {
        this.audioUrlsToMessages.set(cleanUrl, associatedMessageId);
        this.messageIdsToAudioUrls.set(associatedMessageId, cleanUrl);
      }

      // Guardar en localStorage
      this.saveCache();

      // Emitir evento de transcripción completada
      if (window.eventCoordinator) {
        window.eventCoordinator.emit('audioTranscribed', {
          audioUrl: cleanUrl,
          messageId: associatedMessageId,
          transcription
        });
      }

      this.debugLog(`Transcripción completada para ${cleanUrl}: "${transcription}"`);
      return transcription;

    } catch (error) {
      this.debugLog(`Error al procesar audio ${audioUrl}: ${error.message}`);
      logger.error('Failed to transcribe audio', { audioUrl }, error);

      // Marcar como error
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
  async processMessagesTranscriptions(messages) {
    if (!messages || !Array.isArray(messages)) {
      return messages;
    }

    // Encontrar mensajes que tienen audio pero no transcripción
    const messagesToProcess = messages.filter(msg =>
      msg.content?.hasAudio &&
      msg.content.audioUrl &&
      (!msg.content.transcribedAudio || msg.content.transcribedAudio === '[Transcription Pending]')
    );

    if (messagesToProcess.length === 0) {
      return messages;
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
          logger.error('Error transcribing audio in batch', {}, error);
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
        const transcription = this.getTranscription(msg.content.audioUrl);
        if (transcription && transcription !== '[Transcription Pending]') {
          msg.content.transcribedAudio = transcription;
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
   * Debug log con prefijo y formato consistente
   * @param {string} message - Mensaje a registrar
   * @private
   */
  debugLog(message) {
    if (this.DEBUG_MODE) {
      console.log(`[AudioTranscriber][DEBUG] ${message}`);
    }
  }
}

// Create global singleton instance
const audioTranscriber = new AudioTranscriber();

// Expose globally
window.audioTranscriber = audioTranscriber;