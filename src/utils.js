// ----- UTILITIES -----

/**
 * LogManager - Sistema centralizado para gestión de logs del sistema
 */
class LogManager {
  constructor() {
    this.phases = {
      CHAT_DETECTION: 'CHAT_DETECTION',     // Detección de cambios en el chat
      RESOURCE_DETECTION: 'RESOURCE_DET',   // Detección de recursos (audio/video/imágenes)
      EXTRACTION: 'EXTRACTION',             // Extracción de contenidos
      TRANSCRIPTION: 'TRANSCRIPTION',       // Transcripción de audios
      ASSOCIATION: 'ASSOCIATION',           // Asociación de transcripciones
      PROCESSING: 'PROCESSING',             // Procesamiento para IA
      GENERATION: 'GENERATION',             // Generación de respuesta
      RESPONSE: 'RESPONSE'                  // Envío de respuesta
    };

    this.collectedData = {
      audios: [],
      transcriptions: [],
      messages: [],
      associations: []
    };

    // Configuración
    this.config = {
      consoleOutput: true,
      fileOutput: false,
      detailLevel: 'normal',  // 'minimal', 'normal', 'detailed', 'debug'
      showTimestamps: true,
      useGroups: true,       // Usar console.group para agrupar mensajes relacionados
      collapseGroups: true   // Colapsar grupos por defecto
    };
    
    // Contador de grupos activos
    this._activeGroups = 0;
  }

  /**
   * Registra un evento principal de una fase
   * @param {string} phase - Fase del proceso
   * @param {string} message - Mensaje descriptivo
   * @param {Object} data - Datos opcionales
   */
  phase(phase, message, data = {}) {
    if (!this.phases[phase]) {
      phase = 'GENERAL';
    }

    if (window.logger && typeof window.logger.process === 'function') {
      window.logger.process(phase, message, data);
    } else {
      console.log(`[FB-Chat-Monitor][${phase}] ${message}`,
        Object.keys(data).length > 0 ? data : '');
    }
  }

  /**
   * Registra un subpaso de una fase
   * @param {string} phase - Fase principal
   * @param {string} step - Identificador del paso
   * @param {string} message - Mensaje descriptivo
   * @param {Object} data - Datos opcionales
   */
  step(phase, step, message, data = {}) {
    if (!this.phases[phase]) {
      phase = 'GENERAL';
    }

    if (window.logger && typeof window.logger.substep === 'function') {
      window.logger.substep(phase, step, message, data);
    } else {
      console.log(`[FB-Chat-Monitor][${phase}][${step}] ${message}`,
        Object.keys(data).length > 0 ? data : '');
    }
  }

  /**
   * Inicia un grupo de logs relacionados
   * @param {string} title - Título del grupo
   * @param {boolean} collapsed - Si el grupo debe estar colapsado
   */
  startGroup(title, collapsed = this.config.collapseGroups) {
    if (!this.config.useGroups) {
      console.log(`[FB-Chat-Monitor] === ${title} ===`);
      return;
    }
    
    if (collapsed) {
      console.groupCollapsed(`[FB-Chat-Monitor] ${title}`);
    } else {
      console.group(`[FB-Chat-Monitor] ${title}`);
    }
    this._activeGroups++;
  }

  /**
   * Finaliza el grupo actual de logs
   */
  endGroup() {
    if (!this.config.useGroups || this._activeGroups <= 0) {
      return;
    }
    
    console.groupEnd();
    this._activeGroups--;
  }

  /**
   * Registra un conjunto de items relacionados como un grupo
   * @param {string} title - Título del grupo
   * @param {Array|Object} items - Items a mostrar
   * @param {Function} formatter - Función para formatear cada item (opcional)
   * @param {boolean} collapsed - Si el grupo debe estar colapsado
   */
  logGroup(title, items, formatter = null, collapsed = this.config.collapseGroups) {
    this.startGroup(title, collapsed);
    
    if (Array.isArray(items)) {
      if (formatter && typeof formatter === 'function') {
        items.forEach((item, index) => {
          console.log(formatter(item, index));
        });
      } else if (items.length > 0) {
        console.table(items);
      } else {
        console.log('No hay elementos para mostrar');
      }
    } else if (typeof items === 'object' && items !== null) {
      console.log(items);
    } else {
      console.log('Datos inválidos');
    }
    
    this.endGroup();
  }

