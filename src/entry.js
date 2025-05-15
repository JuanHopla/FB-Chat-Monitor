// Final entry point - this is executed after all modules are loaded
window.addEventListener('load', () => {
  // Ensure that critical components are available
  if (!window.FBChatMonitor) {
    window.FBChatMonitor = {};
    console.error('FBChatMonitor is not available on load. An empty object has been created to prevent errors.');
  }
  
  // If the getMonitoringStats function does not exist, create a temporary version
  if (!window.FBChatMonitor.getMonitoringStats) {
    window.FBChatMonitor.getMonitoringStats = function() {
      return {
        chatsProcessed: 0,
        responsesSent: 0,
        errors: 0,
        uptime: 0,
        isMonitoring: false
      };
    };
    console.warn('A temporary version of getMonitoringStats has been created');
  }
  
  // Initialize the main system if necessary
  if (!window.FBChatMonitor.initialized && typeof window.FBChatMonitor.initialize === 'function') {
    window.FBChatMonitor.initialized = true;
    window.FBChatMonitor.initialize();
  }
});