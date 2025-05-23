/**
 * User Interface module - Provides the main UI components for the FB-Chat-Monitor
 */
// UI State Storage
const uiState = {
  isControlPanelVisible: false,
  activeTab: 'dashboard',
  floatingButton: null,
  controlPanel: null,
  statusIndicator: null,
  floatingResponseButton: null // New: Reference to the floating response generation button
};

/**
 * Create and initialize all UI components
 */
function initializeUI() {
  uiState.floatingButton = createFloatingButton();
  createStyles();

  // Load UI state from storage
  const savedState = storageUtils.get('UI_STATE', {});
  if (savedState.activeTab) {
    uiState.activeTab = savedState.activeTab;
  }

  logger.debug('UI initialized');

  // ADDED: Create and append floating button for quick response generation
  uiState.floatingResponseButton = createFloatingResponseButton();
  document.body.appendChild(uiState.floatingResponseButton);

  // Start periodic check for floating button visibility
  setInterval(updateFloatingResponseButtonVisibility, 2000);
}

/**
 * Create a floating button that toggles the control panel
 * @returns {HTMLElement} The created button
 */
function createFloatingButton() {
  // Main button
  const button = document.createElement('div');
  button.id = 'fb-chat-monitor-button';
  button.style.position = 'fixed';
  button.style.top = '20px';     // Changed from 'bottom' to 'top'
  button.style.right = '60px';
  button.style.bottom = 'auto';  // Ensure 'bottom' doesn't interfere
  button.style.left = 'auto';    // Ensure 'left' doesn't interfere
  button.style.padding = '10px 15px';
  button.style.backgroundColor = '#4267B2';
  button.style.color = 'white';
  button.style.borderRadius = '5px';
  button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  button.style.cursor = 'pointer';
  button.style.zIndex = '9999';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.transition = 'all 0.3s ease';
  button.style.fontFamily = 'Arial, sans-serif';

  // Status indicator (green dot)
  const statusDot = document.createElement('div');
  statusDot.id = 'fb-chat-monitor-status-dot';
  statusDot.style.width = '10px';
  statusDot.style.height = '10px';
  statusDot.style.backgroundColor = '#4CAF50';
  statusDot.style.borderRadius = '50%';
  statusDot.style.marginRight = '8px';
  button.appendChild(statusDot);

  // Button text
  const buttonText = document.createElement('span');
  buttonText.textContent = 'FB Chat Monitor';
  button.appendChild(buttonText);

  // Hover events
  button.addEventListener('mouseover', function () {
    this.style.backgroundColor = '#365899';
  });

  button.addEventListener('mouseout', function () {
    this.style.backgroundColor = '#4267B2';
  });

  // Click to show panel
  button.addEventListener('click', toggleControlPanel);
  document.body.appendChild(button);

  // Save reference for status updates
  uiState.statusIndicator = statusDot;

  return button;
}

/**
 * Create and inject CSS styles for the UI
 */
function createStyles() {
  const styles = `
        .fb-chat-monitor-panel {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 380px;
          max-width: 90vw;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 20px rgba(0,0,0,0.2);
          z-index: 9998;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 100px);
          transition: all 0.3s ease;
          overflow: hidden;
        }

        .fb-chat-monitor-panel-header {
          padding: 15px;
          background-color: #4267B2;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-radius: 8px 8px 0 0;
        }

        .fb-chat-monitor-panel-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .fb-chat-monitor-close {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .fb-chat-monitor-panel-tabs {
          display: flex;
          border-bottom: 1px solid #ddd;
          background-color: #f5f5f5;
        }

        .fb-chat-monitor-tab {
          padding: 10px 15px;
          cursor: pointer;
          position: relative;
          flex: 1;
          text-align: center;
          color: #666;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .fb-chat-monitor-tab:hover {
          background-color: rgba(66, 103, 178, 0.05);
        }

        .fb-chat-monitor-tab.active {
          color: #4267B2;
          font-weight: bold;
        }

        .fb-chat-monitor-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background-color: #4267B2;
        }

        .fb-chat-monitor-panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
        }

        .fb-chat-monitor-tab-content {
          display: none;
          animation: fadeIn 0.3s ease;
        }

        .fb-chat-monitor-tab-content.active {
          display: block;
        }

        .fb-chat-monitor-status-section {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
        }

        .fb-chat-monitor-status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 10px;
        }

        .fb-chat-monitor-status-text {
          flex: 1;
        }

        .fb-chat-monitor-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 15px;
        }

        .fb-chat-monitor-stat-item {
          background-color: #f9f9f9;
          border-radius: 6px;
          padding: 10px;
          text-align: center;
        }

        .fb-chat-monitor-stat-value {
          font-size: 18px;
          font-weight: bold;
          color: #4267B2;
          margin-bottom: 5px;
        }

        .fb-chat-monitor-stat-label {
          font-size: 12px;
          color: #666;
        }

        .fb-chat-monitor-form-group {
          margin-bottom: 15px;
        }

        .fb-chat-monitor-form-group label {
          display: block;
          font-size: 14px;
          margin-bottom: 5px;
          color: #444;
        }

        .fb-chat-monitor-form-group input,
        .fb-chat-monitor-form-group select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .fb-chat-monitor-radio-group {
          margin: 10px 0;
        }

        .fb-chat-monitor-radio-option {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }

        .fb-chat-monitor-radio-option input {
          margin-right: 8px;
          width: auto;
        }

        .fb-chat-monitor-radio-label {
          display: flex;
          flex-direction: column;
        }

        .fb-chat-monitor-radio-label span:first-child {
          font-weight: 500;
        }

        .fb-chat-monitor-radio-label span:last-child {
          font-size: 12px;
          color: #666;
        }

        .fb-chat-monitor-button {
          padding: 8px 12px;
          background-color: #4267B2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
          margin-right: 8px;
          margin-bottom: 8px;
        }

        .fb-chat-monitor-button:hover {
          background-color: #365899;
        }

        .fb-chat-monitor-button-secondary {
          background-color: #eaeaea;
          color: #333;
        }

        .fb-chat-monitor-button-secondary:hover {
          background-color: #d5d5d5;
        }

        .fb-chat-monitor-button-danger {
          background-color: #f44336;
        }

        .fb-chat-monitor-button-danger:hover {
          background-color: #d32f2f;
        }

        .fb-chat-monitor-button-success {
          background-color: #4CAF50;
        }

        .fb-chat-monitor-button-success:hover {
          background-color: #388E3C;
        }

        .fb-chat-monitor-logs-container {
          border: 1px solid #eee;
          border-radius: 4px;
          max-height: 200px;
          overflow-y: auto;
          font-size: 12px;
          font-family: monospace;
        }

        .fb-chat-monitor-log-entry {
          padding: 5px 8px;
          border-bottom: 1px solid #f0f0f0;
        }

        .fb-chat-monitor-log-entry:last-child {
          border-bottom: none;
        }

        .fb-chat-monitor-log-INFO {
          color: #2196F3;
        }

        .fb-chat-monitor-log-ERROR {
          color: #f44336;
          font-weight: bold;
        }

        .fb-chat-monitor-log-WARN {
          color: #ff9800;
        }

        .fb-chat-monitor-log-time {
          color: #666;
          margin-right: 5px;
        }

        .fb-chat-monitor-history-container {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 13px;
        }

        .fb-chat-monitor-history-container th {
          background-color: #f5f5f5;
          text-align: left;
          padding: 8px;
          border-bottom: 2px solid #ddd;
        }

        .fb-chat-monitor-history-container td {
          padding: 8px;
          border-bottom: 1px solid #eee;
        }

        .fb-chat-monitor-history-container tr:hover {
          background-color: #f9f9f9;
          cursor: pointer;
        }

        .fb-chat-monitor-badge {
          display: inline-block;
          padding: 3px 6px;
          border-radius: 10px;
          font-size: 11px;
          color: white;
          margin-right: 5px;
        }

        .fb-chat-monitor-badge-auto {
          background-color: #4CAF50;
        }

        .fb-chat-monitor-badge-manual {
          background-color: #2196F3;
        }

        .fb-chat-monitor-badge-generate {
          background-color: #ff9800;
        }

        .fb-chat-monitor-badge-sent {
          background-color: #4CAF50;
        }

        .fb-chat-monitor-badge-notsent {
          background-color: #f44336;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Tooltip styles */
        .fb-chat-monitor-tooltip {
          position: relative;
          display: inline-block;
        }

        .fb-chat-monitor-tooltip .fb-chat-monitor-tooltiptext {
          visibility: hidden;
          width: 200px;
          background-color: rgba(0, 0, 0, 0.8);
          color: #fff;
          text-align: center;
          border-radius: 6px;
          padding: 5px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 12px;
        }

        .fb-chat-monitor-tooltip:hover .fb-chat-monitor-tooltiptext {
          visibility: visible;
          opacity: 1;
        }
      `;

  domUtils.injectStyles(styles);
}
/**
 * Toggle visibility of the control panel
 */
