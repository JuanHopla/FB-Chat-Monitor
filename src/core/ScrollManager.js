/**
 * ScrollManager - Sistema inteligente para gestión de scroll en conversaciones
 * 
 * Responsibilities:
 * - Realizar scroll a inicio de conversación para hilos nuevos
 * - Realizar scroll parcial hasta último mensaje conocido para hilos existentes
 * - Mantener la posición actual y poder restaurarla
 * - Notificar eventos de scroll para coordinar con otros componentes
 */
class ScrollManager {
  constructor() {
    this.SCROLL_CONTAINER_SELECTOR = CONFIG.selectors?.activeChat?.scrollbar || 
      'div[style*="overflow-y: auto"][style*="height"]';
    
    this.options = {
      scrollPauseMs: 300,       // Pausa entre iteraciones de scroll
      maxAttempts: 25,          // Intentos máximos para scroll
      noChangeThreshold: 3,     // Cuántas iteraciones sin cambios indican fin
      smoothScrollToPosition: true, // Activar scroll suave al restaurar posición
      detectLoadingIndicator: true, // Detectar indicadores de carga
    };

    this.eventListeners = {
      beforeScroll: [],
      duringScroll: [],
      afterScroll: [],
      scrollToBeginning: [],
      scrollToMessage: [],
      scrollPositionRestored: []
    };

    this.state = {
      originalPosition: null,
      isScrolling: false,
      scrollDirection: null,
      lastScrollHeight: 0,
      scrollAttempts: 0,
      consecutiveNoChange: 0
    };
    
    // Observable para otros componentes
    this._scrollObservable = null;
  }

  /**
   * Realiza scroll hasta el inicio de la conversación
   * @param {Object} options - Opciones adicionales 
   * @returns {Promise<Object>} Resultado de la operación
   */
  async scrollToBeginning(options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      console.error('[ScrollManager] No se encontró contenedor de scroll');
      return { success: false, error: 'No scroll container found' };
    }

    // Fusionar opciones
    const scrollOptions = { ...this.options, ...options };
    
    // Guardar posición original
    this.state.originalPosition = container.scrollTop;
    this.state.isScrolling = true;
    this.state.scrollDirection = 'up';
    this.state.lastScrollHeight = container.scrollHeight;
    this.state.scrollAttempts = 0;
    this.state.consecutiveNoChange = 0;
    
    // Notificar inicio de scroll
    this._notifyEvent('beforeScroll', { direction: 'up', type: 'beginning' });
    console.log('[ScrollManager] Iniciando scroll hacia el principio de la conversación');

