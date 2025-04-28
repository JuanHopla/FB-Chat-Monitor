// ----- USER INTERFACE -----
// Creates the floating button and control panel
function createFloatingButton() {
  // Main button
  const button = document.createElement('div');
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.left = '20px';
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
  
  // Status indicator (green dot)
  const statusDot = document.createElement('div');
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
  button.onmouseover = function() {
    this.style.backgroundColor = '#365899';
  };
  
  button.onmouseout = function() {
    this.style.backgroundColor = '#4267B2';
  };
  
  // Click to show panel
  button.onclick = toggleControlPanel;
  document.body.appendChild(button);
  return button;
}

// Shows/hides the control panel
function toggleControlPanel() {
  // Check if the panel already exists
  const existingPanel = document.getElementById('fb-chat-monitor-panel');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }
  
  // Create new panel
  const panel = document.createElement('div');
  panel.id = 'fb-chat-monitor-panel';
  panel.style.position = 'fixed';
  panel.style.bottom = '70px';
  panel.style.left = '20px';
  panel.style.width = '300px';
  panel.style.backgroundColor = 'white';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  panel.style.zIndex = '9998';
  panel.style.padding = '15px';
  panel.style.fontFamily = 'Arial, sans-serif';
  
  // Title
  const title = document.createElement('h3');
  title.textContent = 'FB Chat Monitor Control';
  title.style.margin = '0 0 15px 0';
  title.style.borderBottom = '1px solid #ddd';
  title.style.paddingBottom = '8px';
  title.style.color = '#4267B2';
  panel.appendChild(title);
  
  // Current configuration status
  const statusDiv = document.createElement('div');
  statusDiv.style.marginBottom = '15px';
  
  // API status
  const apiStatusText = document.createElement('p');
  apiStatusText.innerHTML = `<strong>API:</strong> ${CONFIG.AI.apiKey ? '✅ Configured' : '❌ Not configured'}`;
  apiStatusText.style.margin = '5px 0';
  statusDiv.appendChild(apiStatusText);
  
  // Current mode
  const modeText = document.createElement('p');
  modeText.innerHTML = `<strong>Mode:</strong> ${CONFIG.operationMode}`;
  modeText.style.margin = '5px 0';
  statusDiv.appendChild(modeText);
  
  // AI model
  if (CONFIG.AI.apiKey) {
    const modelText = document.createElement('p');
    modelText.innerHTML = `<strong>Model:</strong> ${CONFIG.AI.model}`;
    modelText.style.margin = '5px 0';
    statusDiv.appendChild(modelText);
  }
  
  panel.appendChild(statusDiv);
  
  // Configuration section
  const configSection = document.createElement('div');
  configSection.style.marginBottom = '15px';
  
  // Section title
  const configTitle = document.createElement('p');
  configTitle.textContent = 'Bot Configuration';
  configTitle.style.fontWeight = 'bold';
  configTitle.style.margin = '5px 0';
  configSection.appendChild(configTitle);
  
  // Radio buttons for modes
  const modesDiv = document.createElement('div');
  modesDiv.style.display = 'flex';
  modesDiv.style.flexDirection = 'column';
  modesDiv.style.gap = '5px';
  modesDiv.style.marginTop = '5px';
  modesDiv.style.marginBottom = '15px';
  
  // Create radio buttons for each mode
  const modes = [
    { id: 'mode-auto', value: 'auto', label: 'Auto Mode - Automatic message sending' },
    { id: 'mode-manual', value: 'manual', label: 'Manual Mode - Confirm before sending' },
    { id: 'mode-generate', value: 'generate', label: 'Generate Only - No automatic sending' }
  ];
  
  modes.forEach(mode => {
    const modeContainer = document.createElement('div');
    modeContainer.style.display = 'flex';
    modeContainer.style.alignItems = 'center';
    
    const radioInput = document.createElement('input');
    radioInput.type = 'radio';
    radioInput.id = mode.id;
    radioInput.name = 'operation-mode';
    radioInput.value = mode.value;
    radioInput.checked = CONFIG.operationMode === mode.value;
    radioInput.style.marginRight = '8px';
    
    const radioLabel = document.createElement('label');
    radioLabel.htmlFor = mode.id;
    radioLabel.textContent = mode.label;
    radioLabel.style.fontSize = '14px';
    
    modeContainer.appendChild(radioInput);
    modeContainer.appendChild(radioLabel);
    modesDiv.appendChild(modeContainer);
    
    // Event listener to update the mode
    radioInput.addEventListener('change', function() {
      if (this.checked) {
        CONFIG.operationMode = this.value;
        logger.log(`Mode changed to: ${this.value}`);
        localStorage.setItem('FB_CHAT_MONITOR_MODE', this.value);
        modeText.innerHTML = `<strong>Mode:</strong> ${this.value}`;
      }
    });
  });
  
  configSection.appendChild(modesDiv);
  panel.appendChild(configSection);
  
  // Action buttons
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.display = 'flex';
  buttonsDiv.style.flexDirection = 'column';
  buttonsDiv.style.gap = '10px';
  
  // Button to configure API Key
  const configApiButton = document.createElement('button');
  configApiButton.textContent = CONFIG.AI.apiKey ? 'Reconfigure API Key' : 'Configure API Key';
  configApiButton.style.padding = '8px 12px';
  configApiButton.style.backgroundColor = '#4267B2';
  configApiButton.style.color = 'white';
  configApiButton.style.border = 'none';
  configApiButton.style.borderRadius = '4px';
  configApiButton.style.cursor = 'pointer';
  configApiButton.onclick = function() {
    const apiKey = prompt('Enter your OpenAI API key:');
    if (apiKey) {
      CONFIG.AI.apiKey = apiKey;
      CONFIG.AI.enabled = true;
      localStorage.setItem('FB_CHAT_MONITOR_OPENAI_KEY', apiKey);
      apiStatusText.innerHTML = '<strong>API:</strong> ✅ Configured';
      logger.notify('API Key successfully configured', 'success');
    }
  };
  buttonsDiv.appendChild(configApiButton);
  
  // Button to scan messages
  const scanButton = document.createElement('button');
  scanButton.textContent = 'Scan Messages';
  scanButton.style.padding = '8px 12px';
  scanButton.style.backgroundColor = '#4CAF50';
  scanButton.style.color = 'white';
  scanButton.style.border = 'none';
  scanButton.style.borderRadius = '4px';
  scanButton.style.cursor = 'pointer';
  scanButton.onclick = async function() {
    scanButton.textContent = 'Scanning...';
    scanButton.disabled = true;
    
    try {
      await runChatMonitor();
    } finally {
      setTimeout(() => {
        scanButton.textContent = 'Scan Messages';
        scanButton.disabled = false;
      }, 2000);
    }
  };
  buttonsDiv.appendChild(scanButton);
  
  // Button to view conversation history
  const historyButton = document.createElement('button');
  historyButton.textContent = 'View History';
  historyButton.style.padding = '8px 12px';
  historyButton.style.backgroundColor = '#ff9800';
  historyButton.style.color = 'white';
  historyButton.style.border = 'none';
  historyButton.style.borderRadius = '4px';
  historyButton.style.cursor = 'pointer';
  historyButton.onclick = function() {
    showConversationHistory(chatManager.conversationLogs);
  };
  buttonsDiv.appendChild(historyButton);
  
  // Button “Regenerate Response”
  const regenBtn = document.createElement('button');
  regenBtn.textContent = 'Regenerate Response';
  regenBtn.style.padding = '8px 12px';
  regenBtn.style.backgroundColor = '#ff9800';
  regenBtn.style.color = 'white';
  regenBtn.style.border = 'none';
  regenBtn.style.borderRadius = '4px';
  regenBtn.style.cursor = 'pointer';
  regenBtn.style.marginTop = '10px';

  regenBtn.onclick = async () => {
    if (!chatManager.currentChatId) {
      alert('Open a chat first');
      return;
    }
    // Rebuild context from chatHistory
    const chatData = chatManager.chatHistory.get(chatManager.currentChatId);
    const context = {
      messages: chatData.messages,
      productLink: chatData.productLink,
      isSeller: chatData.isSeller
    };
    await chatManager.handleGenerateMode(context);
  };

  panel.appendChild(regenBtn);

  // button Pause/Resume Auto
  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause Auto';
  pauseBtn.style.padding = '8px'; pauseBtn.style.marginTop = '10px';
  pauseBtn.onclick = () => {
    CONFIG.operationMode==='auto'
      ? (CONFIG.operationMode='manual', pauseBtn.textContent='Resume Auto')
      : (CONFIG.operationMode='auto', pauseBtn.textContent='Pause Auto');
    localStorage.setItem('FB_CHAT_MONITOR_MODE', CONFIG.operationMode);
    logger.notify(`Auto mode ${CONFIG.operationMode==='auto'?'resumed':'paused'}`, 'info');
  };
  panel.appendChild(pauseBtn);

  panel.appendChild(buttonsDiv);
  document.body.appendChild(panel);
}