function toggleControlPanel() {
  // Check if the panel already exists
  if (uiState.controlPanel) {
    uiState.controlPanel.remove();
    uiState.controlPanel = null;
    uiState.isControlPanelVisible = false;
    // Also reset the minimized state when completely closed
    uiState.isControlPanelMinimized = false;
    
    // Update floating button visibility when the panel is closed
    updateFloatingResponseButtonVisibility();
    return;
  }

  // Create the control panel
  uiState.controlPanel = createControlPanel();
  uiState.isControlPanelVisible = true;
  
  // ADDED: Hide the floating button when the panel is opened
  if (uiState.floatingResponseButton) {
    uiState.floatingResponseButton.style.display = 'none';
  }

  // ADDED: Check if the panel is out of the window bounds
  document.body.appendChild(uiState.controlPanel);
  const panelRect = uiState.controlPanel.getBoundingClientRect();

  // Adjust if it's out at the bottom
  if (panelRect.bottom > window.innerHeight) {
    uiState.controlPanel.style.top = `${window.innerHeight - panelRect.height - 10}px`;
  }

  // Adjust if it's out on the right
  if (panelRect.right > window.innerWidth) {
    uiState.controlPanel.style.right = '10px';
  }

  // Update stats immediately
  updateStats();

  // Set up stats refresh timer
  const statsRefreshTimer = setInterval(() => {
    if (!uiState.isControlPanelVisible) {
      clearInterval(statsRefreshTimer);
      return;
    }
    updateStats();
  }, 3000);

  // Show the current tab
  showTabContent(uiState.activeTab);
}

/**
 * Create the main control panel
 * @returns {HTMLElement} The panel element
 */
function createControlPanel() {
  const panel = document.createElement('div');
  panel.id = 'fbChatMonitorPanel';
  panel.className = 'fb-chat-monitor-panel';

  // MODIFIED: Get the position of the main button and position the panel below
  const mainButton = document.getElementById('fbChatMonitorButton');

  // Base style of the panel
  panel.style.position = 'fixed';
  panel.style.width = '390px';
  panel.style.padding = '10px';
  panel.style.backgroundColor = '#fff';
  panel.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  panel.style.borderRadius = '8px';
  panel.style.zIndex = '9999';
  panel.style.display = 'block';

  // MODIFIED: Calculate position based on the location of the main button
  if (mainButton) {
    const buttonRect = mainButton.getBoundingClientRect();
    panel.style.top = `${buttonRect.bottom + 5}px`; // 5px below the button
    panel.style.right = `${window.innerWidth - buttonRect.right}px`; // Aligned with the right side of the button
  } else {
    // Original position if the button is not found
    panel.style.top = '60px';
    panel.style.right = '20px';
  }

  // MODIFIED: Panel height control
  panel.style.height = '500px'; // Sets a fixed height of 500px
  panel.style.overflowY = 'auto'; // Allows scrolling if the content is larger

  // Header
  const header = document.createElement('div');
  header.className = 'fb-chat-monitor-panel-header';

  const title = document.createElement('h2');
  title.textContent = `FB Chat Monitor v${CONFIG.version || '1.0'}`;

  const closeButton = document.createElement('button');
  closeButton.className = 'fb-chat-monitor-close';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', toggleControlPanel);

  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'fb-chat-monitor-panel-tabs';

  const tabItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'assistants', label: 'Assistants' },
    { id: 'config', label: 'Settings' },
    { id: 'logs', label: 'Logs' },
    { id: 'history', label: 'History' }
  ];

  tabItems.forEach(tab => {
    const tabElement = document.createElement('div');
    tabElement.className = `fb-chat-monitor-tab ${uiState.activeTab === tab.id ? 'active' : ''}`;
    tabElement.setAttribute('data-tab', tab.id);
    tabElement.textContent = tab.label;
    tabElement.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.fb-chat-monitor-tab').forEach(el => {
        el.classList.remove('active');
      });
      tabElement.classList.add('active');

      // Show content
      showTabContent(tab.id);

      // Save state
      uiState.activeTab = tab.id;
      storageUtils.set('UI_STATE', { activeTab: tab.id });
    });

    tabs.appendChild(tabElement);
  });

  panel.appendChild(tabs);

  // Content area
  const content = document.createElement('div');
  content.className = 'fb-chat-monitor-panel-content';

  // Dashboard tab
  const dashboardTab = document.createElement('div');
  dashboardTab.className = 'fb-chat-monitor-tab-content';
  dashboardTab.id = 'fb-chat-monitor-tab-dashboard';
  dashboardTab.innerHTML = createDashboardContent();
  content.appendChild(dashboardTab);

  // Assistants tab
  const assistantsTab = document.createElement('div');
  assistantsTab.className = 'fb-chat-monitor-tab-content';
  assistantsTab.id = 'fb-chat-monitor-tab-assistants';
  assistantsTab.innerHTML = createAssistantsContent();
  content.appendChild(assistantsTab);

  // Config tab
  const configTab = document.createElement('div');
  configTab.className = 'fb-chat-monitor-tab-content';
  configTab.id = 'fb-chat-monitor-tab-config';
  configTab.innerHTML = createConfigContent();
  content.appendChild(configTab);

  // Logs tab
  const logsTab = document.createElement('div');
  logsTab.className = 'fb-chat-monitor-tab-content';
  logsTab.id = 'fb-chat-monitor-tab-logs';
  logsTab.innerHTML = createLogsContent();
  content.appendChild(logsTab);

  // History tab
  const historyTab = document.createElement('div');
  historyTab.className = 'fb-chat-monitor-tab-content';
  historyTab.id = 'fb-chat-monitor-tab-history';
  historyTab.innerHTML = createHistoryContent();
  content.appendChild(historyTab);

  panel.appendChild(content);
  document.body.appendChild(panel);

  // Attach event handlers to buttons and inputs
  attachEventHandlers();

  return panel;
}

