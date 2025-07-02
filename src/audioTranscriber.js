/**
 * AudioTranscriber - Sistema optimizado para detección y transcripción de audio
 * 
 * Responsibilities:
 * - Detectar audio en el DOM y extraer sus URLs
 * - Gestionar transcripciones en caché
 * - Procesar transcripciones en paralelo
 * - Proporcionar acceso a transcripciones ya realizadas
 */
class AudioTranscriber {
  constructor() {
    this.AUDIO_SELECTOR = 'audio[src]';
    this.MESSAGE_ROW_SELECTOR = 'div[role="row"]';
    this.audioCache = new Map(); // URL -> transcription
    this.processingQueue = new Set(); // URLs en proceso
    this.processedAudios = new Set(); // URLs ya procesadas
    this.observer = null;
    this.initialized = false;
    this.transcriptionPromises = new Map(); // URL -> Promise
  }

  /**
   * Inicializa el sistema de transcripción
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Cargar transcripciones en caché desde localStorage
      this.loadCache();
      
      // Iniciar observer para detectar nuevos audios
      this.setupObserver();
      
      // Escaneo inicial
      this.checkForAudioResources();
      
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
    if (this.observer) return;
    
    this.observer = new MutationObserver(() => {
      this.checkForAudioResources();
    });
    
    // Observar cambios en el DOM
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    logger.debug('AudioTranscriber observer setup complete');
  }

  /**
   * Escanea el DOM en busca de elementos de audio
   * @param {boolean} processImmediately - Si debe iniciar el procesamiento inmediatamente
   * @returns {number} Número de nuevos audios encontrados
   */
  checkForAudioResources(processImmediately = true) {
    console.log(`[AudioTranscriber][DEBUG] Buscando recursos de audio en la página`);
    const audioElements = document.querySelectorAll(this.AUDIO_SELECTOR);
    console.log(`[AudioTranscriber][DEBUG] Encontrados ${audioElements.length} elementos de audio en el DOM`);
    
    let newAudiosFound = 0;
    const newAudioUrls = [];
    
    audioElements.forEach(audioEl => {
      const audioUrl = audioEl.src;
      if (!audioUrl || this.processedAudios.has(audioUrl)) return;
      
      // Encontrar el mensaje al que pertenece este audio
      const row = audioEl.closest(this.MESSAGE_ROW_SELECTOR);
      const messageId = row?.dataset?.messageId || null;
      
      // Marcar como visto
      this.processedAudios.add(audioUrl);
      newAudiosFound++;
      newAudioUrls.push(audioUrl);
      
      console.log(`[AudioTranscriber][DEBUG] Nuevo audio encontrado: ${audioUrl}, messageId asociado: ${messageId || 'ninguno'}`);
      
      // Obtener el blob solo si se requiere procesamiento inmediato
      if (processImmediately && !this.audioCache.has(audioUrl) && !this.processingQueue.has(audioUrl)) {
        console.log(`[AudioTranscriber][DEBUG] Audio no está en caché ni en cola, obteniendo blob para: ${audioUrl}`);
        this.getAudioBlob(audioUrl).then(audioBlob => {
          if (audioBlob) {
            console.log(`[AudioTranscriber][DEBUG] Blob obtenido correctamente para: ${audioUrl}, tamaño: ${audioBlob.size} bytes`);
            this.queueTranscription(audioUrl, audioBlob, messageId);
          }
        }).catch(error => {
          console.error(`[AudioTranscriber][ERROR] Error obteniendo blob para audio ${audioUrl}:`, error);
          logger.debug(`Error extracting audio blob: ${error.message}`);
        });
      } else {
        console.log(`[AudioTranscriber][DEBUG] Audio ${audioUrl} ya está en caché o en cola de procesamiento. Saltando.`);
      }
    });
    
    if (newAudiosFound > 0) {
      console.log(`[AudioTranscriber][INFO] Encontrados ${newAudiosFound} nuevos recursos de audio para procesar`);
      logger.debug(`AudioTranscriber: Found ${newAudiosFound} new audio resources`);
      
      // Emitir evento para notificar a otros componentes
      const event = new CustomEvent('audio-resources-found', {
        detail: {
          count: newAudiosFound,
          urls: newAudioUrls,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(event);
    }
    
    return newAudiosFound;
  }

  /**
   * Obtiene el blob de un audio
   * @param {string} audioUrl - URL del audio
   * @returns {Promise<Blob>} Blob de audio
   * @private
   */
  async getAudioBlob(audioUrl) {
    if (audioUrl.startsWith('blob:')) {
      const audioEl = document.querySelector(`${this.AUDIO_SELECTOR}[src="${audioUrl}"]`);
      if (audioEl?.srcObject) return audioEl.srcObject;
    }
    
    try {
      const resp = await fetch(audioUrl);
      if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.status}`);
      return await resp.blob();
    } catch (error) {
      logger.warn(`Error fetching audio from ${audioUrl}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pone en cola una transcripción para ser procesada
   * @param {string} audioUrl - URL del audio
   * @param {Blob} audioBlob - Blob del audio
   * @param {string|null} messageId - ID del mensaje (opcional)
   * @private
   */
  queueTranscription(audioUrl, audioBlob, messageId = null) {
    if (this.processingQueue.has(audioUrl)) {
      console.log(`[AudioTranscriber][DEBUG] Audio ${audioUrl} ya está en la cola de procesamiento`);
      return;
    }
    
    console.log(`[AudioTranscriber][INFO] Añadiendo a cola de transcripción: ${audioUrl}, messageId: ${messageId || 'ninguno'}`);
    this.processingQueue.add(audioUrl);
    
    // Crear promesa de transcripción
    const transcriptionPromise = this.transcribeAudio(audioBlob)
      .then(transcription => {
        // Guardar en caché
        this.audioCache.set(audioUrl, transcription);
        this.saveCache();
        
        // Notificar éxito
        console.log(`[AudioTranscriber][SUCCESS] Transcripción completada para ${audioUrl}: "${transcription.substring(0, 50)}${transcription.length > 50 ? '...' : ''}"`);
        logger.debug(`Transcription complete for ${audioUrl}: ${transcription.substring(0, 50)}...`);
        
        // Remover de la cola de procesamiento
        this.processingQueue.delete(audioUrl);
        console.log(`[AudioTranscriber][DEBUG] Audio ${audioUrl} eliminado de la cola de procesamiento`);
        
        return transcription;
      })
      .catch(error => {
        console.error(`[AudioTranscriber][ERROR] Transcripción fallida para ${audioUrl}:`, error);
        logger.warn(`Transcription failed for ${audioUrl}: ${error.message}`);
        this.processingQueue.delete(audioUrl);
        throw error;
      });
    
    // Almacenar promesa para acceso externo
    this.transcriptionPromises.set(audioUrl, transcriptionPromise);
    
    return transcriptionPromise;
  }

  /**
   * Transcribe un audio usando la API
   * @param {Blob} audioBlob - Blob del audio
   * @returns {Promise<string>} Transcripción del audio
   * @private
   */
  async transcribeAudio(audioBlob) {
    console.log(`[AudioTranscriber][DEBUG] Iniciando transcripción para blob de ${audioBlob.size} bytes, tipo: ${audioBlob.type}`);
    
    if (!window.apiClient || typeof window.apiClient.transcribeAudio !== 'function') {
      console.error(`[AudioTranscriber][ERROR] No hay API client disponible para transcripción`);
      throw new Error('API client not available for transcription');
    }
    
    try {
      console.log(`[AudioTranscriber][DEBUG] Llamando a apiClient.transcribeAudio()`);
      const transcription = await window.apiClient.transcribeAudio(audioBlob);
      console.log(`[AudioTranscriber][DEBUG] Transcripción exitosa, resultado: "${transcription.substring(0, 50)}${transcription.length > 50 ? '...' : ''}"`);
      return transcription;
    } catch (error) {
      console.error(`[AudioTranscriber][ERROR] Error en transcripción de audio:`, error);
      logger.error('Error in audio transcription:', error);
      throw error;
    }
  }

  /**
   * Obtiene una transcripción de la caché o espera a que se complete
   * @param {string} audioUrl - URL del audio
   * @returns {string|null} Transcripción o null si no existe
   */
  getTranscription(audioUrl) {
    // Comprobar caché primero
    if (this.audioCache.has(audioUrl)) {
      console.log(`[AudioTranscriber][DEBUG] Transcripción encontrada en caché para ${audioUrl}`);
      return this.audioCache.get(audioUrl);
    }
    
    if (this.processingQueue.has(audioUrl)) {
      console.log(`[AudioTranscriber][DEBUG] Audio ${audioUrl} en proceso de transcripción, aún no disponible`);
    } else {
      console.log(`[AudioTranscriber][DEBUG] No hay transcripción disponible para ${audioUrl}`);
    }
    
    // Si está en proceso, devolver null (el llamador deberá intentar más tarde)
    return null;
  }

  /**
   * Obtiene una promesa para una transcripción (para espera asíncrona)
   * @param {string} audioUrl - URL del audio
   * @returns {Promise<string>|null} Promesa de transcripción o null
   */
  getTranscriptionPromise(audioUrl) {
    return this.transcriptionPromises.get(audioUrl) || null;
  }

  /**
   * Añade una transcripción a la caché
   * @param {string} audioUrl - URL del audio
   * @param {string} transcription - Texto de la transcripción
   */
  addTranscription(audioUrl, transcription) {
    this.audioCache.set(audioUrl, transcription);
    this.saveCache();
  }

  /**
   * Guarda la caché en localStorage
   * @private
   */
  saveCache() {
    try {
      // Limitar tamaño de caché a 100 entradas para evitar problemas de almacenamiento
      if (this.audioCache.size > 100) {
        const entriesToDelete = [...this.audioCache.keys()].slice(0, this.audioCache.size - 100);
        entriesToDelete.forEach(key => this.audioCache.delete(key));
      }
      
      // Convertir Map a Object para almacenamiento
      const cacheObject = Object.fromEntries(this.audioCache);
      localStorage.setItem('FB_CHAT_MONITOR_AUDIO_CACHE', JSON.stringify(cacheObject));
    } catch (error) {
      logger.warn('Failed to save audio cache:', error);
    }
  }

  /**
   * Carga la caché desde localStorage
   * @private
   */
  loadCache() {
    try {
      const cached = localStorage.getItem('FB_CHAT_MONITOR_AUDIO_CACHE');
      if (cached) {
        const cacheObject = JSON.parse(cached);
        this.audioCache = new Map(Object.entries(cacheObject));
        console.log(`[AudioTranscriber][INFO] Cargadas ${this.audioCache.size} transcripciones de caché con tamaños:`);
        
        // Mostrar estadísticas sobre las transcripciones en caché
        let totalSize = 0;
        let minLength = Infinity;
        let maxLength = 0;
        
        this.audioCache.forEach((transcription, url) => {
          const length = transcription.length;
          totalSize += length;
          minLength = Math.min(minLength, length);
          maxLength = Math.max(maxLength, length);
        });
        
        console.log(`[AudioTranscriber][DEBUG] Estadísticas de caché: Min=${minLength}, Max=${maxLength}, Promedio=${totalSize/Math.max(1, this.audioCache.size)}`);
        
        logger.debug(`Loaded ${this.audioCache.size} cached transcriptions`);
      } else {
        console.log(`[AudioTranscriber][DEBUG] No se encontraron transcripciones en caché`);
      }
    } catch (error) {
      console.error(`[AudioTranscriber][ERROR] Error cargando caché de audio:`, error);
      logger.warn('Failed to load audio cache:', error);
    }
  }

  /**
   * Procesa transcripciones en paralelo para un conjunto de mensajes
   * @param {Array} messages - Mensajes a procesar
   * @returns {Promise<Array>} Mensajes con transcripciones
   */
  async processMessagesTranscriptions(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return messages;
    }
    
    const audioMessages = messages.filter(msg => 
      msg.content?.hasAudio && msg.content.audioUrl
    );
    
    if (audioMessages.length === 0) {
      console.log(`[AudioTranscriber][DEBUG] No hay mensajes de audio para procesar en este lote`);
      return messages;
    }
    
    console.log(`[AudioTranscriber][INFO] Procesando transcripciones para ${audioMessages.length} mensajes con audio`);
    logger.debug(`Processing transcriptions for ${audioMessages.length} audio messages`);
    
    // Registrar las URLs de los audios para debug
    const audioUrls = audioMessages.map(msg => msg.content.audioUrl);
    console.log(`[AudioTranscriber][DEBUG] URLs de audio a procesar:`, audioUrls);
    
    // Procesar transcripciones en paralelo
    const transcriptionTasks = audioMessages.map(async message => {
      const audioUrl = message.content.audioUrl;
      
      // Check cache first
      if (this.audioCache.has(audioUrl)) {
        return {
          messageId: message.id,
          audioUrl,
          transcription: this.audioCache.get(audioUrl)
        };
      }
      
      // Check if already being transcribed
      if (this.transcriptionPromises.has(audioUrl)) {
        try {
          const transcription = await this.transcriptionPromises.get(audioUrl);
          return { messageId: message.id, audioUrl, transcription };
        } catch (error) {
          return { messageId: message.id, audioUrl, error };
        }
      }
      
      // Get the blob and queue for transcription
      try {
        const audioBlob = message.content.audioBlob || await this.getAudioBlob(audioUrl);
        if (audioBlob) {
          this.queueTranscription(audioUrl, audioBlob, message.id);
          const transcription = await this.transcriptionPromises.get(audioUrl);
          return { messageId: message.id, audioUrl, transcription };
        }
      } catch (error) {
        return { messageId: message.id, audioUrl, error };
      }
      
      return { messageId: message.id, audioUrl };
    });
    
    // Esperar a que todas las tareas terminen
    const results = await Promise.allSettled(transcriptionTasks);
    
    // Aplicar transcripciones a los mensajes originales
    return messages.map(message => {
      if (!message.content?.hasAudio || !message.content.audioUrl) return message;
      
      const resultObj = results
        .filter(r => r.status === 'fulfilled' && r.value?.messageId === message.id)
        .map(r => r.value)[0];
      
      if (resultObj?.transcription) {
        return {
          ...message,
          content: {
            ...message.content,
            transcribedAudio: resultObj.transcription,
            text: message.content.text ?
              `${message.content.text}\n[Audio Transcription: ${resultObj.transcription}]` :
              `[Audio Transcription: ${resultObj.transcription}]`
          }
        };
      }
      
      return message;
    });
  }
}

// Create global singleton instance
const audioTranscriber = new AudioTranscriber();

// Expose globally
window.audioTranscriber = audioTranscriber;