// Function to show conversation history
function showConversationHistory(logs) {
  // Create panel to show the history
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '50px';
  panel.style.left = '50%';
  panel.style.width = '80%';
  panel.style.maxWidth = '800px';
  panel.style.transform = 'translateX(-50%)';
  panel.style.backgroundColor = 'white';
  panel.style.padding = '20px';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 0 20px rgba(0,0,0,0.3)';
  panel.style.zIndex = '10001';
  panel.style.maxHeight = '80vh';
  panel.style.overflowY = 'auto';
  panel.style.fontFamily = 'Arial, sans-serif';
  
  // Title
  const title = document.createElement('h2');
  title.textContent = 'Conversation History';
  title.style.marginTop = '0';
  title.style.marginBottom = '20px';
  title.style.borderBottom = '1px solid #ddd';
  title.style.paddingBottom = '10px';
  title.style.color = '#4267B2';
  panel.appendChild(title);
  
  // If no logs
  if (!logs || logs.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'No conversation logs.';
    emptyMessage.style.textAlign = 'center';
    emptyMessage.style.color = '#666';
    emptyMessage.style.padding = '20px';
    panel.appendChild(emptyMessage);
  } else {
    // Table for logs
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    
    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Date', 'Mode', 'Message', 'Response', 'Status'];
    
    headers.forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      th.style.borderBottom = '2px solid #ddd';
      th.style.backgroundColor = '#f5f5f5';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    logs.forEach(log => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #ddd';
      
      // Date
      const dateCell = document.createElement('td');
      const date = new Date(log.timestamp);
      dateCell.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      dateCell.style.padding = '8px';
      dateCell.style.fontSize = '12px';
      row.appendChild(dateCell);
      
      // Mode
      const modeCell = document.createElement('td');
      const modeBadge = document.createElement('span');
      modeBadge.textContent = log.mode;
      modeBadge.style.padding = '3px 6px';
      modeBadge.style.borderRadius = '10px';
      modeBadge.style.fontSize = '11px';
      modeBadge.style.color = 'white';
      if (log.mode === 'auto') {
        modeBadge.style.backgroundColor = '#4CAF50';
      } else if (log.mode === 'manual') {
        modeBadge.style.backgroundColor = '#2196F3';
      } else {
        modeBadge.style.backgroundColor = '#ff9800';
      }
      modeCell.appendChild(modeBadge);
      modeCell.style.padding = '8px';
      row.appendChild(modeCell);
      
      // Last message
      const messageCell = document.createElement('td');
      messageCell.textContent = (log.context?.lastMessage || '').substring(0, 30) + (log.context?.lastMessage?.length > 30 ? '...' : '');
      messageCell.style.padding = '8px';
      messageCell.style.fontSize = '13px';
      row.appendChild(messageCell);
      
      // Response
      const responseCell = document.createElement('td');
      responseCell.textContent = log.response?.substring(0, 30) + (log.response?.length > 30 ? '...' : '');
      responseCell.style.padding = '8px';
      responseCell.style.fontSize = '13px';
      row.appendChild(responseCell);
      
      // Status
      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.textContent = log.sent ? 'Sent' : 'Not sent';
      statusBadge.style.padding = '3px 6px';
      statusBadge.style.borderRadius = '10px';
      statusBadge.style.fontSize = '11px';
      statusBadge.style.color = 'white';
      statusBadge.style.backgroundColor = log.sent ? '#4CAF50' : '#f44336';
      statusCell.appendChild(statusBadge);
      statusCell.style.padding = '8px';
      row.appendChild(statusCell);
      
      // Make the row expandable to see details
      row.style.cursor = 'pointer';
      row.onclick = function() {
        // Show details of this log
        showConversationDetails(log);
      };
      
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    panel.appendChild(table);
  }
  
  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.display = 'block';
  closeButton.style.margin = '20px auto 0';
  closeButton.style.padding = '8px 20px';
  closeButton.style.backgroundColor = '#f44336';
  closeButton.style.color = 'white';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  
  closeButton.onclick = function() {
    document.body.removeChild(panel);
  };
  
  panel.appendChild(closeButton);
  document.body.appendChild(panel);
}

// Function to show conversation details
function showConversationDetails(log) {
  // Create details panel
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '50%';
  panel.style.left = '50%';
  panel.style.transform = 'translate(-50%, -50%)';
  panel.style.width = '500px';
  panel.style.backgroundColor = 'white';
  panel.style.padding = '20px';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
  panel.style.zIndex = '10002';
  panel.style.maxHeight = '90vh';
  panel.style.overflowY = 'auto';
  
  // Title
  const title = document.createElement('h3');
  title.textContent = 'Conversation Detail';
  title.style.marginTop = '0';
  title.style.color = '#4267B2';
  title.style.borderBottom = '1px solid #ddd';
  title.style.paddingBottom = '10px';
  panel.appendChild(title);
  
  // Date and time
  const dateInfo = document.createElement('p');
  const date = new Date(log.timestamp);
  dateInfo.innerHTML = `<strong>Date:</strong> ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  panel.appendChild(dateInfo);
  
  // Mode
  const modeInfo = document.createElement('p');
  modeInfo.innerHTML = `<strong>Mode:</strong> ${log.mode}`;
  panel.appendChild(modeInfo);
  
  // Status
  const statusInfo = document.createElement('p');
  statusInfo.innerHTML = `<strong>Status:</strong> ${log.sent ? 'Sent' : 'Not sent'}`;
  panel.appendChild(statusInfo);
  
  // Context information
  if (log.context) {
    const contextTitle = document.createElement('h4');
    contextTitle.textContent = 'Context';
    contextTitle.style.marginBottom = '5px';
    panel.appendChild(contextTitle);
    
    const contextInfo = document.createElement('div');
    contextInfo.style.marginBottom = '15px';
    
    if (log.context.isSeller !== undefined) {
      const roleInfo = document.createElement('p');
      roleInfo.innerHTML = `<strong>Role:</strong> ${log.context.isSeller ? 'Seller' : 'Buyer'}`;
      roleInfo.style.margin = '5px 0';
      contextInfo.appendChild(roleInfo);
    }
    
    if (log.context.productLink) {
      const productInfo = document.createElement('p');
      productInfo.innerHTML = `<strong>Product:</strong> <a href="${log.context.productLink}" target="_blank">${log.context.productLink}</a>`;
      productInfo.style.margin = '5px 0';
      productInfo.style.wordBreak = 'break-all';
      contextInfo.appendChild(productInfo);
    }
    
    if (log.context.lastMessage) {
      const lastMessageTitle = document.createElement('p');
      lastMessageTitle.innerHTML = '<strong>Last received message:</strong>';
      lastMessageTitle.style.margin = '5px 0';
      contextInfo.appendChild(lastMessageTitle);
      
      const lastMessageText = document.createElement('div');
      lastMessageText.textContent = log.context.lastMessage;
      lastMessageText.style.padding = '8px';
      lastMessageText.style.backgroundColor = '#f5f5f5';
      lastMessageText.style.borderRadius = '5px';
      lastMessageText.style.marginTop = '5px';
      contextInfo.appendChild(lastMessageText);
    }
    
    panel.appendChild(contextInfo);
  }
  
  // Response
  if (log.response) {
    const responseTitle = document.createElement('h4');
    responseTitle.textContent = 'Generated Response';
    responseTitle.style.marginBottom = '5px';
    panel.appendChild(responseTitle);
    
    const responseText = document.createElement('div');
    responseText.textContent = log.response;
    responseText.style.padding = '10px';
    responseText.style.backgroundColor = '#e9f5ff';
    responseText.style.borderRadius = '5px';
    responseText.style.marginBottom = '15px';
    responseText.style.border = '1px solid #2196F3';
    panel.appendChild(responseText);
    
    // Button to copy response
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy response';
    copyButton.style.padding = '5px 10px';
    copyButton.style.backgroundColor = '#2196F3';
    copyButton.style.color = 'white';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '3px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.marginRight = '10px';
    
    copyButton.onclick = function() {
      navigator.clipboard.writeText(log.response);
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = 'Copy response';
      }, 2000);
    };
    
    panel.appendChild(copyButton);
  }
  
  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.padding = '5px 10px';
  closeButton.style.backgroundColor = '#f44336';
  closeButton.style.color = 'white';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '3px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.marginTop = '15px';
  
  closeButton.onclick = function() {
    document.body.removeChild(panel);
  };
  
  panel.appendChild(closeButton);
  document.body.appendChild(panel);
}

