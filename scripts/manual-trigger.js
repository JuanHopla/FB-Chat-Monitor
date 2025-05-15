/**
 * Manual trigger script for FB-Chat-Monitor
 * Run this in the browser console to force initialization
 */

(function() {
  console.log('FB-Chat-Monitor manual trigger running...');
  
  // First, diagnose the current state
  console.log('Current script state:');
  if (window.FBChatMonitor) {
    console.log('- FBChatMonitor object exists');
    console.log('- Initialized:', window.FB_CHAT_MONITOR_INITIALIZED ? 'YES' : 'NO');
  } else {
    console.log('- FBChatMonitor object doesn\'t exist');
  }
  
  // Try to locate initialization functions
  const initFunction = window.initialize || window.FBChatMonitor?.initialize || window.initFBChatMonitor;
  const monitorFunction = window.runMarketplaceMonitor || window.FBChatMonitor?.runMarketplaceMonitor;
  
  // Attempt to run initialization
  if (typeof initFunction === 'function') {
    console.log('Calling initialization function...');
    try {
      initFunction();
      console.log('Initialization function called successfully');
    } catch (e) {
      console.error('Error during initialization:', e);
    }
  } else {
    console.error('No initialization function found');
  }
  
  // Attempt to start monitoring
  if (window.location.href.includes('/marketplace') && typeof monitorFunction === 'function') {
    console.log('Calling marketplace monitor function...');
    try {
      setTimeout(() => {
        monitorFunction();
        console.log('Marketplace monitor started');
      }, 1000);
    } catch (e) {
      console.error('Error starting marketplace monitor:', e);
    }
  }
  
  return 'Manual trigger complete';
})();