    try {
      // Empezar proceso de scroll
      while (this.state.scrollAttempts < scrollOptions.maxAttempts) {
        this.state.scrollAttempts++;
        const prevScrollHeight = this.state.lastScrollHeight;
        const prevScrollTop = container.scrollTop;
        
        // Realizar scroll hacia arriba
        container.scrollTop = 0;
        
        // Esperar para que carguen los mensajes
        await new Promise(resolve => setTimeout(resolve, scrollOptions.scrollPauseMs));
        
        // Verificar cambios
        const currentScrollHeight = container.scrollHeight;
        const currentScrollTop = container.scrollTop;
        
        // Notificar durante el scroll (para que otros componentes puedan procesar elementos)
        if (scrollOptions.onScroll && typeof scrollOptions.onScroll === 'function') {
          scrollOptions.onScroll({
            attempt: this.state.scrollAttempts,
            maxAttempts: scrollOptions.maxAttempts,
            heightChange: currentScrollHeight - prevScrollHeight,
            direction: 'up'
          });
        }
        
        this._notifyEvent('duringScroll', {
          attempt: this.state.scrollAttempts,
          maxAttempts: scrollOptions.maxAttempts,
          heightChange: currentScrollHeight - prevScrollHeight,
          scrollPosition: currentScrollTop
        });
        
        // Detectar fin del scroll
        if (currentScrollTop === 0 && 
            (prevScrollHeight === currentScrollHeight || currentScrollTop === prevScrollTop)) {
          this.state.consecutiveNoChange++;
          
          // Si tenemos varios intentos sin cambios, asumimos que llegamos al inicio
          if (this.state.consecutiveNoChange >= scrollOptions.noChangeThreshold) {
            console.log('[ScrollManager] Llegamos al inicio de la conversación');
            break;
          }
        } else {
          this.state.consecutiveNoChange = 0;
        }
        
        this.state.lastScrollHeight = currentScrollHeight;
      }
      
      // Verificar resultado
      const scrolledToBeginning = (container.scrollTop === 0);
      console.log(`[ScrollManager] Scroll completado en ${this.state.scrollAttempts} intentos. Llegó al inicio: ${scrolledToBeginning}`);
      
      this._notifyEvent('scrollToBeginning', {
        success: true,
        attempts: this.state.scrollAttempts,
        reachedBeginning: scrolledToBeginning
      });
      
      return { 
        success: true, 
        reachedBeginning: scrolledToBeginning,
        attempts: this.state.scrollAttempts
      };
    } catch (error) {
      console.error('[ScrollManager] Error durante scroll al inicio:', error);
      return { 
        success: false, 
        error: error.message 
      };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'up', type: 'beginning' });
    }
  }

  /**
   * Restaura la posición de scroll guardada
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado de la operación
   */
  async restorePosition(options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      console.error('[ScrollManager] No se encontró contenedor de scroll');
      return { success: false, error: 'No scroll container found' };
    }

    // Fusionar opciones
    const scrollOptions = { ...this.options, ...options };
    this.state.isScrolling = true;
    this.state.scrollDirection = 'down';
    
    // MEJORA: Si estamos restaurando posición en un hilo nuevo, 
    // verificar si queremos ir al final de la conversación
    const goToBottom = options.scrollToBottom === true || 
                      (this.state.originalPosition === null && options.scrollToBottom !== false);
    
    if (goToBottom) {
      console.log(`[ScrollManager] Haciendo scroll al final de la conversación`);
      container.scrollTop = container.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 100));
      return { success: true, scrolledToBottom: true };
    }
    
    if (this.state.originalPosition === null) {
      console.error('[ScrollManager] No se puede restaurar posición original (null)');
      return { success: false, error: 'Cannot restore position, original position is null' };
    }
    
    console.log(`[ScrollManager] Restaurando posición a ${this.state.originalPosition}`);
    
    try {
      // Si scroll suave está activado, hacerlo en pasos
      if (scrollOptions.smoothScrollToPosition) {
        const currentPosition = container.scrollTop;
        const targetPosition = this.state.originalPosition;
        const distance = targetPosition - currentPosition;
        const steps = 15; // Número de pasos para el scroll suave
        
        for (let i = 1; i <= steps; i++) {
          const nextPosition = currentPosition + (distance * i / steps);
          container.scrollTop = nextPosition;
          await new Promise(resolve => setTimeout(resolve, 15));
        }
      } else {
        // Scroll instantáneo
        container.scrollTop = this.state.originalPosition;
      }
      
      // MEJORA: Verificar que realmente llegamos a la posición deseada
      await new Promise(resolve => setTimeout(resolve, 100));
      const finalPosition = container.scrollTop;
      const targetReached = Math.abs(finalPosition - this.state.originalPosition) < 50;
      
      this._notifyEvent('scrollPositionRestored', {
        originalPosition: this.state.originalPosition,
        currentPosition: finalPosition,
        targetReached
      });
      
      return { 
        success: true,
        restoredPosition: finalPosition,
        originalPosition: this.state.originalPosition,
        targetReached
      };
    } catch (error) {
      console.error('[ScrollManager] Error restaurando posición:', error);
      return { success: false, error: error.message };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'down', type: 'restore' });
    }
  }

  /**
   * Realiza scroll hasta un mensaje específico (por ID o elemento)
   * @param {string|HTMLElement} messageTarget - ID del mensaje o elemento
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado de la operación
   */
  async scrollToMessage(messageTarget, options = {}) {
    const container = this._getScrollContainer();
    if (!container) {
      return { success: false, error: 'No scroll container found' };
    }
    
    // Guardar posición original
    this.state.originalPosition = container.scrollTop;
    this.state.isScrolling = true;
    
    // Fusionar opciones
    const scrollOptions = { ...this.options, ...options };
    
    try {
      let targetElement;
      
      // Determinar el elemento target
      if (typeof messageTarget === 'string') {
        // Es un ID de mensaje, buscar el elemento
        targetElement = document.querySelector(`[data-message-id="${messageTarget}"], [id="${messageTarget}"]`);
      } else if (messageTarget instanceof HTMLElement) {
        // Ya es un elemento HTML
        targetElement = messageTarget;
      }
      
      if (!targetElement) {
        console.log(`[ScrollManager] Mensaje target no encontrado, buscando por scroll...`);
        
        // Si no se encontró el elemento, hacer scroll iterativo para buscar
        const result = await this._searchMessageByScroll(messageTarget, scrollOptions);
        return result;
      }
      
      // Notificar inicio de scroll
      this._notifyEvent('beforeScroll', { direction: 'to-message', messageTarget });
      
      console.log(`[ScrollManager] Scroll a mensaje específico`);
      
      // Hacer scroll al elemento
      targetElement.scrollIntoView({
        behavior: scrollOptions.smoothScrollToPosition ? 'smooth' : 'auto',
        block: 'center'
      });
      
      // Esperar a que termine el scroll
      await new Promise(resolve => setTimeout(resolve, 300));
      
      this._notifyEvent('scrollToMessage', {
        success: true,
        messageTarget,
        found: true
      });
      
      return { success: true, found: true };
    } catch (error) {
      console.error('[ScrollManager] Error en scrollToMessage:', error);
      return { success: false, error: error.message };
    } finally {
      this.state.isScrolling = false;
      this._notifyEvent('afterScroll', { direction: 'to-message', messageTarget });
    }
  }

  /**
   * Busca un mensaje haciendo scroll progresivo
   * @param {string} messageId - ID del mensaje a buscar
   * @param {Object} options - Opciones de scroll
   * @returns {Promise<Object>} Resultado de la búsqueda
   * @private
   */
  async _searchMessageByScroll(messageId, options) {
    const container = this._getScrollContainer();
    
    this.state.scrollAttempts = 0;
    this.state.consecutiveNoChange = 0;
    this.state.lastScrollHeight = container.scrollHeight;
    
    // Empezar con scroll hacia arriba
    while (this.state.scrollAttempts < options.maxAttempts) {
      this.state.scrollAttempts++;
      const prevScrollHeight = this.state.lastScrollHeight;
      
      // Hacer scroll hacia arriba en incrementos
      container.scrollTop = container.scrollTop - (container.clientHeight * 0.2);
      
      // Esperar para que carguen mensajes
      await new Promise(resolve => setTimeout(resolve, options.scrollPauseMs));
      
      // Verificar cambios
      const currentScrollHeight = container.scrollHeight;
      
      // Buscar el mensaje después de cada scroll
      const targetElement = document.querySelector(`[data-message-id="${messageId}"], [id="${messageId}"]`);
      if (targetElement) {
        console.log(`[ScrollManager] Mensaje encontrado después de ${this.state.scrollAttempts} intentos`);
        
        // Hacer scroll al elemento
        targetElement.scrollIntoView({
          behavior: options.smoothScrollToPosition ? 'smooth' : 'auto',
          block: 'center'
        });
        
        this._notifyEvent('scrollToMessage', {
          success: true,
          messageId,
          found: true,
          attempts: this.state.scrollAttempts
        });
        
        return { success: true, found: true, attempts: this.state.scrollAttempts };
      }
      
      // Notificar durante el scroll
      if (options.onScroll && typeof options.onScroll === 'function') {
        options.onScroll({
          attempt: this.state.scrollAttempts,
          maxAttempts: options.maxAttempts,
          heightChange: currentScrollHeight - prevScrollHeight,
          direction: 'up',
          searching: true
        });
      }
      
      this._notifyEvent('duringScroll', {
        attempt: this.state.scrollAttempts,
        maxAttempts: options.maxAttempts,
        heightChange: currentScrollHeight - prevScrollHeight,
        direction: 'up',
        searching: true
      });
      
      // Detectar fin del scroll
      if (container.scrollTop <= 0 || 
          (prevScrollHeight === currentScrollHeight && this.state.consecutiveNoChange >= 2)) {
        console.log('[ScrollManager] Llegamos al límite de scroll sin encontrar el mensaje');
        break;
      }
      
      if (prevScrollHeight === currentScrollHeight) {
        this.state.consecutiveNoChange++;
      } else {
        this.state.consecutiveNoChange = 0;
      }
      
      this.state.lastScrollHeight = currentScrollHeight;
    }
    
    console.log(`[ScrollManager] Mensaje no encontrado después de ${this.state.scrollAttempts} intentos`);
    
    this._notifyEvent('scrollToMessage', {
      success: true,
      messageId,
      found: false,
      attempts: this.state.scrollAttempts
    });
    
    return { success: true, found: false, attempts: this.state.scrollAttempts };
  }

  /**
   * Obtiene el contenedor de scroll
   * @returns {HTMLElement|null} Elemento contenedor de scroll
   * @private
   */
  _getScrollContainer() {
    // Intentar múltiples selectores
    const selectors = Array.isArray(this.SCROLL_CONTAINER_SELECTOR) 
      ? this.SCROLL_CONTAINER_SELECTOR 
      : this.SCROLL_CONTAINER_SELECTOR.split(',').map(s => s.trim());
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    
    // Fallback: buscar cualquier contenedor con overflow-y: auto
    return document.querySelector('div[style*="overflow-y: auto"]');
  }

  /**
   * Notifica un evento a los listeners registrados
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos del evento
   * @private
   */
  _notifyEvent(eventName, data = {}) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[ScrollManager] Error en listener de ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Añade un listener para un evento específico
   * @param {string} eventName - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   * @returns {Function} Función para remover el listener
   */
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    
    this.eventListeners[eventName].push(callback);
    
    // Devolver función para eliminar listener
    return () => this.off(eventName, callback);
  }

  /**
   * Elimina un listener específico
   * @param {string} eventName - Nombre del evento
   * @param {Function} callback - Función a eliminar
   */
  off(eventName, callback) {
    if (!this.eventListeners[eventName]) return;
    
    const index = this.eventListeners[eventName].indexOf(callback);
    if (index !== -1) {
      this.eventListeners[eventName].splice(index, 1);
    }
  }
}

// Create global singleton instance
const scrollManager = new ScrollManager();

// Expose globally
window.scrollManager = scrollManager;
