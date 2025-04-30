// ----- MAIN PROCESS -----

// Global instance of the chat manager
const chatManager = new ChatManager();

// Main function to run the monitor
async function runChatMonitor() {
  // If we are on messenger.com but not in the marketplace section, redirect
  if (redirectToMarketplace()) {
    logger.log('Redirecting to Marketplace, please wait...');
    return; // Stop execution because we are redirecting
  }
  
  logger.log('Starting chat monitoring');
  try {
    // Scan for unread chats
    const unreadChatsCount = await chatManager.scanForUnreadChats();
    if (unreadChatsCount > 0) {
      logger.log(`Found ${unreadChatsCount} unread chats`);
      // Process the first unread chat
      const opened = await chatManager.openNextPendingChat();
      if (opened) {
        logger.log('Chat opened and processed successfully');
      } else {
        logger.error('Could not open the chat');
        logger.notify('Error trying to open the chat', 'error');
      }
    } else {
      logger.log('No unread chats found');
    }
  } catch (error) {
    logger.error(`Error in monitoring: ${error.message}`);
    logger.notify(`Error: ${error.message}`, 'error');
  }
  
  // Schedule next execution
  setTimeout(runChatMonitor, CONFIG.scanInterval);
}