/**
 * Show a specific tab content
 * @param {string} tabId - The ID of the tab to show
 */
function showTabContent(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.fb-chat-monitor-tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Show selected tab
  const selectedTab = document.getElementById(`fb-chat-monitor-tab-${tabId}`);
  if (selectedTab) {
    selectedTab.classList.add('active');

    // Perform tab-specific actions
    if (tabId === 'logs') {
      refreshLogs();
    } else if (tabId === 'history') {
      refreshHistory();
    }
  }
}

/**
 * Create content for the Dashboard tab
 * @returns {string} HTML content
 */
function createDashboardContent() {
  return `
        <div class="fb-chat-monitor-form-group"
             style="display:flex; justify-content:center; align-items:center; gap:8px; text-align:center;">
          <label for="fb-chat-monitor-mode-toggle" style="margin:0;">
            Auto Mode (Automatically send responses)
          </label>
          <select id="fb-chat-monitor-mode-toggle"
                  style="width:auto; padding:4px 8px; text-align:center;
                         background-color:#dc3545; color:white; border:none; border-radius:4px;">
            <option value="on">ON</option>
            <option value="off" selected>OFF</option>
          </select>
        </div>

        <div class="fb-chat-monitor-stats-grid">
          <div class="fb-chat-monitor-stat-item">
            <div id="fb-chat-monitor-stat-processed" class="fb-chat-monitor-stat-value">0</div>
            <div class="fb-chat-monitor-stat-label">Chats Processed</div>
          </div>
          <div class="fb-chat-monitor-stat-item">
            <div id="fb-chat-monitor-stat-responses" class="fb-chat-monitor-stat-value">0</div>
            <div class="fb-chat-monitor-stat-label">Responses Sent</div>
          </div>
          <div class="fb-chat-monitor-stat-item">
            <div id="fb-chat-monitor-stat-uptime" class="fb-chat-monitor-stat-value">0m</div>
            <div class="fb-chat-monitor-stat-label">Uptime</div>
          </div>
          <div class="fb-chat-monitor-stat-item">
            <div id="fb-chat-monitor-stat-errors" class="fb-chat-monitor-stat-value">0</div>
            <div class="fb-chat-monitor-stat-label">Errors</div>
          </div>
        </div>

        <div class="fb-chat-monitor-form-group" style="text-align:center;">
          <button
            id="fb-chat-monitor-generate-response"
            class="fb-chat-monitor-button"
            disabled
          >
            Generate Response
          </button>
        </div>
      `;
}

/**
 * Create content for the Assistants tab
 * @returns {string} HTML content
 */
function createAssistantsContent() {
  return `
        <div class="fb-chat-monitor-form-group">
          <label for="fb-chat-monitor-openai-key">OpenAI API Key</label>
          <input type="password" id="fb-chat-monitor-openai-key" placeholder="sk-..." value="${CONFIG.AI.apiKey || ''}">
          <button id="fb-chat-monitor-save-api-key" class="fb-chat-monitor-button" style="margin-top: 8px;">Save API Key</button>
        </div>

        <div class="fb-chat-monitor-form-group">
          <h4 style="margin-top: 20px; margin-bottom: 10px;">Seller Assistant</h4>
          <div id="fb-chat-monitor-seller-assistant-container">
            <label for="fb-chat-monitor-seller-assistant">Select Seller Assistant</label>
            <select id="fb-chat-monitor-seller-assistant">
              <option value="">Loading assistants...</option>
            </select>
            <small style="display:block; margin-top:5px; color:#666;">Used when you're selling an item</small>
          </div>
        </div>

        <div class="fb-chat-monitor-form-group">
          <h4 style="margin-top: 20px; margin-bottom: 10px;">Buyer Assistant</h4>
          <div id="fb-chat-monitor-buyer-assistant-container">
            <label for="fb-chat-monitor-buyer-assistant">Select Buyer Assistant</label>
            <select id="fb-chat-monitor-buyer-assistant">
              <option value="">Loading assistants...</option>
            </select>
            <small style="display:block; margin-top:5px; color:#666;">Used when you're buying an item</small>
          </div>
        </div>

        <div>
          <button id="fb-chat-monitor-refresh-assistants" class="fb-chat-monitor-button">Refresh Assistants</button>
        </div>
      `;
}

/**
 * Create content for the Config tab
 * @returns {string} HTML content
 */
function createConfigContent() {
  return `
        <div class="fb-chat-monitor-form-group">
          <h4 style="margin-top: 0; margin-bottom: 10px;">Monitoring Settings</h4>

          <label for="fb-chat-monitor-scan-interval">Scan interval (seconds)</label>
          <input type="number" id="fb-chat-monitor-scan-interval" min="5" max="300" value="${Math.floor((CONFIG.scanInterval || 30000) / 1000)}">
          <small style="display:block; margin-top:5px; color:#666;">How often to check for new messages</small>
        </div>

        <div class="fb-chat-monitor-form-group">
          <h4 style="margin-top: 20px; margin-bottom: 10px;">Human Simulation</h4>

          <label for="fb-chat-monitor-typing-speed">Typing speed (characters per second)</label>
          <input type="number" id="fb-chat-monitor-typing-speed" min="1" max="20" value="${CONFIG.AI?.humanSimulation?.baseTypingSpeed || 5}">
          <small style="display:block; margin-top:5px; color:#666;">Higher values = faster typing</small>
        </div>

        <div>
          <button id="fb-chat-monitor-save-config" class="fb-chat-monitor-button">Save Settings</button>
          <button id="fb-chat-monitor-reset-config" class="fb-chat-monitor-button fb-chat-monitor-button-danger">Reset to Defaults</button>
        </div>
      `;
}

/**
 * Create content for the Logs tab
 * @returns {string} HTML content
 */
function createLogsContent() {
  return `
        <div class="fb-chat-monitor-form-group" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <label for="fb-chat-monitor-log-level">Log Level</label>
            <select id="fb-chat-monitor-log-level">
              <option value="all">All Logs</option>
              <option value="error">Errors Only</option>
              <option value="warn">Warnings & Errors</option>
              <option value="info">Info & Above</option>
            </select>
          </div>
          <div>
            <button id="fb-chat-monitor-refresh-logs" class="fb-chat-monitor-button fb-chat-monitor-button-secondary">Refresh</button>
            <button id="fb-chat-monitor-clear-logs" class="fb-chat-monitor-button fb-chat-monitor-button-danger">Clear Logs</button>
          </div>
        </div>

        <div class="fb-chat-monitor-logs-container" id="fb-chat-monitor-logs-list">
          <div class="fb-chat-monitor-log-entry">
            <span class="fb-chat-monitor-log-time">Loading logs...</span>
          </div>
        </div>

        <div style="margin-top: 15px;">
          <button id="fb-chat-monitor-export-logs" class="fb-chat-monitor-button">Export Logs</button>
        </div>
      `;
}

