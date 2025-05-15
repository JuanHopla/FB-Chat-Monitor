/**
 * FB-Chat-Monitor Diagnostic Tool
 * 
 * This script helps diagnose initialization issues with the FB-Chat-Monitor script
 * Run this in the console to check component initialization status
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
    const selectors = window.CONFIG?.selectors || {};
    
    // Check chat list selectors
    const chatListContainer = document.querySelector(selectors.chatList?.container);
    console.log(`- Chat list container: ${chatListContainer ? 'FOUND' : 'NOT FOUND'}`);
    
    // Check active chat selectors
    const activeChatContainer = document.querySelector(selectors.activeChat?.container);
    console.log(`- Active chat container: ${activeChatContainer ? 'FOUND' : 'NOT FOUND'}`);
    
    // Check message input
    const messageInput = document.querySelector(selectors.activeChat?.messageInput);
    console.log(`- Message input: ${messageInput ? 'FOUND' : 'NOT FOUND'}`);
  } catch (e) {
    console.error('Error checking selectors:', e);
  }
  
  // Check initialization functions
  console.log('Checking initialization functions:');
  console.log(`- initialize: ${typeof initialize === 'function' ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  console.log(`- runMarketplaceMonitor: ${typeof runMarketplaceMonitor === 'function' ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  console.log(`- FBChatMonitor.initialize: ${window.FBChatMonitor?.initialize ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  
  // Check monitoring state
  console.log('Checking monitoring state:');
  if (window.FBChatMonitor) {
    try {
      const stats = window.FBChatMonitor.getMonitoringStats ? window.FBChatMonitor.getMonitoringStats() : 'Function not available';
      console.log('- Monitoring stats:', stats);
    } catch (e) {
      console.error('Error getting monitoring stats:', e);
    }
  }
  
  return 'Diagnostics complete';
}

// Provide fix for initialization issues
function fixInitialization() {
  console.log('Attempting to fix initialization issues...');
  
  try {
    // Check if scripts loaded but didn't initialize properly
    if (typeof initialize === 'function' && !window.FB_CHAT_MONITOR_INITIALIZED) {
      console.log('Calling initialize() function manually...');
      initialize();
    } else if (window.FBChatMonitor && typeof window.FBChatMonitor.initialize === 'function') {
      console.log('Calling FBChatMonitor.initialize() manually...');
      window.FBChatMonitor.initialize();
    }
    
    // Check if we're on marketplace and should start monitoring
    if (window.location.href.includes('/marketplace') && 
        window.FBChatMonitor && 
        typeof window.FBChatMonitor.runMarketplaceMonitor === 'function') {
      console.log('Starting marketplace monitor manually...');
      window.FBChatMonitor.runMarketplaceMonitor();
    }
    
    return 'Fix attempt complete';
  } catch (e) {
    console.error('Error during fix attempt:', e);
    return 'Fix attempt failed';
  }
}

// Expose utilities globally for console use
window.fbChatMonitorDiagnostics = {
  diagnose: diagnoseScriptIssues,
  fix: fixInitialization
};

console.log('FB-Chat-Monitor diagnostic tools loaded. Use fbChatMonitorDiagnostics.diagnose() to run diagnostics.');
