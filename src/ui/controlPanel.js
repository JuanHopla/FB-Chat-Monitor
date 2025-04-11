/**
 * Control panel UI for FB-Chat-Monitor
 * @module ui/controlPanel
 */

/**
 * Show or hide the control panel
 */
export function showControlPanel() {
  // Remove existing panel if one already exists
  const existingPanel = document.getElementById('fb-chat-monitor-panel');
  if (existingPanel) {
    existingPanel.remove();
    return;
  }

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

  // Current status
  const aiStatus = window.FB_CHAT_MONITOR.getAIStatus();

  const statusDiv = document.createElement('div');
  statusDiv.style.marginBottom = '15px';

  // API status
  const apiStatusText = document.createElement('p');
  apiStatusText.innerHTML = `<strong>API Status:</strong> ${aiStatus.hasApiKey ? '✅ Configured' : '❌ Not configured'}`;
  apiStatusText.style.margin = '5px 0';
  statusDiv.appendChild(apiStatusText);

  // Auto-response status
  const autoResponseText = document.createElement('p');
  autoResponseText.innerHTML = `<strong>Auto Responses:</strong> ${aiStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`;
  autoResponseText.style.margin = '5px 0';
  statusDiv.appendChild(autoResponseText);

  // Model used
  if (aiStatus.hasApiKey) {
    const modelText = document.createElement('p');
    modelText.innerHTML = `<strong>Model:</strong> ${aiStatus.model}`;
    modelText.style.margin = '5px 0';
    statusDiv.appendChild(modelText);
  }

  panel.appendChild(statusDiv);

  // Action buttons
  const buttonsDiv = document.createElement('div');
  buttonsDiv.style.display = 'flex';
  buttonsDiv.style.flexDirection = 'column';
  buttonsDiv.style.gap = '10px';

  // Button to configure API
  const configButton = document.createElement('button');
  configButton.textContent = aiStatus.hasApiKey ? 'Reconfigure API Key' : 'Configure API Key';
  configButton.style.padding = '8px 12px';
  configButton.style.backgroundColor = '#4267B2';
  configButton.style.color = 'white';
  configButton.style.border = 'none';
  configButton.style.borderRadius = '4px';
  configButton.style.cursor = 'pointer';
  configButton.onclick = async () => {
    const apiKey = prompt('Enter your OpenAI API Key:');
    if (apiKey) {
      window.FB_CHAT_MONITOR.configureAI(apiKey);
      // Update panel
      panel.remove();
      setTimeout(showControlPanel, 500);
    }
  };
  buttonsDiv.appendChild(configButton);

  // Button to enable/disable responses
  if (aiStatus.hasApiKey) {
    const toggleButton = document.createElement('button');
    toggleButton.textContent = aiStatus.enabled ? 'Disable Responses' : 'Enable Responses';
    toggleButton.style.padding = '8px 12px';
    toggleButton.style.backgroundColor = aiStatus.enabled ? '#f44336' : '#4CAF50';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '4px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.onclick = () => {
      if (aiStatus.enabled) {
        window.FB_CHAT_MONITOR.disableAI();
      } else {
        const config = window.FB_CHAT_MONITOR.getAIStatus();
        window.FB_CHAT_MONITOR.configureAI(config.apiKey, config.model);
      }
      // Update panel
      panel.remove();
      setTimeout(showControlPanel, 500);
    };
    buttonsDiv.appendChild(toggleButton);
  }

  // Button to manually scan messages
  const scanButton = document.createElement('button');
  scanButton.textContent = 'Scan Messages';
  scanButton.style.padding = '8px 12px';
  scanButton.style.backgroundColor = '#4CAF50';
  scanButton.style.color = 'white';
  scanButton.style.border = 'none';
  scanButton.style.borderRadius = '4px';
  scanButton.style.cursor = 'pointer';
  scanButton.onclick = () => {
    window.FB_CHAT_MONITOR.runMonitor();
    scanButton.textContent = 'Scanning...';
    scanButton.disabled = true;
    setTimeout(() => {
      scanButton.textContent = 'Scan Messages';
      scanButton.disabled = false;
    }, 5000);
  };
  buttonsDiv.appendChild(scanButton);

  panel.appendChild(buttonsDiv);
  document.body.appendChild(panel);
}