/**
 * Create content for the History tab
 * @returns {string} HTML content
 */
function createHistoryContent() {
  return `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0;">Conversation History</h4>
          <div>
            <button id="fb-chat-monitor-refresh-history" class="fb-chat-monitor-button fb-chat-monitor-button-secondary">Refresh</button>
            <button id="fb-chat-monitor-clear-history" class="fb-chat-monitor-button fb-chat-monitor-button-danger">Clear</button>
          </div>
        </div>

        <div id="fb-chat-monitor-history-container" style="max-height: 300px; overflow-y: auto;">
          <table class="fb-chat-monitor-history-container">
            <thead>
              <tr>
                <th>Time</th>
                <th>Mode</th>
                <th>Content</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="fb-chat-monitor-history-list">
              <tr>
                <td colspan="4" style="text-align: center;">Loading history...</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="margin-top: 15px;">
          <button id="fb-chat-monitor-export-history" class="fb-chat-monitor-button">Export History</button>
        </div>
      `;
}

/**
 * Attach event handlers to buttons and inputs
 */
function attachEventHandlers() {
  // --- Custom dropdown implementation for mode toggle ---
  const modeOptions = [
    { value: 'on', text: 'ON', color: '#28a745' },
    { value: 'off', text: 'OFF', color: '#dc3545' }
  ];

  // Replace select with custom dropdown
  const modeToggleContainer = document.getElementById('fb-chat-monitor-mode-toggle').parentNode;
  const currentValue = CONFIG.operationMode === 'auto' ? 'on' : 'off';

  // Create custom dropdown components
  const customDropdown = document.createElement('div');
  customDropdown.className = 'fb-chat-monitor-custom-dropdown';
  customDropdown.style.position = 'relative';
  customDropdown.style.display = 'inline-block';
  customDropdown.style.minWidth = '60px';

  // Main button that shows current selection
  const dropdownButton = document.createElement('div');
  dropdownButton.className = 'fb-chat-monitor-dropdown-button';
  dropdownButton.setAttribute('tabindex', '0'); // Make it focusable
  dropdownButton.style.padding = '4px 8px';
  dropdownButton.style.borderRadius = '4px';
  dropdownButton.style.cursor = 'pointer';
  dropdownButton.style.userSelect = 'none';
  dropdownButton.style.textAlign = 'center';
  dropdownButton.style.fontWeight = 'bold';
  dropdownButton.style.display = 'flex';
  dropdownButton.style.alignItems = 'center';
  dropdownButton.style.justifyContent = 'center';
  dropdownButton.style.gap = '6px';
  dropdownButton.style.transition = 'background-color 0.2s ease-in-out';
  dropdownButton.title = "Click to toggle Auto Mode"; // Add tooltip

  // Add down arrow icon element
  const arrowIcon = document.createElement('span');
  arrowIcon.innerHTML = '▼';
  arrowIcon.style.fontSize = '10px';
  arrowIcon.style.marginLeft = '2px';
  arrowIcon.style.position = 'relative';
  arrowIcon.style.top = '1px';

  // Dropdown menu container (hidden initially)
  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'fb-chat-monitor-dropdown-content';
  dropdownContent.style.display = 'none';
  dropdownContent.style.position = 'absolute';
  dropdownContent.style.zIndex = '10000';
  dropdownContent.style.left = '0';
  dropdownContent.style.right = '0';
  dropdownContent.style.marginTop = '2px';
  dropdownContent.style.borderRadius = '4px';
  dropdownContent.style.overflow = 'hidden';
  dropdownContent.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

  // Add to DOM structure
  customDropdown.appendChild(dropdownButton);
  customDropdown.appendChild(dropdownContent);

  // Replace the original select with our custom dropdown
  const oldSelect = document.getElementById('fb-chat-monitor-mode-toggle');
  modeToggleContainer.replaceChild(customDropdown, oldSelect);

  // Function to update button state
  function updateButtonState(value) {
    const option = modeOptions.find(opt => opt.value === value);
    if (!option) return;

    // Update button appearance
    dropdownButton.innerHTML = ''; // Clear existing content

    // Add text span
    const textSpan = document.createElement('span');
    textSpan.textContent = option.text;
    dropdownButton.appendChild(textSpan);

    // Add arrow icon
    dropdownButton.appendChild(arrowIcon.cloneNode(true));

    // Update button style
    dropdownButton.style.backgroundColor = option.color;
    dropdownButton.style.color = 'white';

    // Add hover effect
    dropdownButton.onmouseover = function () {
      this.style.backgroundColor = adjustColor(option.color, -15); // Darken on hover
    };

    dropdownButton.onmouseout = function () {
      this.style.backgroundColor = option.color; // Restore original color
    };

    // Store current value
    dropdownButton.dataset.value = value;

    // Update dropdown content with opposite option
    updateDropdownContent();
  }

  // Function to darken or lighten a hex color
  function adjustColor(hex, percent) {
    // Parse hex color
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    // Adjust each component
    r = Math.max(0, Math.min(255, r + percent));
    g = Math.max(0, Math.min(255, g + percent));
    b = Math.max(0, Math.min(255, b + percent));

    // Convert back to hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Function to update dropdown content with the opposite option
  function updateDropdownContent() {
    dropdownContent.innerHTML = '';

    const currentValue = dropdownButton.dataset.value;
    const oppositeOption = modeOptions.find(opt => opt.value !== currentValue);

    if (!oppositeOption) return;

    const optionElement = document.createElement('div');
    optionElement.className = 'fb-chat-monitor-dropdown-item';
    optionElement.textContent = oppositeOption.text;
    optionElement.dataset.value = oppositeOption.value;
    optionElement.style.padding = '4px 8px';
    optionElement.style.cursor = 'pointer';
    optionElement.style.backgroundColor = oppositeOption.color;
    optionElement.style.color = 'white';
    optionElement.style.textAlign = 'center';
    optionElement.style.fontWeight = 'bold';
    optionElement.style.transition = 'background-color 0.2s ease-in-out';

    // Add hover effect for dropdown item
    optionElement.onmouseover = function () {
      this.style.backgroundColor = adjustColor(oppositeOption.color, -15); // Darken on hover
    };

    optionElement.onmouseout = function () {
      this.style.backgroundColor = oppositeOption.color;
    };

    // Handle option click
    optionElement.addEventListener('click', function (e) {
      e.stopPropagation();

      // Toggle dropdown visibility
      dropdownContent.style.display = 'none';

      // Get new value
      const newValue = this.dataset.value;

      // Update button state
      updateButtonState(newValue);

      // Trigger logic based on new value
      handleModeChange(newValue);
    });

    dropdownContent.appendChild(optionElement);
  }

  // Update the code that enables/disables the Generate Response button
  function handleModeChange(value) {
    const genBtn = document.getElementById('fb-chat-monitor-generate-response');
    if (value === 'on') {
      // CORREGIDO: Comprobamos si existe FBChatMonitor antes de llamar a sus métodos
      if (window.FBChatMonitor) {
        window.FBChatMonitor.changeOperationMode('auto');
        window.FBChatMonitor.toggleMonitoring(true);
      } else {
        logger.error('FBChatMonitor no disponible');
      }
      if (genBtn) genBtn.setAttribute('disabled', ''); // Disable button in auto mode
    } else {
      // CORREGIDO: Comprobamos si existe FBChatMonitor antes de llamar a sus métodos
      if (window.FBChatMonitor) {
        window.FBChatMonitor.changeOperationMode('manual');
        window.FBChatMonitor.toggleMonitoring(false);
      } else {
        logger.error('FBChatMonitor no disponible');
      }
      if (genBtn) genBtn.removeAttribute('disabled'); // Enable button in manual mode
    }
  }

  // Toggle dropdown when button is clicked
  dropdownButton.addEventListener('click', function (e) {
    e.stopPropagation();

    // Toggle dropdown visibility
    const isVisible = dropdownContent.style.display === 'block';
    dropdownContent.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      // Ensure dropdown content shows the opposite option
      updateDropdownContent();
    }
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', function () {
    dropdownContent.style.display = 'none';
  });

  // Initialize with current value
  updateButtonState(currentValue);
  // Apply initial mode logic so the UI and monitoring state match the default
  handleModeChange(currentValue);

  // Generate Response: use chatManager.generateResponseForCurrentChat
  document.getElementById('fb-chat-monitor-generate-response')
    .addEventListener('click', async () => {
      try {
        const success = await chatManager.generateResponseForCurrentChat();
        if (!success) {
          // Error messages are already handled in the method
          logger.debug('Failed to generate response via UI button');
        }
      } catch (e) {
        showSimpleAlert(`Error generating response: ${e.message}`, 'error');
      }
    });

  // Assistants tab
  document.getElementById('fb-chat-monitor-save-api-key').addEventListener('click', async () => {
    const keyInput = document.getElementById('fb-chat-monitor-openai-key');
    const apiKey = keyInput.value.trim();

    if (!apiKey) {
      showSimpleAlert('Please enter a valid API Key', 'error');
      return;
    }

    try {
      const button = document.getElementById('fb-chat-monitor-save-api-key');
      button.textContent = 'Validating...';
      button.disabled = true;

      const success = await openAIManager.setApiKey(apiKey);

      if (success) {
        showSimpleAlert('API Key validated and saved successfully', 'success');
        refreshAssistantsList();
      } else {
        showSimpleAlert('Invalid API Key', 'error');
      }
    } catch (error) {
      showSimpleAlert(`Error: ${error.message}`, 'error');
    } finally {
      const button = document.getElementById('fb-chat-monitor-save-api-key');
      button.textContent = 'Save API Key';
      button.disabled = false;
    }
  });

  document.getElementById('fb-chat-monitor-refresh-assistants').addEventListener('click', refreshAssistantsList);

  // Config tab
  document.getElementById('fb-chat-monitor-save-config').addEventListener('click', saveConfig);
  document.getElementById('fb-chat-monitor-reset-config').addEventListener('click', resetConfig);

  // Logs tab
  document.getElementById('fb-chat-monitor-refresh-logs').addEventListener('click', refreshLogs);
  document.getElementById('fb-chat-monitor-clear-logs').addEventListener('click', clearLogs);
  document.getElementById('fb-chat-monitor-export-logs').addEventListener('click', exportLogs);
  document.getElementById('fb-chat-monitor-log-level').addEventListener('change', refreshLogs);

  // History tab
  document.getElementById('fb-chat-monitor-refresh-history').addEventListener('click', refreshHistory);
  document.getElementById('fb-chat-monitor-clear-history').addEventListener('click', clearHistory);
  document.getElementById('fb-chat-monitor-export-history').addEventListener('click', exportHistory);
}

