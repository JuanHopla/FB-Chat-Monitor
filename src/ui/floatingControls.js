/**
 * Floating button controls for FB-Chat-Monitor
 * @module ui/floatingControls
 */
import { showControlPanel } from './controlPanel.js';

/**
 * Creates and adds a floating button to the page
 * @returns {HTMLElement} The created floating button
 */
export function addFloatingButton() {
  const floatingButton = document.createElement('div');
  floatingButton.style.position = 'fixed';
  floatingButton.style.bottom = '20px';
  floatingButton.style.left = '20px';
  floatingButton.style.padding = '10px 15px';
  floatingButton.style.backgroundColor = '#4267B2'; // Facebook color
  floatingButton.style.color = 'white';
  floatingButton.style.borderRadius = '5px';
  floatingButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  floatingButton.style.cursor = 'pointer';
  floatingButton.style.zIndex = '9999';
  floatingButton.style.fontSize = '14px';
  floatingButton.style.fontWeight = 'bold';
  floatingButton.style.display = 'flex';
  floatingButton.style.alignItems = 'center';
  floatingButton.style.transition = 'all 0.3s ease';

  // Small status indicator (green dot)
  const statusIndicator = document.createElement('div');
  statusIndicator.style.width = '8px';
  statusIndicator.style.height = '8px';
  statusIndicator.style.backgroundColor = '#4CAF50';
  statusIndicator.style.borderRadius = '50%';
  statusIndicator.style.marginRight = '8px';
  floatingButton.appendChild(statusIndicator);

  const buttonText = document.createElement('span');
  buttonText.textContent = 'FB Chat Monitor';
  floatingButton.appendChild(buttonText);

  // Hover effect
  floatingButton.onmouseover = function() {
    this.style.backgroundColor = '#365899';
  };
  floatingButton.onmouseout = function() {
    this.style.backgroundColor = '#4267B2';
  };

  // Show control panel on click
  floatingButton.onclick = function() {
    if (window.FB_CHAT_MONITOR) {
      showControlPanel();
    } else {
      alert('FB Chat Monitor is not available. Try reloading the page.');
    }
  };

  document.body.appendChild(floatingButton);
  return floatingButton;
}
