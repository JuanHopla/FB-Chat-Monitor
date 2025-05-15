// ----- UTILITIES -----

    // Enhanced logging system with structured logs
    const logger = {
      logs: [],
      maxLogs: 100,

      log(message, data = {}) {
        const logEntry = {
          type: 'INFO',
          timestamp: new Date().toISOString(),
          message,
          data
        };
        this._addLog(logEntry);
        console.log(`[FB-Chat-Monitor] ${message}`, data);
      },

      debug(message, data = {}) {
        if (CONFIG.debug) {
          const logEntry = {
            type: 'DEBUG',
            timestamp: new Date().toISOString(),
            message,
            data
          };
          this._addLog(logEntry);
          console.log(`[FB-Chat-Monitor][DEBUG] ${message}`, data);
        }
      },

      error(message, data = {}, error = null) {
        const logEntry = {
          type: 'ERROR',
          timestamp: new Date().toISOString(),
          message,
          data,
          stack: error?.stack || new Error().stack
        };
        this._addLog(logEntry);
        console.error(`[FB-Chat-Monitor][ERROR] ${message}`, data, error);
      },

      warn(message, data = {}) {
        const logEntry = {
          type: 'WARN',
          timestamp: new Date().toISOString(),
          message,
          data
        };
        this._addLog(logEntry);
        console.warn(`[FB-Chat-Monitor][WARN] ${message}`, data);
      },

      notify(message, type = 'success', options = {}) {
        // Log the notification
        const logEntry = {
          type: 'NOTIFICATION',
          notificationType: type,
          timestamp: new Date().toISOString(),
          message
        };
        this._addLog(logEntry);

        // Visual notification
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.padding = '10px 15px';
        div.style.color = 'white';
        div.style.borderRadius = '5px';
        div.style.zIndex = '9999';
        div.style.opacity = '0.9';
        div.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        div.style.fontFamily = 'Arial, sans-serif';
        div.style.fontSize = '14px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.transition = 'all 0.3s ease';
        div.style.maxWidth = '80%';
        div.style.wordBreak = 'break-word';

        // Different styles for different notification types
        if (type === 'success') {
          div.style.backgroundColor = '#4CAF50';
          div.innerHTML = `<span style="margin-right:8px;">✓</span>${message}`;
        } else if (type === 'error') {
          div.style.backgroundColor = '#f44336';
          div.innerHTML = `<span style="margin-right:8px;">⚠️</span>${message}`;
        } else if (type === 'warning') {
          div.style.backgroundColor = '#ff9800';
          div.innerHTML = `<span style="margin-right:8px;">⚠</span>${message}`;
        } else if (type === 'info') {
          div.style.backgroundColor = '#2196F3';
          div.innerHTML = `<span style="margin-right:8px;">ℹ</span>${message}`;
        }

        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.style.marginLeft = '10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.fontSize = '18px';
        closeBtn.onclick = () => document.body.removeChild(div);
        div.appendChild(closeBtn);

        document.body.appendChild(div);

        // Optional buttons
        if (options.buttons && Array.isArray(options.buttons)) {
          const buttonContainer = document.createElement('div');
          buttonContainer.style.marginTop = '10px';
          buttonContainer.style.display = 'flex';
          buttonContainer.style.gap = '10px';

          options.buttons.forEach(btnConfig => {
            if (btnConfig.text && typeof btnConfig.action === 'function') {
              const btn = document.createElement('button');
              btn.textContent = btnConfig.text;
              btn.style.padding = '5px 10px';
              btn.style.border = 'none';
              btn.style.borderRadius = '3px';
              btn.style.cursor = 'pointer';
              btn.style.backgroundColor = btnConfig.color || '#fff';
              btn.style.color = btnConfig.textColor || '#333';

              btn.onclick = () => {
                btnConfig.action();
                if (btnConfig.closeOnClick !== false) {
                  document.body.removeChild(div);
                }
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
          timerSpan.style.marginLeft = '8px';
          timerSpan.style.padding = '2px 6px';
          timerSpan.style.backgroundColor = 'rgba(255,255,255,0.2)';
          timerSpan.style.borderRadius = '10px';
          div.appendChild(timerSpan);
        }

        // Auto-hide after timeout (default: 5 seconds)
        const timeout = options.duration || 5000;
        setTimeout(() => {
          if (document.body.contains(div)) {
            div.style.opacity = '0';
            setTimeout(() => {
              if (document.body.contains(div)) {
                document.body.removeChild(div);
              }
            }, 300);
          }
        }, timeout);

        return div;
      },

      // Internal method to add a log and maintain log size
      _addLog(logEntry) {
        this.logs.unshift(logEntry);
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(0, this.maxLogs);
        }

        // Save logs to storage if enabled
        if (CONFIG.logging && CONFIG.logging.saveLogs) {
          this._saveLogs();
        }
      },

      // Save logs to localStorage
      _saveLogs() {
        try {
          localStorage.setItem('FB_CHAT_MONITOR_LOGS', JSON.stringify(this.logs));
        } catch (e) {
          console.error('Error saving logs to localStorage', e);
        }
      },

      // Load logs from localStorage
      loadLogs() {
        try {
          const savedLogs = localStorage.getItem('FB_CHAT_MONITOR_LOGS');
          if (savedLogs) {
            this.logs = JSON.parse(savedLogs);
          }
        } catch (e) {
          console.error('Error loading logs from localStorage', e);
        }
      },

      // Get all logs
      getAllLogs() {
        return [...this.logs];
      },

      // Get logs by type
      getLogsByType(type) {
        return this.logs.filter(log => log.type === type);
      },

      // Clear all logs
      clearLogs() {
        this.logs = [];
        try {
          localStorage.removeItem('FB_CHAT_MONITOR_LOGS');
        } catch (e) {
          console.error('Error clearing logs from localStorage', e);
        }
      },

      /**
       * Muestra una alerta visual para ciertas notificaciones importantes
       * @param {string} message - Mensaje a mostrar
       * @param {string} type - Tipo de notificación (success, error, info, warning)
       * @param {number} [duration=2000] - Duración en milisegundos
       */
      notify: function(message, type = 'info', duration = 2000) {
        // Mostrar mensaje en la consola
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Mostrar notificación en la interfaz
        const notification = document.createElement('div');
        notification.className = 'fb-chat-monitor-notification';
        
        // Obtener la posición óptima para la alerta
        const positionInfo = this.getOptimalAlertPosition();
        
        // Aplicar estilos base
        notification.style.position = 'fixed';
        notification.style.zIndex = '10000';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '6px';
        notification.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
        notification.style.fontSize = '14px';
        notification.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        notification.style.pointerEvents = 'none'; // Para que no interfiera con clicks
        
        // Posicionar la alerta según el cálculo realizado
        notification.style.left = positionInfo.left;
        notification.style.top = positionInfo.top;
        notification.style.right = positionInfo.right;
        notification.style.maxWidth = '300px';

        // Aplicar estilos según tipo
        switch(type) {
          case 'success':
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
            break;
          case 'error':
            notification.style.backgroundColor = '#F44336';
            notification.style.color = 'white';
            break;
          case 'warning':
            notification.style.backgroundColor = '#FF9800';
            notification.style.color = 'white';
            break;
          default: // info
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = 'white';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        // Animar entrada
        setTimeout(() => {
          notification.style.opacity = '1';
          notification.style.transform = 'translateY(0)';
        }, 50);

        // Eliminar después de la duración especificada
        setTimeout(() => {
          notification.style.opacity = '0';
          notification.style.transform = 'translateY(-20px)';
          
          // Eliminar del DOM después de la animación
          setTimeout(() => {
            if (notification.parentElement) {
              notification.parentElement.removeChild(notification);
            }
          }, 300);
        }, duration);
      },

      /**
       * Calcula la posición óptima para las alertas
       * @returns {Object} Objeto con propiedades de posicionamiento
       */
      getOptimalAlertPosition: function() {
        // Verificar si el panel está abierto o cerrado
        const panel = document.getElementById('fbChatMonitorPanel');
        const mainButton = document.getElementById('fbChatMonitorButton');
        const floatingResponseButton = document.getElementById('fbChatMonitorQuickResponse');
        
        // Valores por defecto (posición estándar en la parte superior derecha)
        const defaultPosition = {
          top: '60px',
          right: '20px',
          left: 'auto'
        };
        
        // Si el panel está abierto, posicionar debajo del panel
        if (panel && window.uiState?.isControlPanelVisible) {
          const panelRect = panel.getBoundingClientRect();
          return {
            top: `${panelRect.bottom + 10}px`,
            right: `${window.innerWidth - panelRect.right}px`,
            left: 'auto'
          };
        }
        
        // Si el botón principal está visible, posicionar debajo del botón
        if (mainButton) {
          const buttonRect = mainButton.getBoundingClientRect();
          return {
            top: `${buttonRect.bottom + 10}px`,
            right: `${window.innerWidth - buttonRect.right}px`,
            left: 'auto'
          };
        }

        // Si el botón flotante de respuesta está visible, posicionar encima de él
        if (floatingResponseButton && 
            window.getComputedStyle(floatingResponseButton).display !== 'none') {
          const buttonRect = floatingResponseButton.getBoundingClientRect();
          return {
            top: `${buttonRect.top - 10 - 40}px`, // 10px de separación + 40px altura aprox de alerta
            right: `${window.innerWidth - buttonRect.right}px`,
            left: 'auto'
          };
        }
        
        // Si no hay referencias, usar posición por defecto
        return defaultPosition;
      },
    };

    // Enhanced DOM utility
    const domUtils = {
      // Finds an element by selector (supports multiple selectors)
      findElement(selectors, parent = document) {
        // If it's an array of selectors, try them one by one
        if (Array.isArray(selectors)) {
          for (const selector of selectors) {
            try {
              const element = parent.querySelector(selector);
              if (element) return element;
            } catch (e) {
              logger.debug(`Error with selector "${selector}": ${e.message}`);
            }
          }
          return null;
        }

        // If it's a single selector
        try {
          return parent.querySelector(selectors);
        } catch (e) {
          logger.debug(`Error with selector "${selectors}": ${e.message}`);
          return null;
        }
      },

      // Finds all elements matching a selector
      findAllElements(selector, parent = document) {
        try {
          return [...parent.querySelectorAll(selector)];
        } catch (e) {
          logger.debug(`Error with selector "${selector}": ${e.message}`);
          return [];
        }
      },

      // Waits for an element to appear in the DOM with redundant selectors
      waitForElement(selectors, timeout = CONFIG.waitElementTimeout) {
        return new Promise((resolve, reject) => {
          const checkInterval = 100;
          let elapsed = 0;

          // Convert to array if it's a single selector
          const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

          const check = () => {
            for (const selector of selectorArray) {
              try {
                const element = document.querySelector(selector);
                if (element) {
                  resolve(element);
                  return;
                }
              } catch (e) {
                // Ignore errors with selectors
              }
            }

            elapsed += checkInterval;
            if (elapsed >= timeout) {
              reject(new Error(`Timeout waiting for elements: ${JSON.stringify(selectorArray)}`));
              return;
            }

            setTimeout(check, checkInterval);
          };

          check();
        });
      },

      // Scrolls to the top to load older messages with optimized logic
      scrollToTop(container, maxAttempts = 10) {
        return new Promise((resolve) => {
          let lastScrollHeight = container.scrollHeight;
          let noChangeCount = 0;
          let attempts = 0;

          const scrollStep = () => {
            container.scrollTop = 0; // Scroll up

            setTimeout(() => {
              attempts++;

              // Check if content height changed (new content loaded)
              if (container.scrollHeight === lastScrollHeight) {
                noChangeCount++;
                if (noChangeCount >= 3 || attempts >= maxAttempts) {
                  // If no changes after several attempts, assume we've reached the top
                  resolve({ success: true, fullyScrolled: true });
                  return;
                }
              } else {
                // If height changed, reset the counter and update height
                noChangeCount = 0;
                lastScrollHeight = container.scrollHeight;
              }

              scrollStep();
            }, 300);
          };

          scrollStep();
        });
      },

      // Scroll to bottom smoothly
      scrollToBottom(container) {
        return new Promise((resolve) => {
          if (!container) {
            resolve(false);
            return;
          }

          container.scrollTop = container.scrollHeight;
          setTimeout(() => resolve(true), 100);
        });
      },

      // Create and inject a style element
      injectStyles(stylesContent) {
        const styleElement = document.createElement('style');
        styleElement.textContent = stylesContent;
        document.head.appendChild(styleElement);
        return styleElement;
      },

      // Insert text into an input field with all required events
      insertTextIntoField(field, text) {
        if (!field) return false;

        try {
          // Focus the field first
          field.focus();

          // Try multiple insertion methods
          const methodsToTry = [
            // Method 1: execCommand (works in most browsers)
            () => {
              document.execCommand('selectAll', false, null);
              return document.execCommand('insertText', false, text);
            },
            // Method 2: Direct property assignment for contentEditable
            () => {
              if (field.contentEditable === 'true') {
                field.innerText = text;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              return false;
            },
            // Method 3: Direct value assignment for inputs
            () => {
              if ('value' in field) {
                field.value = text;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              return false;
            },
            // Method 4: DOM text replacement
            () => {
              // Clear existing content
              while (field.firstChild) {
                field.removeChild(field.firstChild);
              }
              field.appendChild(document.createTextNode(text));
              field.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
          ];

          // Try each method until one succeeds
          for (const method of methodsToTry) {
            try {
              if (method()) {
                logger.debug("Text inserted successfully");
                return true;
              }
            } catch (e) {
              // Continue to next method
            }
          }

          // Extra fallback if all methods above fail
          field.innerText = text;
          field.value = text;
          field.textContent = text;

          // Try multiple event types to ensure the change is registered
          ['input', 'change', 'keyup'].forEach(eventType => {
            try {
              field.dispatchEvent(new Event(eventType, { bubbles: true }));
            } catch (e) {
              // Ignore errors in event dispatch
            }
          });

          return true;
        } catch (error) {
          logger.error(`Error inserting text into field: ${error.message}`);
          return false;
        }
      },

      /**
       * Inserta texto en un campo de entrada con soporte para campos contenteditable
       * @param {HTMLElement} field - Campo donde insertar el texto
       * @param {string} text - Texto a insertar
       * @returns {boolean} True si se insertó correctamente
       */
      insertTextIntoField(field, text) {
        if (!field || !text) return false;
        
        try {
          // Verificar si es un campo contenteditable
          if (field.getAttribute('contenteditable') === 'true') {
            // Limpiar el campo primero
            field.innerHTML = '';
            
            // Método 1: Usar document.execCommand (más compatible con Facebook)
            field.focus();
            const success = document.execCommand('insertText', false, text);
            
            // Si execCommand falla, usar método alternativo
            if (!success) {
              field.textContent = text;
              
              // Disparar evento de input para notificar cambios
              const inputEvent = new Event('input', { bubbles: true, cancelable: true });
              field.dispatchEvent(inputEvent);
            }
            
            return true;
          } 
          // Para campos de entrada estándar (input/textarea)
          else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
            field.value = text;
            
            // Disparar eventos para que Facebook detecte el cambio
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            
            return true;
          }
          
          // Si no es contenteditable ni input/textarea, intentar con innerText
          field.innerText = text;
          return true;
        } catch (error) {
          logger.error(`Error insertando texto en campo: ${error.message}`);
          return false;
        }
      },

      /**
       * Inserta texto en un campo de entrada con soporte para campos contenteditable
       * @param {HTMLElement} field - Campo donde insertar el texto
       * @param {string} text - Texto a insertar
       * @returns {boolean} True si se insertó correctamente
       */
      insertTextIntoField(field, text) {
        if (!field || !text) return false;
        
        try {
          // Verificar si el campo ya está vacío
          const isFieldEmpty = field.getAttribute('contenteditable') === 'true' ?
            (!field.textContent || field.textContent.trim() === '') :
            (!field.value || field.value.trim() === '');
          
          // Si el campo no está vacío, intentamos limpiarlo una vez más
          if (!isFieldEmpty) {
            if (field.getAttribute('contenteditable') === 'true') {
              field.innerHTML = '';
              field.textContent = '';
            } else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
              field.value = '';
            }
            logger.debug(`Campo limpiado adicionalmente antes de insertar texto`);
          }
          
          // Verificar si es un campo contenteditable
          if (field.getAttribute('contenteditable') === 'true') {
            // Limpiar el campo primero
            field.innerHTML = '';
            
            // Método 1: Usar document.execCommand (más compatible con Facebook)
            field.focus();
            const success = document.execCommand('insertText', false, text);
            
            // Si execCommand falla, usar método alternativo
            if (!success) {
              field.textContent = text;
              
              // Disparar evento de input para notificar cambios
              const inputEvent = new Event('input', { bubbles: true, cancelable: true });
              field.dispatchEvent(inputEvent);
            }
            
            return true;
          } 
          // Para campos de entrada estándar (input/textarea)
          else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
            field.value = text;
            
            // Disparar eventos para que Facebook detecte el cambio
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            
            return true;
          }
          
          // Si no es contenteditable ni input/textarea, intentar con innerText
          field.innerText = text;
          return true;
        } catch (error) {
          logger.error(`Error insertando texto en campo: ${error.message}`);
          return false;
        }
      },

      /**
       * Inserta texto en un campo de entrada con soporte para campos contenteditable
       * @param {HTMLElement} field - Campo donde insertar el texto
       * @param {string} text - Texto a insertar
       * @returns {boolean} True si se insertó correctamente
       */
      insertTextIntoField(field, text) {
        if (!field || !text) return false;
        
        try {
          // FASE 1: Verificar y limpiar el campo de forma agresiva
          const isContentEditable = field.getAttribute('contenteditable') === 'true';
          const currentContent = isContentEditable ? 
            (field.textContent || '').trim() : 
            (field.value || '').trim();
            
          if (currentContent) {
            logger.warn(`Campo aún contiene texto antes de insertar: "${currentContent.substring(0, 30)}..."`);
            
            // Limpieza agresiva final
            if (isContentEditable) {
              field.innerHTML = '';
              field.textContent = '';
              
              try {
                // Usar la API de selección para limpiar
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(field);
                selection.removeAllRanges();
                selection.addRange(range);
                selection.deleteFromDocument();
              } catch (e) {
                logger.debug(`Error usando selection API: ${e.message}`);
              }
            } else {
              field.value = '';
            }
            
            // Disparar eventos
            ['input', 'change'].forEach(eventType => {
              field.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
          }
          
          // FASE 2: Insertar el nuevo texto usando diferentes técnicas según el tipo de campo
          if (isContentEditable) {
            // MÉTODO 1: document.execCommand (más compatible)
            field.focus();
            const success = document.execCommand('insertText', false, text);
            
            // MÉTODO 2: Si execCommand falla, usar textContent/innerHTML
            if (!success) {
              field.textContent = text;
              // Disparar eventos manualmente
              field.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } 
          // Para campos estándar
          else if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
            field.value = text;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          // FASE 3: Verificar que el texto se insertó correctamente
          setTimeout(() => {
            const newContent = isContentEditable ? field.textContent : field.value;
            if (newContent !== text) {
              logger.warn(`Posible problema al insertar texto. Esperado: "${text.substring(0, 30)}...", Actual: "${newContent.substring(0, 30)}..."`);
            } else {
              logger.debug('Texto insertado correctamente verificado');
            }
          }, 50);
          
          return true;
        } catch (error) {
          logger.error(`Error insertando texto en campo: ${error.message}`);
          return false;
        }
      },

      /**
       * Simula presionar una tecla en un elemento
       * @param {HTMLElement} element - Elemento donde simular la pulsación
       * @param {string} key - La tecla a simular (ej: 'Enter')
       * @param {number} keyCode - El código de la tecla
       * @returns {boolean} - True si el evento fue despachado correctamente
       */
      simulateKeyPress(element, key = 'Enter', keyCode = 13) {
        if (!element) return false;
        
        try {
          // Enfocar el elemento primero
          element.focus();
          
          // Crear los eventos de tecla
          const keyEvents = [
            new KeyboardEvent('keydown', { 
              key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true 
            }),
            new KeyboardEvent('keypress', { 
              key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true 
            }),
            new KeyboardEvent('keyup', { 
              key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true 
            })
          ];
          
          // Disparar eventos en secuencia
          let success = true;
          keyEvents.forEach(event => {
            if (!element.dispatchEvent(event)) {
              success = false;
            }
          });
          
          return success;
        } catch (error) {
          logger.error(`Error simulando tecla ${key}: ${error.message}`);
          return false;
        }
      },

      /**
       * Simula una pulsación de tecla en un elemento
       * @param {HTMLElement} element - Elemento donde simular la pulsación
       * @param {string} key - Tecla a simular (ej: "Enter")
       * @param {number} keyCode - Código de la tecla
       * @returns {boolean} - True si se pudo simular la pulsación
       */
      simulateKeyPress(element, key, keyCode) {
        if (!element) return false;
        
        try {
          // Primero asegurarse de que el elemento tiene foco
          element.focus();
          
          // MEJORA: Dar tiempo para que el elemento reciba el foco
          setTimeout(() => {
            try {
              // Simular secuencia completa de eventos de teclado
              const eventTypes = ['keydown', 'keypress', 'keyup'];
              let success = true;
              
              eventTypes.forEach(eventType => {
                const event = new KeyboardEvent(eventType, {
                  key: key,
                  code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
                  keyCode: keyCode,
                  which: keyCode,
                  bubbles: true,
                  cancelable: true,
                  view: window
                });
                
                const dispatched = element.dispatchEvent(event);
                if (!dispatched) {
                  logger.warn(`Evento ${eventType} no fue despachado correctamente`);
                  success = false;
                }
                
                // Pequeña pausa entre eventos
                if (eventType !== 'keyup') {
                  // Usar setTimeout con 0ms para dar un pequeño respiro al navegador
                  setTimeout(() => {}, 0);
                }
              });
              
              logger.debug(`Simulación de tecla ${key} ${success ? 'exitosa' : 'con problemas'}`);
              return success;
            } catch (innerError) {
              logger.error(`Error en simulación de tecla: ${innerError.message}`);
              return false;
            }
          }, 50);
          
          return true; // Indicar que se programó la simulación
        } catch (error) {
          logger.error(`Error preparando simulación de tecla: ${error.message}`);
          return false;
        }
      },

    };

    // Storage utility for robust localStorage operations
    const storageUtils = {
      /**
       * Set a value in storage with maximum reliability
       * @param {string} key - The key to store
       * @param {any} value - The value to store (will be JSON stringified)
       * @returns {boolean} - Success status
       */
      set: function(key, value) {
        try {
          // Intenta primero con GM_setValue (más confiable)
          if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
          }
          
          // También guardar en localStorage como respaldo
          if (typeof localStorage !== 'undefined') {
            // Para objetos y arrays, convertir a JSON
            const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
            localStorage.setItem(key, valueToStore);
          }
          
          return true;
        } catch (e) {
          logger.error(`Error storing data: ${e.message}`, {key});
          return false;
        }
      },

      /**
       * Get a value from storage
       * @param {string} key - The key to retrieve
       * @param {any} defaultValue - Default value if key not found
       * @returns {any} - The stored value or defaultValue
       */
      get: function(key, defaultValue = null) {
        try {
          // Intenta primero con GM_getValue
          if (typeof GM_getValue === 'function') {
            const gmValue = GM_getValue(key, undefined);
            if (gmValue !== undefined) {
              return gmValue;
            }
          }
          
          // Si no hay valor en GM_storage o no está disponible, intenta localStorage
          if (typeof localStorage !== 'undefined') {
            const lsValue = localStorage.getItem(key);
            if (lsValue !== null) {
              // Intenta parsear JSON si es posible
              try {
                return JSON.parse(lsValue);
              } catch (e) {
                // Si no es JSON, devuelve el valor tal cual
                return lsValue;
              }
            }
          }
          
          return defaultValue;
        } catch (e) {
          logger.error(`Error retrieving data: ${e.message}`, {key});
          return defaultValue;
        }
      },

      /**
       * Remove a value from storage
       * @param {string} key - The key to remove
       * @returns {boolean} - Success status
       */
      remove: function(key) {
        try {
          // Eliminar de GM_storage si está disponible
          if (typeof GM_deleteValue === 'function') {
            GM_deleteValue(key);
          }
          
          // También eliminar de localStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
          
          return true;
        } catch (e) {
          logger.error(`Error removing data: ${e.message}`, {key});
          return false;
        }
      },

      /**
       * Migrar configuraciones de localStorage a GM_storage
       */
      migrateSettings: function() {
        logger.debug('Running settings migration check...');
        
        // Lista de claves a migrar
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
        
        // Solo intentar migrar si GM_setValue está disponible
        if (typeof GM_setValue === 'function' && typeof localStorage !== 'undefined') {
          keysToMigrate.forEach(key => {
            // Verificar si existe en localStorage pero no en GM_storage
            const localValue = localStorage.getItem(key);
            if (localValue !== null && GM_getValue(key, undefined) === undefined) {
              // Intentar parsear JSON para valores de objeto
              let valueToStore = localValue;
              try {
                valueToStore = JSON.parse(localValue);
              } catch (e) {
                // Si no es JSON válido, usar el valor original
              }
              
              // Migrar valor
              GM_setValue(key, valueToStore);
              migratedCount++;
              logger.debug(`Migrated ${key} from localStorage to GM_storage`);
            }
          });
        }
        
        if (migratedCount > 0) {
          logger.log(`Settings migration complete: ${migratedCount} items migrated`);
        } else {
          logger.debug('No settings needed migration');
        }
        
        return migratedCount;
      },

      /**
       * Verifica la salud del almacenamiento y repara problemas
       */
      checkStorageHealth: function() {
        // Verificar que las funciones de almacenamiento estén disponibles
        const gmStorageAvailable = (typeof GM_setValue === 'function' && typeof GM_getValue === 'function');
        const localStorageAvailable = typeof localStorage !== 'undefined';
        
        logger.debug(`Storage availability: GM_storage=${gmStorageAvailable}, localStorage=${localStorageAvailable}`);
        
        if (!gmStorageAvailable && !localStorageAvailable) {
          logger.error('No storage mechanisms available. Data persistence will not work.');
          return false;
        }
        
        // Verificar que podemos escribir y leer correctamente
        try {
          const testKey = 'STORAGE_TEST_' + Date.now();
          const testValue = 'test_' + Date.now();
          
          this.set(testKey, testValue);
          const readValue = this.get(testKey, null);
          
          if (readValue !== testValue) {
            logger.error('Storage verification failed: write/read mismatch');
            return false;
          }
          
          // Limpiar valor de prueba
          this.remove(testKey);
          logger.debug('Storage health check passed successfully');
          return true;
        } catch (e) {
          logger.error('Storage health check failed', e);
          return false;
        }
      }
    };

    // User activity detection for adaptive monitoring
    const userActivityTracker = {
      isActive: false,
      lastActivity: Date.now(),
      listeners: [],

      initialize() {
        // Track mouse and keyboard activity
        document.addEventListener('mousemove', () => this.recordActivity());
        document.addEventListener('keydown', () => this.recordActivity());
        document.addEventListener('click', () => this.recordActivity());

        // Check for inactivity periodically
        setInterval(() => this.checkInactivity(), 60000);

        logger.debug('User activity tracker initialized');
      },

      recordActivity() {
        const wasInactive = !this.isActive;
        this.isActive = true;
        this.lastActivity = Date.now();

        // If state changed, notify listeners
        if (wasInactive) {
          this.notifyListeners();
        }
      },

      checkInactivity() {
        const now = Date.now();
        const inactiveTime = now - this.lastActivity;

        // Consider user inactive after 5 minutes
        if (inactiveTime > 5 * 60 * 1000 && this.isActive) {
          this.isActive = false;
          this.notifyListeners();
        }
      },

      onActivityChange(callback) {
        if (typeof callback === 'function') {
          this.listeners.push(callback);
        }
      },

      notifyListeners() {
        for (const listener of this.listeners) {
          try {
            listener(this.isActive, this.lastActivity);
          } catch (error) {
            logger.error('Error in activity listener', {}, error);
          }
        }
      }
    };

    // Retry helper with exponential backoff
    const retryUtils = {
      async withExponentialBackoff(operation, options = {}) {
        const {
          maxRetries = 3,
          baseDelay = 1000,
          maxDelay = 30000,
          factor = 2,
          jitter = 0.1,
        } = options;

        let attempt = 0;
        let lastError = null;

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

            // Calculate delay with exponential backoff and jitter
            const delay = Math.min(
              baseDelay * Math.pow(factor, attempt - 1),
              maxDelay
            );

            // Add jitter to avoid synchronized retries
            const jitterAmount = delay * jitter;
            const finalDelay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);

            logger.debug(`Retry attempt ${attempt} after ${Math.round(finalDelay)}ms`);
            await new Promise(resolve => setTimeout(resolve, finalDelay));
          }
        }

        throw lastError;
      }
    };

    // Time and formatting utilities
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

    // URL and page handling utilities
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

    // General utility functions
    function showSimpleAlert(message, type = 'info', options = {}) {
      return logger.notify(message, type, options);
    }

    async function delay(ms) {
      return timeUtils.sleep(ms);
    }

    function insertTextDirectly(inputField, text) {
      return domUtils.insertTextIntoField(inputField, text);
    }

    // Initialize on module load
    logger.loadLogs();
    userActivityTracker.initialize();

    // already exhibits only once:
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

    // Facebook GraphQL helper functions
    window.getFbDtsg = function() {
      const meta = document.querySelector('input[name="fb_dtsg"], meta[name="fb_dtsg"]');
      if (meta) return meta.value || meta.content || '';
      const match = document.body.innerHTML.match(/"DTSGInitData",\[\],\{"token":"([^"]+)"/);
      return match ? match[1] : '';
    };

    window.getFacebookUserID = function() {
      const m = document.cookie.match(/c_user=(\d+)/);
      return m ? m[1] : '';
    };

    if (!window.__reqCounter) window.__reqCounter = 0;
    window.nextReq = function() {
      return (++window.__reqCounter).toString(36);
    };

    window.getRevision = function() {
      return document.querySelector('meta[name="revision"]')?.content
          || '1007773680';
    };

    window.jsonToFormUrlEncoded = function(obj) {
      return Object.entries(obj)
        .map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
    };

    /**
     * Muestra un diálogo modal con una respuesta generada para que el usuario pueda copiarla o editarla
     * @param {string} responseText - El texto de la respuesta a mostrar
     */
    function showResponseForCopy(responseText) {
      // Si ya existe un modal previo, eliminarlo
      const existingModal = document.getElementById('response-copy-modal');
      if (existingModal) {
        existingModal.remove();
      }

      // Crear contenedor para el modal
      const modalContainer = document.createElement('div');
      modalContainer.id = 'response-copy-modal';
      modalContainer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:10000;';

      // Crear el modal
      const modal = document.createElement('div');
      modal.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);width:80%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;';

      // Crear encabezado del modal
      const header = document.createElement('div');
      header.style.cssText = 'padding:12px 20px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;';
      header.innerHTML = '<h3 style="margin:0;color:#333;font-size:16px;">Respuesta Sugerida</h3>';

      // Botón para cerrar
      const closeButton = document.createElement('button');
      closeButton.innerText = '✕';
      closeButton.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:#666;';
      closeButton.onclick = () => modalContainer.remove();
      header.appendChild(closeButton);

      // Contenido del modal - área de texto
      const content = document.createElement('div');
      content.style.cssText = 'padding:15px 20px;overflow-y:auto;flex:1;';
      
      const textarea = document.createElement('textarea');
      textarea.value = responseText;
      textarea.style.cssText = 'width:100%;min-height:200px;padding:10px;border:1px solid #ddd;border-radius:4px;font-family:inherit;font-size:14px;resize:vertical;';
      textarea.onclick = function() { this.select(); };
      content.appendChild(textarea);

      // Botones de acción
      const actions = document.createElement('div');
      actions.style.cssText = 'padding:15px 20px;border-top:1px solid #ddd;display:flex;justify-content:flex-end;gap:10px;';

      // Botón para copiar
      const copyButton = document.createElement('button');
      copyButton.innerText = 'Copiar';
      copyButton.style.cssText = 'padding:8px 16px;background:#f0f0f0;border:1px solid #ddd;border-radius:4px;cursor:pointer;';
      copyButton.onclick = () => {
        textarea.select();
        document.execCommand('copy');
        showSimpleAlert('Respuesta copiada al portapapeles', 'success');
      };
      actions.appendChild(copyButton);

      // Botón para enviar (si tenemos el HumanSimulator)
      if (window.humanSimulator) {
        const sendButton = document.createElement('button');
        sendButton.innerText = 'Enviar';
        sendButton.style.cssText = 'padding:8px 16px;background:#0084ff;border:none;border-radius:4px;color:white;cursor:pointer;';
        sendButton.onclick = async () => {
          const editedText = textarea.value.trim();
          if (editedText) {
            modalContainer.remove();
            await window.humanSimulator.typeAndSendMessage(editedText);
            showSimpleAlert('Mensaje enviado correctamente', 'success');
          }
        };
        actions.appendChild(sendButton);
      }

      // Ensamblar el modal
      modal.appendChild(header);
      modal.appendChild(content);
      modal.appendChild(actions);
      modalContainer.appendChild(modal);

      // Añadir al DOM
      document.body.appendChild(modalContainer);

      // Seleccionar texto para facilitar copia
      setTimeout(() => textarea.select(), 100);
    }

    /**
     * Verifica y reporta el estado actual del modo de operación para diagnóstico
     * @returns {Object} Estado actual de la configuración de modo
     */
    function diagnosticModeCheck() {
      // Verificar almacenamiento
      const gmModeValue = typeof GM_getValue === 'function' ? 
        { FB_CHAT_MODE: GM_getValue('FB_CHAT_MODE'), FB_CHAT_OPERATION_MODE: GM_getValue('FB_CHAT_OPERATION_MODE') } : 
        'GM storage no disponible';
      
      const lsModeValue = {
        FB_CHAT_MODE: localStorage.getItem('FB_CHAT_MODE'),
        FB_CHAT_OPERATION_MODE: localStorage.getItem('FB_CHAT_OPERATION_MODE')
      };
      
      // Estado en memoria
      const memoryState = {
        CONFIG_operationMode: window.CONFIG?.operationMode,
        CONFIG_modo: window.CONFIG?.modo,
        ui_modeState: window.ui?.currentMode || 'No disponible'
      };
      
      // Reportar estado
      const state = {
        storage: {
          GM: gmModeValue,
          localStorage: lsModeValue
        },
        memory: memoryState,
        responseManager: {
          isAutomodeEnabled: window.responseManager?.isAutomodeEnabled || 'No disponible'
        }
      };
      
      logger.log('=== DIAGNÓSTICO DE MODO OPERACIÓN ===');
      logger.log(JSON.stringify(state, null, 2));
      logger.log('=====================================');
      
      return state;
    }
    
    // Exponer para uso desde consola
    window.diagnoseModeConfig = diagnosticModeCheck;