/**
 * Update stats display with latest data
 */
function updateStats() {
  try {
    const stats = window.FBChatMonitor && typeof window.FBChatMonitor.getMonitoringStats === 'function'
      ? window.FBChatMonitor.getMonitoringStats()
      : {
        chatsProcessed: 0,
        responsesSent: 0,
        errors: 0,
        uptime: 0,
        isMonitoring: false,
        nextScanIn: null
      };

    // Update stat values
    document.getElementById('fb-chat-monitor-stat-processed').textContent = stats.chatsProcessed || 0;
    document.getElementById('fb-chat-monitor-stat-responses').textContent = stats.responsesSent || 0;
    document.getElementById('fb-chat-monitor-stat-errors').textContent = stats.errors || 0;

    // Calculate uptime
    let uptimeText = 'Inactive';
    if (stats.uptime > 0) {
      const uptimeMinutes = Math.floor(stats.uptime / 1000 / 60);
      const uptimeHours = Math.floor(uptimeMinutes / 60);
      if (uptimeHours > 0) {
        uptimeText = `${uptimeHours}h ${uptimeMinutes % 60}m`;
      } else {
        uptimeText = `${uptimeMinutes}m`;
      }
    }
    document.getElementById('fb-chat-monitor-stat-uptime').textContent = uptimeText;

    // Update floating button dot
    if (uiState.statusIndicator) {
      uiState.statusIndicator.style.backgroundColor = stats.isMonitoring ? '#4CAF50' : '#f44336';
    }
  } catch (error) {
    logger.error('Error updating stats', {}, error);
  }
}

/**
 * Refresh the list of assistants
 */
async function refreshAssistantsList() {
  try {
    const sellerSelect = document.getElementById('fb-chat-monitor-seller-assistant');
    const buyerSelect = document.getElementById('fb-chat-monitor-buyer-assistant');

    if (sellerSelect) sellerSelect.innerHTML = '<option value="">Loading assistants...</option>';
    if (buyerSelect) buyerSelect.innerHTML = '<option value="">Loading assistants...</option>';

    const assistants = await openAIManager.listAssistants();

    if (!assistants || assistants.length === 0) {
      if (sellerSelect) sellerSelect.innerHTML = '<option value="">No assistants found</option>';
      if (buyerSelect) buyerSelect.innerHTML = '<option value="">No assistants found</option>';
      return;
    }

    // Populate selects
    const populateSelect = (select, currentValue) => {
      if (!select) return;

      select.innerHTML = '<option value="">Select an assistant</option>';

      assistants.forEach(assistant => {
        const option = document.createElement('option');
        option.value = assistant.id;
        option.textContent = assistant.name;

        if (assistant.id === currentValue) {
          option.selected = true;
        }

        select.appendChild(option);
      });

      // Add change handler
      select.addEventListener('change', function () {
        const role = this.id === 'fb-chat-monitor-seller-assistant' ? 'seller' : 'buyer';
        openAIManager.setAssistantForRole(role, this.value);
        showSimpleAlert(`${role.charAt(0).toUpperCase() + role.slice(1)} assistant updated`, 'success');
      });
    };

    populateSelect(sellerSelect, CONFIG.AI?.assistants?.seller?.id);
    populateSelect(buyerSelect, CONFIG.AI?.assistants?.buyer?.id);

  } catch (error) {
    logger.error('Error refreshing assistants', {}, error);
    showSimpleAlert(`Error loading assistants: ${error.message}`, 'error');

    const sellerSelect = document.getElementById('fb-chat-monitor-seller-assistant');
    const buyerSelect = document.getElementById('fb-chat-monitor-buyer-assistant');

    if (sellerSelect) sellerSelect.innerHTML = '<option value="">Error loading assistants</option>';
    if (buyerSelect) buyerSelect.innerHTML = '<option value="">Error loading assistants</option>';
  }
}