  /**
   * Registra mensajes de debug estructurados
   * @param {string} component - Componente o clase que emite el mensaje
   * @param {string} title - Título o descripción del mensaje
   * @param {any} data - Datos a mostrar
   */
  debugStructured(component, title, data) {
    if (this.config.detailLevel !== 'detailed' && this.config.detailLevel !== 'debug') {
      return;
    }
    
    this.startGroup(`[${component}][DEBUG] ${title}`, true);
    
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log('Array vacío');
      } else if (data.length <= 50) {
        console.log(data);
      } else {
        console.log(`Array con ${data.length} elementos:`, data.slice(0, 10), '...');
      }
    } else if (data && typeof data === 'object') {
      console.log(data);
    } else {
      console.log(data);
    }
    
    this.endGroup();
  }
  
  /**
   * Muestra una tabla formateada con datos estructurados
   * @param {string} title - Título de la tabla
   * @param {Array} data - Datos para la tabla
   * @param {Array} columns - Columnas a mostrar (opcional)
   */
  table(title, data, columns = null) {
    this.startGroup(title);
    
    if (columns) {
      // Filtrar solo las columnas especificadas
      const filteredData = data.map(item => {
        const result = {};
        columns.forEach(col => {
          result[col] = item[col];
        });
        return result;
      });
      console.table(filteredData);
    } else {
      console.table(data);
    }
    
    this.endGroup();
  }

  /**
   * Recolecta datos estructurados para mostrarlos posteriormente
   * @param {string} category - Categoría de datos ('audios', 'transcriptions', etc.)
   * @param {Object} item - Datos a almacenar
   */
  collect(category, item) {
    if (!this.collectedData[category]) {
      this.collectedData[category] = [];
    }

    this.collectedData[category].push({
      ...item,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Muestra los datos recolectados de una categoría específica
   * @param {string} category - Categoría a mostrar
   * @param {boolean} clear - Si debe limpiar los datos después de mostrarlos
   */
  showCollected(category, clear = false) {
    if (!this.collectedData[category] || this.collectedData[category].length === 0) {
      console.log(`[FB-Chat-Monitor][REPORT] No hay datos en la categoría ${category}`);
      return;
    }

    this.startGroup(`DATOS RECOLECTADOS: ${category.toUpperCase()}`);

    switch (category) {
      case 'audios':
        this._formatAudioData();
        break;
      case 'transcriptions':
        this._formatTranscriptionData();
        break;
      case 'associations':
        this._formatAssociationData();
        break;
      default:
        console.table(this.collectedData[category]);
    }

    this.endGroup();

    if (clear) {
      this.collectedData[category] = [];
    }
  }

  /**
   * Formatea y muestra los datos de audio de manera ordenada
   * @private
   */
  _formatAudioData() {
    // Ordenar por timestamp
    const sortedAudios = [...this.collectedData.audios].sort((a, b) => {
      return a.urlTimestamp - b.urlTimestamp;
    });

    sortedAudios.forEach((audio, idx) => {
      const timestamp = audio.urlTimestamp ? new Date(audio.urlTimestamp).toLocaleString() : 'Desconocido';
      console.log(`[${idx + 1}] URL: ${this._truncateUrl(audio.url)}`);
      console.log(`    Timestamp: ${timestamp}`);
      console.log(`    Tamaño: ${audio.size || 'N/A'} KB`);
      console.log(`    Estado: ${audio.status || 'Detectado'}`);
      if (idx < sortedAudios.length - 1) console.log('');
    });
  }

  /**
   * Formatea y muestra los datos de transcripción de manera ordenada
   * @private
   */
  _formatTranscriptionData() {
    // Ordenar por timestamp
    const sortedTranscriptions = [...this.collectedData.transcriptions].sort((a, b) => {
      return a.urlTimestamp - b.urlTimestamp;
    });

    sortedTranscriptions.forEach((transcription, idx) => {
      const timestamp = transcription.urlTimestamp ? new Date(transcription.urlTimestamp).toLocaleString() : 'Desconocido';
      console.log(`[${idx + 1}] Timestamp: ${timestamp}`);
      console.log(`    Texto: "${transcription.text.substring(0, 70)}${transcription.text.length > 70 ? '...' : ''}"`);
      console.log(`    URL: ${this._truncateUrl(transcription.url)}`);
      console.log(`    Mensaje ID: ${transcription.messageId || 'No asociado'}`);
      if (idx < sortedTranscriptions.length - 1) console.log('');
    });
  }

  /**
   * Formatea y muestra los datos de asociación de manera ordenada
   * @private
   */
  _formatAssociationData() {
    // Ordenar por timestamp de URL
    const sortedAssociations = [...this.collectedData.associations].sort((a, b) => {
      return (a.urlTimestamp || 0) - (b.urlTimestamp || 0);
    });

    console.log(`Total asociaciones: ${sortedAssociations.length}`);

    sortedAssociations.forEach((assoc, idx) => {
      const urlTime = assoc.urlTimestamp ? new Date(assoc.urlTimestamp).toLocaleString() : 'Desconocido';
      console.log(`[${idx + 1}] Mensaje ID: ${assoc.messageId}`);
      console.log(`    Timestamp URL: ${urlTime}`);
      
      // Proteger contra valores undefined en transcription o text
      if (assoc.transcription) {
        console.log(`    Transcripción: "${assoc.transcription.substring(0, 70)}${assoc.transcription.length > 70 ? '...' : ''}"`);
      } else if (assoc.text) {
        console.log(`    Texto: "${assoc.text.substring(0, 70)}${assoc.text.length > 70 ? '...' : ''}"`);
      } else {
        console.log(`    Texto: "[No disponible]"`);
      }
      
      if (idx < sortedAssociations.length - 1) console.log('');
    });
  }

  /**
   * Acorta una URL para mejor visualización
   * @param {string} url - URL completa
   * @returns {string} URL truncada
   * @private
   */
  _truncateUrl(url) {
    if (!url) return 'N/A';

    // Extraer el nombre del archivo y parámetros importantes
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];

    return `.../${filename}${urlObj.search ? '?...' : ''}`;
  }
}

// Crear instancia global
const logManager = new LogManager();
window.logManager = logManager;

// Exponer también como log para acceso más rápido
window.log = logManager;

// Para compatibilidad con código existente, añadir métodos de configuración
window.setLogLevel = function (level) {
  const levelMap = {
    'error': 'minimal',
    'warn': 'minimal',
    'info': 'normal',
    'debug': 'detailed'
  };

  logManager.config.detailLevel = levelMap[level] || 'normal';

  // También configurar el logger existente si está disponible
  if (window.logger && typeof window.logger.setLogLevel === 'function') {
    window.logger.setLogLevel(level);
  }

  return level;
};

// --- Logger Utility ---
const logger = (() => {
  const logs = [];
  const maxLogs = 100;

  function _addLog(logEntry) {
    logs.unshift(logEntry);
    if (logs.length > maxLogs) logs.length = maxLogs;
    if (window.CONFIG?.logging?.saveLogs) _saveLogs();
  }

  function _saveLogs() {
    try {
      localStorage.setItem('FB_CHAT_MONITOR_LOGS', JSON.stringify(logs));
    } catch (e) {
      console.error('Error saving logs to localStorage', e);
    }
  }

  function loadLogs() {
    try {
      const savedLogs = localStorage.getItem('FB_CHAT_MONITOR_LOGS');
      if (savedLogs) {
        logs.splice(0, logs.length, ...JSON.parse(savedLogs));
      }
    } catch (e) {
      console.error('Error loading logs from localStorage', e);
    }
  }

  function log(message, data = {}) {
    const entry = { type: 'INFO', timestamp: new Date().toISOString(), message, data };
    _addLog(entry);
    console.log(`[FB-Chat-Monitor] ${message}`, data);
  }

  function debug(message, data = {}) {
    if (window.CONFIG?.debug) {
      const entry = { type: 'DEBUG', timestamp: new Date().toISOString(), message, data };
      _addLog(entry);
      console.log(`[FB-Chat-Monitor][DEBUG] ${message}`, data);
    }
  }

  /**
   * Registra un mensaje de debug con datos estructurados
   * @param {string} component - Nombre del componente
   * @param {string} message - Mensaje descriptivo
   * @param {any} data - Datos estructurados
   */
  function debugStructured(component, message, data) {
    if (!window.CONFIG?.debug) return;
    
    const entry = { 
      type: 'DEBUG_STRUCTURED', 
      component,
      timestamp: new Date().toISOString(), 
      message, 
      data: typeof data === 'object' ? JSON.stringify(data) : data 
    };
    _addLog(entry);
    
    // Si logManager está disponible, usar su método estructurado
    if (window.logManager && typeof window.logManager.debugStructured === 'function') {
      window.logManager.debugStructured(component, message, data);
    } else {
      console.log(`[FB-Chat-Monitor][${component}][DEBUG] ${message}`);
      console.log(data);
    }
  }

  /**
   * Registra datos de depuración en formato tabla
   * @param {string} title - Título de la tabla
   * @param {Array} data - Datos para mostrar en tabla
   * @param {Array} columns - Columnas a mostrar (opcional)
   */
  function debugTable(title, data, columns = null) {
    if (!window.CONFIG?.debug) return;
    
    const entry = {
      type: 'DEBUG_TABLE',
      timestamp: new Date().toISOString(),
      title,
      data: JSON.stringify(data),
      columns
    };
    _addLog(entry);
    
    if (window.logManager && typeof window.logManager.table === 'function') {
      window.logManager.table(title, data, columns);
    } else {
      console.log(`[FB-Chat-Monitor][TABLE] ${title}`);
      if (columns) {
        // Filtrar datos para mostrar solo las columnas especificadas
        const filteredData = data.map(item => {
          const result = {};
          columns.forEach(col => {
            result[col] = item[col];
          });
          return result;
        });
        console.table(filteredData);
      } else {
        console.table(data);
      }
    }
  }

  /**
   * Agrupa mensajes de log relacionados
   * @param {string} title - Título del grupo
   * @param {Function} groupFunction - Función que contiene los logs a agrupar
   * @param {boolean} collapsed - Si el grupo debe estar colapsado
   */
  function group(title, groupFunction, collapsed = true) {
    if (!window.CONFIG?.debug) {
      // Ejecutar la función pero sin agrupar
      if (typeof groupFunction === 'function') groupFunction();
      return;
    }
    
    const entry = {
      type: 'GROUP',
      timestamp: new Date().toISOString(),
      title
    };
    _addLog(entry);
    
    if (window.logManager && typeof window.logManager.startGroup === 'function') {
      window.logManager.startGroup(title, collapsed);
      if (typeof groupFunction === 'function') groupFunction();
      window.logManager.endGroup();
    } else {
      // Fallback si logManager no está disponible
      if (collapsed) {
        console.groupCollapsed(`[FB-Chat-Monitor] ${title}`);
      } else {
        console.group(`[FB-Chat-Monitor] ${title}`);
      }
      if (typeof groupFunction === 'function') groupFunction();
      console.groupEnd();
    }
  }

  function error(message, data = {}, error = null) {
    const entry = {
      type: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      data,
      stack: error?.stack || new Error().stack
    };
    _addLog(entry);
    console.error(`[FB-Chat-Monitor][ERROR] ${message}`, data, error);
  }

  function warn(message, data = {}) {
    const entry = { type: 'WARN', timestamp: new Date().toISOString(), message, data };
    _addLog(entry);
    console.warn(`[FB-Chat-Monitor][WARN] ${message}`, data);
  }

  function notify(message, type = 'info', options = {}) {
    // Log notification
    const entry = {
      type: 'NOTIFICATION',
      notificationType: type,
      timestamp: new Date().toISOString(),
      message
    };
    _addLog(entry);

    // Visual notification
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '10px 15px',
      color: 'white',
      borderRadius: '5px',
      zIndex: '9999',
      opacity: '0.9',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      transition: 'all 0.3s ease',
      maxWidth: '80%',
      wordBreak: 'break-word'
    });

    const icons = {
      success: '✓',
      error: '⚠️',
      warning: '⚠',
      info: 'ℹ'
    };
    const bgColors = {
      success: '#4CAF50',
      error: '#f44336',
      warning: '#ff9800',
      info: '#2196F3'
    };
    div.style.backgroundColor = bgColors[type] || bgColors.info;
    div.innerHTML = `<span style="margin-right:8px;">${icons[type] || icons.info}</span>${message}`;

    // Close button
    const closeBtn = document.createElement('span');
    Object.assign(closeBtn.style, {
      marginLeft: '10px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '18px'
    });
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => document.body.removeChild(div);
    div.appendChild(closeBtn);

    // Optional buttons
    if (options.buttons && Array.isArray(options.buttons)) {
      const buttonContainer = document.createElement('div');
      Object.assign(buttonContainer.style, {
        marginTop: '10px',
        display: 'flex',
        gap: '10px'
      });
      options.buttons.forEach(btnConfig => {
        if (btnConfig.text && typeof btnConfig.action === 'function') {
          const btn = document.createElement('button');
          btn.textContent = btnConfig.text;
          Object.assign(btn.style, {
            padding: '5px 10px',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            backgroundColor: btnConfig.color || '#fff',
            color: btnConfig.textColor || '#333'
          });
          btn.onclick = () => {
            btnConfig.action();
            if (btnConfig.closeOnClick !== false) document.body.removeChild(div);
          };
          buttonContainer.appendChild(btn);
        }
      });
      div.appendChild(buttonContainer);
    }

    // Optional countdown timer
    if (options.timeoutSeconds) {
      const timerSpan = document.createElement('span');
      timerSpan.className = 'countdown';
      timerSpan.textContent = options.timeoutSeconds;
      Object.assign(timerSpan.style, {
        marginLeft: '8px',
        padding: '2px 6px',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: '10px'
      });
      div.appendChild(timerSpan);
    }

    document.body.appendChild(div);

    // Auto-hide
    const timeout = options.duration || 5000;
    setTimeout(() => {
      if (document.body.contains(div)) {
        div.style.opacity = '0';
        setTimeout(() => {
          if (document.body.contains(div)) document.body.removeChild(div);
        }, 300);
      }
    }, timeout);

    return div;
  }

  function getAllLogs() {
    return [...logs];
  }

  function getLogsByType(type) {
    return logs.filter(log => log.type === type);
  }

  function clearLogs() {
    logs.length = 0;
    try {
      localStorage.removeItem('FB_CHAT_MONITOR_LOGS');
    } catch (e) {
      console.error('Error clearing logs from localStorage', e);
    }
  }
  /**
   * Establece el nivel de detalle de los logs
   * @param {string} level - Nivel de log ('debug', 'info', 'warn', 'error')
   * @returns {string} El nivel establecido
   */
  function setLogLevel(level) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    const normalizedLevel = level?.toLowerCase();

    if (!normalizedLevel || !validLevels.includes(normalizedLevel)) {
      warn(`Nivel de log inválido: ${level}. Usando 'info'`);
      window.CONFIG = window.CONFIG || {};
      window.CONFIG.logLevel = 'info';
      window.CONFIG.debug = false;
      return 'info';
    }

    // Actualizar configuración
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.logLevel = normalizedLevel;

    // Habilitar/deshabilitar modo debug
    window.CONFIG.debug = normalizedLevel === 'debug';

    log(`Nivel de log establecido a: ${normalizedLevel}`);
    return normalizedLevel;
  }

  /**
   * Registra un paso principal del proceso
   * @param {string} phase - Fase del proceso (ej: 'EXTRACTION', 'ASSOCIATION')
   * @param {string} message - Mensaje descriptivo
   * @param {Object} data - Datos adicionales (opcional)
   */
  function process(phase, message, data = {}) {
    const formattedPhase = phase.toUpperCase();
    const entry = {
      type: 'PROCESS',
      phase: formattedPhase,
      timestamp: new Date().toISOString(),
      message,
      data
    };
    _addLog(entry);

    console.log(`[FB-Chat-Monitor][${formattedPhase}] ${message}`, data);
  }

  /**
   * Registra un subpaso de un proceso principal
   * @param {string} phase - Fase principal (ej: 'EXTRACTION', 'ASSOCIATION')
   * @param {string} step - Identificador del subpaso
   * @param {string} message - Mensaje descriptivo
   * @param {Object} data - Datos adicionales (opcional)
   */
  function substep(phase, step, message, data = {}) {
    const formattedPhase = phase.toUpperCase();
    const formattedStep = step.toUpperCase();

    const entry = {
      type: 'SUBSTEP',
      phase: formattedPhase,
      step: formattedStep,
      timestamp: new Date().toISOString(),
      message,
      data
    };
    _addLog(entry);

    console.log(`[FB-Chat-Monitor][${formattedPhase}][${formattedStep}] ${message}`,
      Object.keys(data).length > 0 ? data : '');
  }

  return {
    log,
    debug,
    debugStructured,
    debugTable,
    group,
    error,
    warn,
    process,
    substep,
    notify,
    loadLogs,
    getAllLogs,
    getLogsByType,
    clearLogs,
    setLogLevel
  };
})();

