/**
 * EventCoordinator - Sistema centralizado de eventos para coordinar componentes
 * 
 * Responsibilities:
 * - Coordinar eventos entre distintos componentes
 * - Proporcionar un bus de eventos unificado
 * - Permitir comunicación desacoplada
 * - Facilitar diagnóstico de flujos
 */
class EventCoordinator {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistoryLength = 100;
    this.debug = true;
  }

  /**
   * Registra un listener para un evento
   * @param {string} eventName - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   * @returns {Object} Objeto con método para cancelar suscripción
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    
    this.listeners.get(eventName).add(callback);
    
    // Devolver objeto con método de cancelación
    return {
      unsubscribe: () => this.off(eventName, callback)
    };
  }

  /**
   * Elimina un listener
   * @param {string} eventName - Nombre del evento
   * @param {Function} callback - Función a eliminar
   */
  off(eventName, callback) {
    if (!this.listeners.has(eventName)) return;
    
    this.listeners.get(eventName).delete(callback);
    
    // Eliminar el set si está vacío
    if (this.listeners.get(eventName).size === 0) {
      this.listeners.delete(eventName);
    }
  }

  /**
   * Emite un evento
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos asociados al evento
   */
  emit(eventName, data = {}) {
    // Registrar evento en historial
    this.recordEvent(eventName, data);
    
    // Log de depuración
    if (this.debug) {
      console.log(`[EventCoordinator] Evento emitido: ${eventName}`, data);
    }
    
    // Notificar a los listeners
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventCoordinator] Error en listener de ${eventName}:`, error);
        }
      });
    }
    
    // También notificar a los listeners de '*' (todos los eventos)
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => {
        try {
          callback({ event: eventName, data });
        } catch (error) {
          console.error(`[EventCoordinator] Error en listener global:`, error);
        }
      });
    }
  }

  /**
   * Registra un evento en el historial
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos del evento
   * @private
   */
  recordEvent(eventName, data) {
    this.eventHistory.unshift({
      event: eventName,
      data,
      timestamp: Date.now()
    });
    
    // Mantener el historial limitado
    if (this.eventHistory.length > this.maxHistoryLength) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistoryLength);
    }
  }

  /**
   * Obtiene el historial de eventos
   * @param {Object} options - Opciones de filtrado
   * @returns {Array} Historial de eventos filtrado
   */
  getEventHistory(options = {}) {
    let events = [...this.eventHistory];
    
    // Aplicar filtros
    if (options.eventName) {
      events = events.filter(e => e.event === options.eventName);
    }
    
    if (options.timeRange) {
      const now = Date.now();
      events = events.filter(e => (now - e.timestamp) <= options.timeRange);
    }
    
    if (options.limit) {
      events = events.slice(0, options.limit);
    }
    
    return events;
  }

  /**
   * Emite un evento una vez que se cumplen ciertas condiciones
   * @param {string} eventName - Nombre del evento a emitir
   * @param {Array<Object>} conditions - Condiciones a cumplir
   * @param {Object} eventData - Datos a incluir en el evento
   * @param {Object} options - Opciones adicionales
   * @returns {Object} Objeto con método para cancelar
   */
  emitWhen(eventName, conditions, eventData = {}, options = {}) {
    const pendingEvents = new Set();
    const completedEvents = new Set();
    const timeout = options.timeout || 30000;
    
    // Convertir condiciones en un array si no lo es
    const conditionsArray = Array.isArray(conditions) ? conditions : [conditions];
    
    // Registrar cada condición
    const subscriptions = conditionsArray.map(condition => {
      pendingEvents.add(condition.event);
      
      return this.on(condition.event, (data) => {
        // Verificar si cumple la condición
        if (!condition.check || condition.check(data)) {
          pendingEvents.delete(condition.event);
          completedEvents.add(condition.event);
          
          // Si se cumplieron todas las condiciones, emitir evento
          if (pendingEvents.size === 0) {
            this.emit(eventName, { ...eventData, triggeredBy: Array.from(completedEvents) });
            // Cancelar todas las suscripciones
            subscriptions.forEach(sub => sub.unsubscribe());
          }
        }
      });
    });
    
    // Configurar timeout
    const timeoutId = setTimeout(() => {
      if (pendingEvents.size > 0) {
        // Emitir evento de timeout
        this.emit(`${eventName}.timeout`, {
          pending: Array.from(pendingEvents),
          completed: Array.from(completedEvents)
        });
        // Cancelar todas las suscripciones
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    }, timeout);
    
    // Devolver objeto para cancelar
    return {
      unsubscribe: () => {
        clearTimeout(timeoutId);
        subscriptions.forEach(sub => sub.unsubscribe());
      }
    };
  }
}

// Create global singleton instance
const eventCoordinator = new EventCoordinator();

// Expose globally
window.eventCoordinator = eventCoordinator;
