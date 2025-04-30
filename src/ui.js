/**
 * User Interface module - Provides the main UI components for the FB-Chat-Monitor
 */

// UI State Storage
const uiState = {
  isControlPanelVisible: false,
  activeTab: 'dashboard',
  floatingButton: null,
  controlPanel: null,
  statusIndicator: null
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
  button.style.bottom = '20px';
  button.style.right = '20px';
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
  button.addEventListener('mouseover', function() {
    this.style.backgroundColor = '#365899';
  });
  
  button.addEventListener('mouseout', function() {
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
    return;
  }
  
  // Create the control panel
  uiState.controlPanel = createControlPanel();
  uiState.isControlPanelVisible = true;
  
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
  panel.className = 'fb-chat-monitor-panel';
  
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
    <div class="fb-chat-monitor-status-section">
      <div id="fb-chat-monitor-monitoring-status" class="fb-chat-monitor-status-indicator" style="background-color: #f44336;"></div>
      <div class="fb-chat-monitor-status-text">
        <div id="fb-chat-monitor-status-text">Monitoring is inactive</div>
        <div id="fb-chat-monitor-status-subtext" style="font-size: 12px; color: #666; margin-top: 5px;">Click to toggle monitoring</div>
      </div>
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
    
    <div class="fb-chat-monitor-form-group">
      <label>Operation Mode</label>
      <div class="fb-chat-monitor-radio-group">
        <div class="fb-chat-monitor-radio-option">
          <input type="radio" id="fb-chat-monitor-mode-auto" name="operation-mode" value="auto">
          <label for="fb-chat-monitor-mode-auto" class="fb-chat-monitor-radio-label">
            <span>Auto Mode</span>
            <span>Automatically send responses</span>
          </label>
        </div>
        <div class="fb-chat-monitor-radio-option">
          <input type="radio" id="fb-chat-monitor-mode-manual" name="operation-mode" value="manual">
          <label for="fb-chat-monitor-mode-manual" class="fb-chat-monitor-radio-label">
            <span>Manual Mode</span>
            <span>Review before sending</span>
          </label>
        </div>
        <div class="fb-chat-monitor-radio-option">
          <input type="radio" id="fb-chat-monitor-mode-generate" name="operation-mode" value="generate">
          <label for="fb-chat-monitor-mode-generate" class="fb-chat-monitor-radio-label">
            <span>Generate Only</span>
            <span>Generate responses without sending</span>
          </label>
        </div>
        <div class="fb-chat-monitor-radio-option">
          <input type="radio" id="fb-chat-monitor-mode-training" name="operation-mode" value="training">
          <label for="fb-chat-monitor-mode-training" class="fb-chat-monitor-radio-label">
            <span>Training Mode</span>
            <span>Collect examples for AI training</span>
          </label>
        </div>
      </div>
    </div>
    
    <div>
      <button id="fb-chat-monitor-toggle-monitoring" class="fb-chat-monitor-button fb-chat-monitor-button-success">Start Monitoring</button>
      <button id="fb-chat-monitor-scan-now" class="fb-chat-monitor-button">Scan Now</button>
      <button id="fb-chat-monitor-refresh-stats" class="fb-chat-monitor-button fb-chat-monitor-button-secondary">Refresh Stats</button>
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
      <button id="fb-chat-monitor-manage-assistants" class="fb-chat-monitor-button fb-chat-monitor-button-secondary">Advanced Management</button>
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
      
      <div style="margin-top: 10px;">
        <input type="checkbox" id="fb-chat-monitor-enable-typos" ${CONFIG.AI?.humanSimulation?.enableTypos ? 'checked' : ''}>
        <label for="fb-chat-monitor-enable-typos">Simulate occasional typos</label>
      </div>
      
      <div style="margin-top: 10px;">
        <input type="checkbox" id="fb-chat-monitor-fragment-messages" ${CONFIG.AI?.humanSimulation?.fragmentMessages ? 'checked' : ''}>
        <label for="fb-chat-monitor-fragment-messages">Split long messages into multiple parts</label>
      </div>
    </div>
    
    <div class="fb-chat-monitor-form-group">
      <h4 style="margin-top: 20px; margin-bottom: 10px;">Advanced Settings</h4>
      
      <div style="margin-top: 10px;">
        <input type="checkbox" id="fb-chat-monitor-debug-mode" ${CONFIG.debug ? 'checked' : ''}>
        <label for="fb-chat-monitor-debug-mode">Debug Mode</label>
      </div>
      
      <div style="margin-top: 10px;">
        <input type="checkbox" id="fb-chat-monitor-save-logs" ${CONFIG.logging?.saveLogs ? 'checked' : ''}>
        <label for="fb-chat-monitor-save-logs">Save logs to localStorage</label>
      </div>
      
      <div style="margin-top: 10px;">
        <input type="checkbox" id="fb-chat-monitor-stealth-mode" ${CONFIG.stealthMode ? 'checked' : ''}>
        <label for="fb-chat-monitor-stealth-mode">Stealth Mode (auto-pause when user is active)</label>
      </div>
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
  // Dashboard tab
  document.getElementById('fb-chat-monitor-toggle-monitoring').addEventListener('click', () => {
    const stats = getMonitoringStats();
    toggleMonitoring(!stats.isMonitoring);
    updateStats();
  });
  
  document.getElementById('fb-chat-monitor-scan-now').addEventListener('click', async () => {
    try {
      const button = document.getElementById('fb-chat-monitor-scan-now');
      button.textContent = 'Scanning...';
      button.disabled = true;
      
      await manualScan();
      
      setTimeout(() => {
        button.textContent = 'Scan Now';
        button.disabled = false;
        updateStats();
      }, 2000);
    } catch (error) {
      logger.error('Error during manual scan', {}, error);
    }
  });
  
  document.getElementById('fb-chat-monitor-refresh-stats').addEventListener('click', updateStats);
  
  const modeRadios = document.querySelectorAll('input[name="operation-mode"]');
  modeRadios.forEach(radio => {
    // Set initial state
    if (radio.value === CONFIG.operationMode) {
      radio.checked = true;
    }
    
    // Handle change
    radio.addEventListener('change', function() {
      if (this.checked) {
        window.FBChatMonitor.changeOperationMode(this.value);
      }
    });
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
  
  document.getElementById('fb-chat-monitor-manage-assistants').addEventListener('click', () => {
    showSimpleAlert('Advanced assistant management will be available in a future update', 'info');
  });
  
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
    const stats = getMonitoringStats();
    
    // Update stats values
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
    
    // Update monitoring status
    const statusIndicator = document.getElementById('fb-chat-monitor-monitoring-status');
    const statusText = document.getElementById('fb-chat-monitor-status-text');
    const statusSubtext = document.getElementById('fb-chat-monitor-status-subtext');
    const toggleButton = document.getElementById('fb-chat-monitor-toggle-monitoring');
    
    if (stats.isMonitoring) {
      statusIndicator.style.backgroundColor = '#4CAF50';
      statusText.textContent = 'Monitoring is active';
      toggleButton.textContent = 'Stop Monitoring';
      toggleButton.classList.remove('fb-chat-monitor-button-success');
      toggleButton.classList.add('fb-chat-monitor-button-danger');
      
      if (stats.nextScanIn) {
        const nextScanSeconds = Math.max(0, Math.round(stats.nextScanIn / 1000));
        statusSubtext.textContent = `Next scan in ${nextScanSeconds} seconds`;
      } else {
        statusSubtext.textContent = 'Monitoring active';
      }
    } else {
      statusIndicator.style.backgroundColor = '#f44336';
      statusText.textContent = 'Monitoring is inactive';
      statusSubtext.textContent = 'Click to toggle monitoring';
      toggleButton.textContent = 'Start Monitoring';
      toggleButton.classList.remove('fb-chat-monitor-button-danger');
      toggleButton.classList.add('fb-chat-monitor-button-success');
    }
    
    // Update main status indicator on button
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
      
      // Add event listener
      select.addEventListener('change', function() {
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
 * Save configuration changes
 */
function saveConfig() {
  try {
    // Get values from form
    const scanInterval = parseInt(document.getElementById('fb-chat-monitor-scan-interval').value) * 1000;
    const typingSpeed = parseInt(document.getElementById('fb-chat-monitor-typing-speed').value);
    const enableTypos = document.getElementById('fb-chat-monitor-enable-typos').checked;
    const fragmentMessages = document.getElementById('fb-chat-monitor-fragment-messages').checked;
    const debugMode = document.getElementById('fb-chat-monitor-debug-mode').checked;
    const saveLogs = document.getElementById('fb-chat-monitor-save-logs').checked;
    const stealthMode = document.getElementById('fb-chat-monitor-stealth-mode').checked;
    
    // Update CONFIG
    CONFIG.scanInterval = scanInterval;
    CONFIG.debug = debugMode;
    CONFIG.stealthMode = stealthMode;
    
    if (!CONFIG.AI) CONFIG.AI = {};
    if (!CONFIG.AI.humanSimulation) CONFIG.AI.humanSimulation = {};
    CONFIG.AI.humanSimulation.baseTypingSpeed = typingSpeed;
    CONFIG.AI.humanSimulation.enableTypos = enableTypos;
    CONFIG.AI.humanSimulation.fragmentMessages = fragmentMessages;
    
    if (!CONFIG.logging) CONFIG.logging = {};
    CONFIG.logging.saveLogs = saveLogs;
    
    // Save to storage
    storageUtils.set('CONFIG', CONFIG);
    
    showSimpleAlert('Settings saved successfully', 'success');
  } catch (error) {
    logger.error('Error saving config', {}, error);
    showSimpleAlert(`Error saving settings: ${error.message}`, 'error');
  }
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

// expose UI functions globally
window.initializeUI = initializeUI;
window.toggleControlPanel = toggleControlPanel;
window.updateMonitoringStatus = updateMonitoringStatus;