// --- DOM Utility ---
const domUtils = (() => {
  function findElement(selectors, parent = document) {
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of arr) {
      try {
        const el = parent.querySelector(selector);
        if (el) return el;
      } catch (e) {
        logger.debug(`Error with selector "${selector}": ${e.message}`);
      }
    }
    return null;
  }

  function findAllElements(selector, parent = document) {
    try {
      return [...parent.querySelectorAll(selector)];
    } catch (e) {
      logger.debug(`Error with selector "${selector}": ${e.message}`);
      return [];
    }
  }

  function waitForElement(selectors, timeout = window.CONFIG?.waitElementTimeout || 5000) {
    return new Promise((resolve, reject) => {
      const arr = Array.isArray(selectors) ? selectors : [selectors];
      let elapsed = 0;
      const checkInterval = 100;
      function check() {
        for (const selector of arr) {
          try {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
          } catch { }
        }
        elapsed += checkInterval;
        if (elapsed >= timeout) return reject(new Error(`Timeout waiting for elements: ${JSON.stringify(arr)}`));
        setTimeout(check, checkInterval);
      }
      check();
    });
  }

  function scrollToTop(container, maxAttempts = 10) {
    return new Promise(resolve => {
      let lastScrollHeight = container.scrollHeight;
      let noChangeCount = 0, attempts = 0;
      function scrollStep() {
        container.scrollTop = 0;
        setTimeout(() => {
          attempts++;
          if (container.scrollHeight === lastScrollHeight) {
            noChangeCount++;
            if (noChangeCount >= 3 || attempts >= maxAttempts) return resolve({ success: true, fullyScrolled: true });
          } else {
            noChangeCount = 0;
            lastScrollHeight = container.scrollHeight;
          }
          scrollStep();
        }, 300);
      }
      scrollStep();
    });
  }

  function scrollToBottom(container) {
    return new Promise(resolve => {
      if (!container) return resolve(false);
      container.scrollTop = container.scrollHeight;
      setTimeout(() => resolve(true), 100);
    });
  }

  function injectStyles(stylesContent) {
    const styleElement = document.createElement('style');
    styleElement.textContent = stylesContent;
    document.head.appendChild(styleElement);
    return styleElement;
  }

  function insertTextIntoField(field, text) {
    if (!field || !text) return false;
    try {
      const isContentEditable = field.getAttribute('contenteditable') === 'true';
      if (isContentEditable) {
        field.innerHTML = '';
        field.focus();
        const success = document.execCommand('insertText', false, text);
        if (!success) {
          field.textContent = text;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        field.value = text;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      field.innerText = text;
      return true;
    } catch (error) {
      logger.error(`Error inserting text into field: ${error.message}`);
      return false;
    }
  }

  function simulateKeyPress(element, key = 'Enter', keyCode = 13) {
    if (!element) return false;
    try {
      element.focus();
      const eventTypes = ['keydown', 'keypress', 'keyup'];
      let success = true;
      eventTypes.forEach(eventType => {
        const event = new KeyboardEvent(eventType, {
          key,
          code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
          view: window
        });
        if (!element.dispatchEvent(event)) success = false;
      });
      logger.debug(`Simulación de tecla ${key} ${success ? 'exitosa' : 'con problemas'}`);
      return success;
    } catch (error) {
      logger.error(`Error simulando tecla ${key}: ${error.message}`);
      return false;
    }
  }

  return {
    findElement,
    findAllElements,
    waitForElement,
    scrollToTop,
    scrollToBottom,
    injectStyles,
    insertTextIntoField,
    simulateKeyPress
  };
})();

// --- Storage Utility ---
const storageUtils = (() => {
  function set(key, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
      if (typeof localStorage !== 'undefined') {
        const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
        localStorage.setItem(key, valueToStore);
      }
      return true;
    } catch (e) {
      logger.error(`Error storing data: ${e.message}`, { key });
      return false;
    }
  }

  function get(key, defaultValue = null) {
    try {
      if (typeof GM_getValue === 'function') {
        const gmValue = GM_getValue(key, undefined);
        if (gmValue !== undefined) return gmValue;
      }
      if (typeof localStorage !== 'undefined') {
        const lsValue = localStorage.getItem(key);
        if (lsValue !== null) {
          try {
            return JSON.parse(lsValue);
          } catch {
            return lsValue;
          }
        }
      }
      return defaultValue;
    } catch (e) {
      logger.error(`Error retrieving data: ${e.message}`, { key });
      return defaultValue;
    }
  }

  function remove(key) {
    try {
      if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return true;
    } catch (e) {
      logger.error(`Error removing data: ${e.message}`, { key });
      return false;
    }
  }

  function migrateSettings() {
    logger.debug('Running settings migration check...');
    const keysToMigrate = [
      'FB_CHAT_MONITOR_OPENAI_KEY',
      'FB_CHAT_MONITOR_AI_MODEL',
      'FB_CHAT_MONITOR_SELLER_ASSISTANT_ID',
      'FB_CHAT_MONITOR_BUYER_ASSISTANT_ID',
      'FB_CHAT_MONITOR_DEFAULT_ASSISTANT_ID',
      'FB_CHAT_MONITOR_OPERATION_MODE',
      'FB_CHAT_MONITOR_SELLER_ASSISTANT_NAME',
      'FB_CHAT_MONITOR_BUYER_ASSISTANT_NAME',
      'FB_CHAT_MONITOR_SELLER_INSTRUCTIONS',
      'FB_CHAT_MONITOR_BUYER_INSTRUCTIONS',
      'FB_CHAT_MONITOR_AI_TEMP'
    ];
    let migratedCount = 0;
    if (typeof GM_setValue === 'function' && typeof localStorage !== 'undefined') {
      keysToMigrate.forEach(key => {
        const localValue = localStorage.getItem(key);
        if (localValue !== null && GM_getValue(key, undefined) === undefined) {
          let valueToStore = localValue;
          try { valueToStore = JSON.parse(localValue); } catch { }
          GM_setValue(key, valueToStore);
          migratedCount++;
          logger.debug(`Migrated ${key} from localStorage to GM_storage`);
        }
      });
    }
    if (migratedCount > 0) logger.log(`Settings migration complete: ${migratedCount} items migrated`);
    else logger.debug('No settings needed migration');
    return migratedCount;
  }

  function checkStorageHealth() {
    const gmStorageAvailable = (typeof GM_setValue === 'function' && typeof GM_getValue === 'function');
    const localStorageAvailable = typeof localStorage !== 'undefined';
    logger.debug(`Storage availability: GM_storage=${gmStorageAvailable}, localStorage=${localStorageAvailable}`);
    if (!gmStorageAvailable && !localStorageAvailable) {
      logger.error('No storage mechanisms available. Data persistence will not work.');
      return false;
    }
    try {
      const testKey = 'STORAGE_TEST_' + Date.now();
      const testValue = 'test_' + Date.now();
      set(testKey, testValue);
      const readValue = get(testKey, null);
      if (readValue !== testValue) {
        logger.error('Storage verification failed: write/read mismatch');
        return false;
      }
      remove(testKey);
      logger.debug('Storage health check passed successfully');
      return true;
    } catch (e) {
      logger.error('Storage health check failed', e);
      return false;
    }
  }

  return { set, get, remove, migrateSettings, checkStorageHealth };
})();