/**
 * Saves configuration to persistent storage
 */
function saveConfig() {
  if (typeof GM_setValue !== 'function') {
    logger.warn('GM_setValue not available. Cannot save persistent configuration.');
    return;
  }
  
  try {
    // Only save options that still exist
    GM_setValue('CONFIG_operationMode', window.CONFIG.operationMode || 'manual');
    GM_setValue('CONFIG_autoSendMessages', window.CONFIG.autoSendMessages || false);
    
    // Save API key if it exists
    if (window.CONFIG.AI && window.CONFIG.AI.apiKey) {
      GM_setValue('CONFIG_AI_apiKey', window.CONFIG.AI.apiKey);
    }
    
    logger.log('Configuration saved to persistent storage');
  } catch (error) {
    logger.error(`Error saving configuration: ${error.message}`);
  }
}

/**
 * Loads configuration from persistent storage
 */
function loadConfig() {
  if (typeof GM_getValue !== 'function') {
    logger.warn('GM_getValue not available. Using default configuration.');
    return;
  }
  
  try {
    // Only load options that still exist
    window.CONFIG.operationMode = GM_getValue('CONFIG_operationMode', 'manual');
    window.CONFIG.autoSendMessages = GM_getValue('CONFIG_autoSendMessages', false);
    
    // Load API key if it exists
    if (!window.CONFIG.AI) window.CONFIG.AI = {};
    window.CONFIG.AI.apiKey = GM_getValue('CONFIG_AI_apiKey', '');
    
    logger.log('Configuration loaded from persistent storage');
    
    // Update UI with the loaded configuration
    updateUIWithLoadedConfig();
  } catch (error) {
    logger.error(`Error loading configuration: ${error.message}`);
  }
}

/**
 * Updates the UI with the loaded configuration
 */
function updateUIWithLoadedConfig() {
  // Update operation mode in the UI
  updateUIForConfigChange('operationMode', window.CONFIG.operationMode);
}

/**
 * Reset configuration to defaults
 */
function resetConfig() {
  if (confirm('Are you sure you want to reset all settings to default values?')) {
    storageUtils.remove('CONFIG');
    showSimpleAlert('Settings reset to defaults. Reloading...', 'info');
    setTimeout(() => window.location.reload(), 2000);
  }
}

/**
 * Refresh logs display
 */
function refreshLogs() {
  try {
    const logsContainer = document.getElementById('fb-chat-monitor-logs-list');
    const logLevel = document.getElementById('fb-chat-monitor-log-level').value;

    // Get logs
    const logs = logger.getAllLogs();

    if (logs.length === 0) {
      logsContainer.innerHTML = '<div class="fb-chat-monitor-log-entry">No logs recorded</div>';
      return;
    }

    // Filter logs by level
    let filteredLogs = logs;
    if (logLevel === 'error') {
      filteredLogs = logs.filter(log => log.type === 'ERROR');
    } else if (logLevel === 'warn') {
      filteredLogs = logs.filter(log => log.type === 'ERROR' || log.type === 'WARN');
    } else if (logLevel === 'info') {
      filteredLogs = logs.filter(log => log.type === 'ERROR' || log.type === 'WARN' || log.type === 'INFO');
    }

    // Render logs
    logsContainer.innerHTML = '';
    filteredLogs.slice(0, 100).forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = `fb-chat-monitor-log-entry fb-chat-monitor-log-${log.type}`;

      const date = new Date(log.timestamp);
      const timeString = `${date.toLocaleTimeString()}`;
      logEntry.innerHTML = `
            <span class="fb-chat-monitor-log-time">${timeString}</span>
            <span class="fb-chat-monitor-log-message">${log.message}</span>
          `;

      logsContainer.appendChild(logEntry);
    });

    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
  } catch (error) {
    console.error('Error refreshing logs', error);
  }
}

/**
 * Clear all logs
 */
function clearLogs() {
  if (confirm('Are you sure you want to clear all logs?')) {
    logger.clearLogs();
    refreshLogs();
    showSimpleAlert('Logs cleared', 'success');
  }
}

/**
 * Export logs to a file
 */
