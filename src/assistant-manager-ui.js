/**
     * UI for managing OpenAI Assistants
     */

    class AssistantManagerUI {
      constructor() {
        this.initialized = false;
      }

      /**
       * Initialize the user interface
       */
      initialize() {
        if (this.initialized) return;

        this.createStyles();
        this.createPanel();
        this.attachEvents();

        this.initialized = true;
        logger.debug('Assistant Manager UI initialized');
      }

      /**
       * Create CSS styles for the interface
       */
      createStyles() {
        const style = document.createElement('style');
        style.textContent = `
          .assistant-manager-panel {
            position: fixed;
            right: 20px;
            top: 60px;
            width: 300px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            overflow: hidden;
            z-index: 9999;
            font-family: Arial, sans-serif;
            transition: all 0.3s ease;
          }

          .assistant-manager-header {
            background: #1877f2;
            color: white;
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
          }

          .assistant-manager-content {
            padding: 15px;
            max-height: 400px;
            overflow-y: auto;
          }

          .assistant-manager-field {
            margin-bottom: 15px;
          }

          .assistant-manager-field label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            font-size: 14px;
          }

          .assistant-manager-field input,
          .assistant-manager-field textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }

          .assistant-manager-field textarea {
            height: 80px;
            resize: vertical;
          }

          .assistant-manager-tabs {
            display: flex;
            border-bottom: 1px solid #ddd;
          }

          .assistant-manager-tab {
            padding: 8px 15px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
          }

          .assistant-manager-tab.active {
            border-bottom: 2px solid #1877f2;
            font-weight: bold;
          }

          .assistant-manager-tab-content {
            display: none;
            padding-top: 10px;
          }

          .assistant-manager-tab-content.active {
            display: block;
          }

          .assistant-manager-button {
            background: #1877f2;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 5px;
          }

          .assistant-manager-button:hover {
            background: #166fe5;
          }

          .assistant-manager-status {
            margin-top: 10px;
            padding: 8px;
            border-radius: 4px;
            font-size: 14px;
          }

          .assistant-manager-status.success {
            background: #e6f7e6;
            color: #25a025;
          }

          .assistant-manager-status.error {
            background: #ffebeb;
            color: #e60000;
          }

          .assistant-manager-toggle {
            position: fixed;
            right: 20px;
            top: 20px;
            background: #1877f2;
            color: white;
            border: none;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 9999;
            font-size: 20px;
          }

          .hidden {
            display: none;
          }
        `;
        document.head.appendChild(style);
      }

      /**
       * Create the interface panel
       */
      createPanel() {
        // Floating button to open/close the panel
        const toggleButton = document.createElement('button');
        toggleButton.className = 'assistant-manager-toggle';
        toggleButton.innerHTML = '🤖';
        toggleButton.title = 'Manage Assistants';
        document.body.appendChild(toggleButton);

        // Main panel
        const panel = document.createElement('div');
        panel.className = 'assistant-manager-panel hidden';

        // Header
        const header = document.createElement('div');
        header.className = 'assistant-manager-header';
        header.innerHTML = '<span>Assistant Management</span><span id="assistant-close">✕</span>';
        panel.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'assistant-manager-content';

        // API Key
        const apiKeyField = document.createElement('div');
        apiKeyField.className = 'assistant-manager-field';
        apiKeyField.innerHTML = `
          <label for="openai-api-key">OpenAI API Key:</label>
          <input type="password" id="openai-api-key" placeholder="sk-..." value="${CONFIG.AI.apiKey || ''}">
          <button id="save-api-key" class="assistant-manager-button">Save</button>
        `;
        content.appendChild(apiKeyField);

        // Tabs for assistants
        const tabs = document.createElement('div');
        tabs.className = 'assistant-manager-tabs';
        tabs.innerHTML = `
          <div class="assistant-manager-tab active" data-tab="seller">Seller</div>
          <div class="assistant-manager-tab" data-tab="buyer">Buyer</div>
        `;
        content.appendChild(tabs);

        // Tab contents
        const tabContents = document.createElement('div');

        // Seller tab
        const sellerTab = document.createElement('div');
        sellerTab.className = 'assistant-manager-tab-content active';
        sellerTab.id = 'tab-seller';
        sellerTab.innerHTML = `
          <div class="assistant-manager-field">
            <label for="seller-assistant-name">Name:</label>
            <input type="text" id="seller-assistant-name" value="${CONFIG.AI.assistants.seller.name || ''}">
          </div>
          <div class="assistant-manager-field">
            <label for="seller-assistant-instructions">Instructions:</label>
            <textarea id="seller-assistant-instructions">${CONFIG.AI.assistants.seller.instructions || ''}</textarea>
          </div>
          <button id="save-seller-assistant" class="assistant-manager-button">Save Assistant</button>
          <div id="seller-assistant-status" class="assistant-manager-status hidden"></div>
        `;
        tabContents.appendChild(sellerTab);

        // Buyer tab
        const buyerTab = document.createElement('div');
        buyerTab.className = 'assistant-manager-tab-content';
        buyerTab.id = 'tab-buyer';
        buyerTab.innerHTML = `
          <div class="assistant-manager-field">
            <label for="buyer-assistant-name">Name:</label>
            <input type="text" id="buyer-assistant-name" value="${CONFIG.AI.assistants.buyer.name || ''}">
          </div>
          <div class="assistant-manager-field">
            <label for="buyer-assistant-instructions">Instructions:</label>
            <textarea id="buyer-assistant-instructions">${CONFIG.AI.assistants.buyer.instructions || ''}</textarea>
          </div>
          <button id="save-buyer-assistant" class="assistant-manager-button">Save Assistant</button>
          <div id="buyer-assistant-status" class="assistant-manager-status hidden"></div>
        `;
        tabContents.appendChild(buyerTab);

        content.appendChild(tabContents);
        panel.appendChild(content);
        document.body.appendChild(panel);

        // Save references for later access
        this.panel = panel;
        this.toggleButton = toggleButton;
      }

      /**
       * Attach events to interface elements
       */
      attachEvents() {
        // Toggle panel
        this.toggleButton.addEventListener('click', () => this.panel.classList.toggle('hidden'));
        document.getElementById('assistant-close').addEventListener('click', () => this.panel.classList.add('hidden'));

        // Tabs switching
        document.querySelectorAll('.assistant-manager-tab').forEach(tab => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.assistant-manager-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.assistant-manager-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
          });
        });

        // Save API Key
        document.getElementById('save-api-key').addEventListener('click', async () => {
          const apiKey = document.getElementById('openai-api-key').value.trim();
          if (!apiKey) { this.showStatus('error','Please enter a valid API Key'); return; }
          try {
            CONFIG.AI.apiKey = apiKey;
            localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
            const ok = this.openAIInitialized = openAIManager.initialize(apiKey);
            this.showStatus(ok ? 'success' : 'error', ok ? 'API Key saved' : 'Invalid API Key');
          } catch(e) {
            this.showStatus('error', `Error: ${e.message}`);
          }
        });

        // Save seller/buyer assistant
        document.getElementById('save-seller-assistant').addEventListener('click', () => this.saveAssistant('seller'));
        document.getElementById('save-buyer-assistant').addEventListener('click', () => this.saveAssistant('buyer'));
      }

      /**
       * Save an assistant configuration
       */
      async saveAssistant(role) {
        const name = document.getElementById(`${role}-assistant-name`).value.trim();
        const instr = document.getElementById(`${role}-assistant-instructions`).value.trim();
        const status = document.getElementById(`${role}-assistant-status`);
        if (!name || !instr) { this.showStatus('error','Complete all fields',status); return; }
        if (!CONFIG.AI.apiKey) { this.showStatus('error','Set API Key first',status); return; }
        this.showStatus('info','Saving assistant...',status);
        try {
          const id = await openAIManager.createOrUpdateAssistant(role, name, instr);
          CONFIG.AI.assistants[role] = { id, name, instructions: instr };
          localStorage.setItem(`FB_CHAT_MONITOR_${role.toUpperCase()}_ASSISTANT_ID`, id);
          this.showStatus('success', `Assistant "${name}" saved`, status);
        } catch(e) {
          this.showStatus('error', `Error: ${e.message}`, status);
        }
      }

      /**
       * Show a status message
       */
      showStatus(type, message, element = null) {
        const el = element || document.querySelector('.assistant-manager-status');
        if (!el) return;
        el.textContent = message;
        el.className = `assistant-manager-status ${type}`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 5000);
      }
    }

    // Export a UI instance
    const assistantManagerUI = new AssistantManagerUI();
    window.assistantManagerUI = assistantManagerUI;