// --- User Activity Tracker ---
const userActivityTracker = (() => {
  let isActive = false;
  let lastActivity = Date.now();
  const listeners = [];

  function recordActivity() {
    const wasInactive = !isActive;
    isActive = true;
    lastActivity = Date.now();
    if (wasInactive) notifyListeners();
  }

  function checkInactivity() {
    const now = Date.now();
    if (now - lastActivity > 5 * 60 * 1000 && isActive) {
      isActive = false;
      notifyListeners();
    }
  }

  function onActivityChange(callback) {
    if (typeof callback === 'function') listeners.push(callback);
  }

  function notifyListeners() {
    listeners.forEach(listener => {
      try { listener(isActive, lastActivity); }
      catch (error) { logger.error('Error in activity listener', {}, error); }
    });
  }

  function initialize() {
    document.addEventListener('mousemove', recordActivity);
    document.addEventListener('keydown', recordActivity);
    document.addEventListener('click', recordActivity);
    setInterval(checkInactivity, 60000);
    logger.debug('User activity tracker initialized');
  }

  return { initialize, onActivityChange, get isActive() { return isActive; }, get lastActivity() { return lastActivity; } };
})();

// --- Retry Utility ---
const retryUtils = {
  async withExponentialBackoff(operation, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      factor = 2,
      jitter = 0.1,
    } = options;
    let attempt = 0, lastError = null;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt > maxRetries) {
          logger.error(`Operation failed after ${maxRetries} retries`, {}, error);
          throw error;
        }
        const delay = Math.min(baseDelay * Math.pow(factor, attempt - 1), maxDelay);
        const jitterAmount = delay * jitter;
        const finalDelay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
        logger.debug(`Retry attempt ${attempt} after ${Math.round(finalDelay)}ms`);
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
    throw lastError;
  }
};