function exportLogs() {
  try {
    const logs = logger.getAllLogs();
    const exportData = {
      timestamp: new Date().toISOString(),
      version: CONFIG.version || '1.0',
      logs: logs
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fb-chat-monitor-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSimpleAlert('Logs exported successfully', 'success');
  } catch (error) {
    logger.error('Error exporting logs', {}, error);
    showSimpleAlert(`Error exporting logs: ${error.message}`, 'error');
  }
}

/**
 * Refresh conversation history display
 */
function refreshHistory() {
  try {
    const historyList = document.getElementById('fb-chat-monitor-history-list');

    // Get history
    const history = getConversationHistory();

    if (!history || history.length === 0) {
      historyList.innerHTML = '<tr><td colspan="4" style="text-align: center;">No conversation history</td></tr>';
      return;
    }

    // Render history
    historyList.innerHTML = '';
    history.slice(0, 50).forEach(item => {
      const row = document.createElement('tr');
      row.addEventListener('click', () => showConversationDetails(item));

      // Time column
      const timeCell = document.createElement('td');
      const date = new Date(item.timestamp);
      timeCell.textContent = timeUtils.formatDate(date).split(',')[1].trim(); // Just the time part

      // Mode column
      const modeCell = document.createElement('td');
      const modeBadge = document.createElement('span');
      modeBadge.textContent = item.mode;
      modeBadge.className = `fb-chat-monitor-badge fb-chat-monitor-badge-${item.mode}`;
      modeCell.appendChild(modeBadge);

      // Content column
      const contentCell = document.createElement('td');
      const content = item.context?.lastMessage || 'No content';
      contentCell.textContent = typeof content === 'string' ?
        content.substring(0, 30) + (content.length > 30 ? '...' : '') :
        'Complex content';

      // Status column
      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.textContent = item.sent ? 'Sent' : 'Not sent';
      statusBadge.className = `fb-chat-monitor-badge fb-chat-monitor-badge-${item.sent ? 'sent' : 'notsent'}`;
      statusCell.appendChild(statusBadge);

      row.appendChild(timeCell);
      row.appendChild(modeCell);
      row.appendChild(contentCell);
      row.appendChild(statusCell);
      historyList.appendChild(row);
    });
  } catch (error) {
    logger.error('Error refreshing history', {}, error);
    const historyList = document.getElementById('fb-chat-monitor-history-list');
    historyList.innerHTML = '<tr><td colspan="4" style="text-align: center;">Error loading history</td></tr>';
  }
}

/**
 * Show details of a conversation
 * @param {Object} conversation - The conversation data
 */
function showConversationDetails(conversation) {
  // Create modal to show details
  const modalOverlay = document.createElement('div');
  modalOverlay.style.position = 'fixed';
  modalOverlay.style.top = '0';
  modalOverlay.style.left = '0';
  modalOverlay.style.width = '100%';
  modalOverlay.style.height = '100%';
  modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modalOverlay.style.display = 'flex';
  modalOverlay.style.justifyContent = 'center';
  modalOverlay.style.alignItems = 'center';
  modalOverlay.style.zIndex = '10000';

  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = 'white';
  modalContent.style.borderRadius = '8px';
  modalContent.style.padding = '20px';
  modalContent.style.width = '600px';
  modalContent.style.maxWidth = '90%';
  modalContent.style.maxHeight = '80%';
  modalContent.style.overflowY = 'auto';
  modalContent.style.position = 'relative';

  // Close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '10px';
  closeButton.style.background = 'none';
  closeButton.style.border = 'none';
  closeButton.style.fontSize = '24px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => document.body.removeChild(modalOverlay));
  modalContent.appendChild(closeButton);

  // Title
  const title = document.createElement('h2');
  title.textContent = 'Conversation Details';
  title.style.marginTop = '0';
  title.style.marginBottom = '20px';
  modalContent.appendChild(title);

  // Details
  const details = document.createElement('div');

  // Format and add basic details
  const date = new Date(conversation.timestamp);
  details.innerHTML = `
        <p><strong>Time:</strong> ${timeUtils.formatDate(date)}</p>
        <p><strong>Mode:</strong> ${conversation.mode}</p>
        <p><strong>Status:</strong> ${conversation.sent ? 'Sent' : 'Not sent'}</p>
      `;

  // Add context details if available
  if (conversation.context) {
    const contextDiv = document.createElement('div');
    contextDiv.style.marginTop = '15px';
    contextDiv.style.marginBottom = '15px';
    contextDiv.innerHTML = `<h3 style="margin-top:0;">Context</h3>`;

    if (conversation.context.role) {
      contextDiv.innerHTML += `<p><strong>Role:</strong> ${conversation.context.role}</p>`;
    }

    if (conversation.context.productDetails) {
      const product = conversation.context.productDetails;
      contextDiv.innerHTML += `
            <div style="margin-top: 10px; margin-bottom: 15px;">
              <h4 style="margin-top: 0; margin-bottom: 5px;">Product Details</h4>
              <p style="margin: 2px 0;"><strong>Title:</strong> ${product.title || 'N/A'}</p>
              <p style="margin: 2px 0;"><strong>Price:</strong> ${product.price || 'N/A'}</p>
              ${product.id ? `<p style="margin: 2px 0;"><strong>ID:</strong> ${product.id}</p>` : ''}
            </div>
          `;
    }

    if (conversation.context.lastMessage) {
      contextDiv.innerHTML += `
            <div style="margin-top: 10px;">
              <h4 style="margin-top: 0; margin-bottom: 5px;">Last Message</h4>
              <div style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${conversation.context.lastMessage}</div>
            </div>
          `;
    }

    details.appendChild(contextDiv);
  }

  // Add response
  if (conversation.response) {
    const responseDiv = document.createElement('div');
    responseDiv.style.marginTop = '15px';
    responseDiv.innerHTML = `
          <h3 style="margin-top: 0;">Response</h3>
          <div style="background-color: #e9f5ff; padding: 10px; border-radius: 4px; white-space: pre-wrap; margin-bottom: 15px; border: 1px solid #2196F3;">${conversation.response}</div>
          <button id="copy-response-btn" style="padding: 5px 10px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy Response</button>
        `;
    details.appendChild(responseDiv);
  }

  modalContent.appendChild(details);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Add event listener for copy button
  const copyButton = document.getElementById('copy-response-btn');
  if (copyButton && conversation.response) {
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(conversation.response);
      copyButton.textContent = 'Copied!';
      setTimeout(() => copyButton.textContent = 'Copy Response', 2000);
    });
  }
}

/**
 * Clear conversation history
 */
function clearHistory() {
  if (confirm('Are you sure you want to clear all conversation history?')) {
    storageUtils.remove('RESPONSE_LOGS');
    refreshHistory();
    showSimpleAlert('Conversation history cleared', 'success');
  }
}

/**
 * Export conversation history
 */
function exportHistory() {
  try {
    const history = getConversationHistory();
    const exportData = {
      timestamp: new Date().toISOString(),
      version: CONFIG.version || '1.0',
      conversations: history
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fb-chat-monitor-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSimpleAlert('History exported successfully', 'success');
  } catch (error) {
    logger.error('Error exporting history', {}, error);
    showSimpleAlert(`Error exporting history: ${error.message}`, 'error');
  }
}

/**
 * Get conversation history from storage
 * @returns {Array} Conversation history
 */
function getConversationHistory() {
  return storageUtils.get('RESPONSE_LOGS', []);
}

/**
 * Update the monitoring status indicator
 * @param {boolean} isActive - True if monitoring is active
 */
function updateMonitoringStatus(isActive) {
  if (uiState.statusIndicator) {
    uiState.statusIndicator.style.backgroundColor = isActive ? '#4CAF50' : '#f44336';
  }
  // Update panel if it's open
  if (uiState.isControlPanelVisible) {
    updateStats();
  }
}

/**
* Updates the user interface to reflect the current mode
* @param {string} mode - Operation mode ('auto' or 'manual')
* @returns {boolean} - True if the UI was updated successfully
*/
function updateModeUI(mode) {
  try {
    const autoBtn = document.getElementById('fb-chat-auto-btn');
    const manualBtn = document.getElementById('fb-chat-manual-btn');

    if (!autoBtn || !manualBtn) {
      logger.debug('Mode buttons not found to update UI');
      return false;
    }

    // Clear classes from both buttons
    autoBtn.classList.remove('active', 'inactive');
    manualBtn.classList.remove('active', 'inactive');

    // Apply classes according to the mode
    if (mode === 'auto') {
      autoBtn.classList.add('active');
      manualBtn.classList.add('inactive');
      logger.debug('UI updated: AUTO mode activated');
    } else {
      autoBtn.classList.add('inactive');
      manualBtn.classList.add('active');
      logger.debug('UI updated: MANUAL mode activated');
    }

    // Trigger custom event to notify mode change
    document.dispatchEvent(new CustomEvent('configUpdated', {
      detail: { operationMode: mode }
    }));

    return true;
  } catch (error) {
    logger.error(`Error updating mode UI: ${error.message}`);
    return false;
  }
}

/**
 * Handles the click on the manual and automatic mode buttons
 * @param {string} mode - Operation mode ('auto' or 'manual')
 * @returns {boolean} - True if the mode was successfully changed
 */
function handleModeClick(mode) {
  try {
    // Verify that the mode is valid
    if (mode !== 'auto' && mode !== 'manual') {
      logger.error(`Invalid mode: ${mode}`);
      return false;
    }

    // Update global configuration (using the updated method)
    if (!window.CONFIG.updateOperationMode(mode)) {
      logger.error(`Could not update mode to ${mode}`);
      return false;
    }

    // Update UI
    updateModeUI(mode);

    // Show confirmation message
    const modeText = mode === 'auto' ? 'automatic' : 'manual';
    showSimpleAlert(`Mode ${modeText} activated`, 'success');

    return true;
  } catch (error) {
    logger.error(`Error changing mode: ${error.message}`);
    return false;
  }
}

/**
 * Creates a floating button to generate responses when the panel is closed and in manual mode
 * @returns {HTMLElement} Button element
 */
function createFloatingResponseButton() {
  const button = document.createElement('button');
  button.id = 'fbChatMonitorQuickResponse';
  button.classList.add('fb-chat-monitor-floating-button');
  button.textContent = '✨ Generate Response';
  
  // Styles to position near the message input field
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.zIndex = '9998'; // Lower than the main button but higher than FB elements
  button.style.padding = '8px 12px';
  button.style.backgroundColor = '#1877f2';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '5px';
  button.style.fontSize = '13px';
  button.style.cursor = 'pointer';
  button.style.fontWeight = 'bold';
  button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  button.style.display = 'none'; // Hidden by default
  
  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#166fe5';
  });
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#1877f2';
  });
  
  // Generate response on click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    // Use the same function as the original button
    if (window.chatManager && typeof window.chatManager.generateResponseForCurrentChat === 'function') {
      window.chatManager.generateResponseForCurrentChat();
    } else {
      console.error('chatManager not available or generateResponseForCurrentChat method not found');
      showSimpleAlert('Error: Could not generate response. Try opening the full panel.', 'error');
    }
  });
  
  return button;
}

