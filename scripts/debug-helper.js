/**
 * Debug script for FB-Chat-Monitor
 */

function diagnoseScriptIssues() {
  console.log('=== FB-Chat-Monitor Diagnostics ===');
  
  // Verify initialization
  try {
    console.log(`Script initialized: ${window.FBChatMonitor ? 'YES' : 'NO'}`);
    if (window.FBChatMonitor) {
      console.log(`CONFIG available: ${window.FBChatMonitor.CONFIG ? 'YES' : 'NO'}`);
      console.log(`chatManager available: ${window.FBChatMonitor.chatManager ? 'YES' : 'NO'}`);
    }
  } catch (e) {
    console.error('Error checking initialization:', e);
  }
  
  // Verify URL
  console.log(`Current URL: ${window.location.href}`);
  console.log(`Is marketplace path: ${window.location.href.includes('/marketplace') ? 'YES' : 'NO'}`);
  console.log(`Is messenger path: ${window.location.href.includes('messenger.com') ? 'YES' : 'NO'}`);
  
  // Verify selectors
  try {
    console.log('Checking critical selectors:');
    const selectors = [
      'div[role="main"]',
      'div[role="tab"]',
      'div[role="button"][tabindex="0"]',
      'div[contenteditable="true"][role="textbox"]'
    ];
    
    selectors.forEach(selector => {
      const found = document.querySelector(selector);
      console.log(`${selector}: ${found ? 'FOUND' : 'NOT FOUND'}`);
    });
  } catch (e) {
    console.error('Error checking selectors:', e);
  }
  
  // Verify application state
  if (window.FBChatMonitor && window.APP_STATE) {
    console.log(`APP_STATE.isRunning: ${window.APP_STATE.isRunning}`);
    console.log(`APP_STATE.initialized: ${window.APP_STATE.initialized}`);
    console.log(`APP_STATE.scanInterval: ${window.APP_STATE.scanInterval ? 'Active' : 'Inactive'}`);
  }
  
  console.log('=== End of Diagnostics ===');
}

// To run manually in the browser console:
// diagnoseScriptIssues();

// Export in case it's needed in the main script
if (typeof module !== 'undefined') {
  module.exports = { diagnoseScriptIssues };
}