// --- Time Utility ---
const timeUtils = {
  formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date);
  },
  getRelativeTime(timestamp) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const now = Date.now();
    const diff = timestamp - now;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (Math.abs(days) > 0) return rtf.format(days, 'day');
    if (Math.abs(hours) > 0) return rtf.format(hours, 'hour');
    if (Math.abs(minutes) > 0) return rtf.format(minutes, 'minute');
    return rtf.format(seconds, 'second');
  },
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// --- Page Utility ---
const pageUtils = {
  isMarketplaceMessenger() {
    const url = window.location.href;
    return url.includes('facebook.com/messages') || url.includes('messenger.com');
  },
  redirectToMarketplace() {
    if (window.location.href.includes('messenger.com') && !window.location.href.includes('marketplace')) {
      window.location.href = 'https://www.facebook.com/messages/t/marketplace';
      return true;
    }
    return false;
  }
};

// --- General Utility Functions ---
function showSimpleAlert(message, type = 'info', options = {}) {
  return logger.notify(message, type, options);
}
async function delay(ms) {
  return timeUtils.sleep(ms);
}
function insertTextDirectly(inputField, text) {
  return domUtils.insertTextIntoField(inputField, text);
}

// --- Initialization ---
logger.loadLogs();
userActivityTracker.initialize();

// --- Expose Utilities ---
window.logger = logger;
window.domUtils = domUtils;
window.storageUtils = storageUtils;
window.userActivityTracker = userActivityTracker;
window.retryUtils = retryUtils;
window.timeUtils = timeUtils;
window.pageUtils = pageUtils;
window.showSimpleAlert = showSimpleAlert;
window.delay = delay;
window.insertTextDirectly = insertTextDirectly;