/**
 * Updates the visibility of the floating response generation button
 * based on the current state (manual mode and closed panel)
 */
function updateFloatingResponseButtonVisibility() {
  if (!uiState.floatingResponseButton) {
    return;
  }
  
  // Verify if we are in manual mode (OFF)
  const isManualMode = window.CONFIG && window.CONFIG.operationMode === 'manual';
  
  // Only show the button if:
  // 1. We are in manual mode
  // 2. The panel is closed or minimized
  // 3. There is an active chat
  const shouldShow = isManualMode && 
                     !uiState.isControlPanelVisible && 
                     window.chatManager && 
                     window.chatManager.currentChatId;
  
  // Reposition the button to appear near the chat input field
  if (shouldShow) {
    // Find the input field or send button to better position the floating button
    const inputField = document.querySelector(CONFIG.selectors.activeChat.messageInput);
    const sendButton = domUtils.findElement(CONFIG.selectors.activeChat.sendButton);
    
    if (inputField || sendButton) {
      const referenceElement = inputField || sendButton;
      const rect = referenceElement.getBoundingClientRect();
      
      // Position just above the input field
      uiState.floatingResponseButton.style.bottom = `${window.innerHeight - rect.top + 10}px`;
      uiState.floatingResponseButton.style.right = '20px';
    }
    
    uiState.floatingResponseButton.style.display = 'block';
  } else {
    uiState.floatingResponseButton.style.display = 'none';
  }
}

/**
 * Shows a temporary alert in the interface
 * @param {string} message - Message text
 * @param {string} type - Alert type ('info', 'success', 'error', 'warning')
 * @param {number} duration - Duration in milliseconds
 */
function showSimpleAlert(message, type = 'info', duration = 3000) {
  // Create alert element
  const alert = document.createElement('div');
  alert.className = 'fb-chat-monitor-alert';
  
  // Determine the optimal position for the alert
  const positionInfo = getOptimalAlertPosition();
  
  // Apply base styles
  alert.style.position = 'fixed';
  alert.style.zIndex = '10000';
  alert.style.padding = '10px 15px';
  alert.style.borderRadius = '6px';
  alert.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
  alert.style.fontSize = '14px';
  alert.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out';
  alert.style.opacity = '0';
  alert.style.transform = 'translateY(20px)';
  alert.style.pointerEvents = 'none'; // So it doesn't interfere with clicks
  
  // Position the alert according to the calculated position
  alert.style.left = positionInfo.left;
  alert.style.top = positionInfo.top;
  alert.style.right = positionInfo.right;
  alert.style.maxWidth = '300px';
  
  // Apply styles according to alert type
  switch (type) {
    case 'success':
      alert.style.backgroundColor = '#4CAF50';
      alert.style.color = 'white';
      break;
    case 'error':
      alert.style.backgroundColor = '#F44336';
      alert.style.color = 'white';
      break;
    case 'warning':
      alert.style.backgroundColor = '#FF9800';
      alert.style.color = 'white';
      break;
    default: // info
      alert.style.backgroundColor = '#2196F3';
      alert.style.color = 'white';
  }
  
  // Add text
  alert.textContent = message;
  
  // Add to the DOM
  document.body.appendChild(alert);
  
  // Animate entry
  setTimeout(() => {
    alert.style.opacity = '1';
    alert.style.transform = 'translateY(0)';
  }, 50);
  
  // Remove after the specified duration
  setTimeout(() => {
    alert.style.opacity = '0';
    alert.style.transform = 'translateY(-20px)';
    
    // Remove from the DOM after the animation
    setTimeout(() => {
      if (alert.parentElement) {
        alert.parentElement.removeChild(alert);
      }
    }, 300);
  }, duration);
}

/**
 * Calculates the optimal position for alerts
 * @returns {Object} Object with positioning properties
 */
function getOptimalAlertPosition() {
  // Check if the panel is open or closed
  const panel = document.getElementById('fbChatMonitorPanel');
  const mainButton = document.getElementById('fbChatMonitorButton');
  
  // Default values (standard position in the upper right)
  const defaultPosition = {
    top: '60px',
    right: '20px',
    left: 'auto'
  };
  
  // If the panel is open, position below the panel
  if (panel && uiState.isControlPanelVisible) {
    const panelRect = panel.getBoundingClientRect();
    return {
      top: `${panelRect.bottom + 10}px`,
      right: `${window.innerWidth - panelRect.right}px`,
      left: 'auto'
    };
  }
  
  // If the main button is visible, position below the button
  if (mainButton) {
    const buttonRect = mainButton.getBoundingClientRect();
    return {
      top: `${buttonRect.bottom + 10}px`,
      right: `${window.innerWidth - buttonRect.right}px`,
      left: 'auto'
    };
  }
  
  // If there are no references, use the default position
  return defaultPosition;
}

// expose UI functions globally
window.initializeUI = initializeUI;
window.toggleControlPanel = toggleControlPanel;
window.updateMonitoringStatus = updateMonitoringStatus;
window.ui = { updateModeUI, handleModeClick };