// Import all required modules
import { CONFIG } from './config.js';
import { logInfo, SELECTOR_UTILS } from './utils.js';
import { chatManager } from './chatManager.js';

// Main function to monitor and respond to marketplace messages
async function runMarketplaceMonitor() {
  logInfo('Starting Marketplace Monitor');
  
  try {
    // Scan for unread chats
    const unreadCount = await chatManager.scanForUnreadChats();
    logInfo(`Found ${unreadCount} unread chats`);
    
    if (unreadCount > 0) {
      // Process the first unread chat
      await chatManager.openNextPendingChat();
      
      // Get the conversation history for this chat
      const currentChatId = chatManager.currentChatId;
      const history = chatManager.getConversationHistory(currentChatId);
      
      logInfo(`Processed chat with ${history.length} messages`);
      
      // Here you would integrate with an AI assistant to get a response
      const lastMessage = history[history.length - 1];
      if (lastMessage && !lastMessage.isSentByYou) {
        const responseMessage = generateAutoResponse(lastMessage.content);
        if (responseMessage) {
          await chatManager.sendMessage(responseMessage);
        }
      }
      
      // Setup a watcher to detect new messages in this chat
      setupActiveConversationWatcher();
    }
    
    // Schedule the next scan
    setTimeout(runMarketplaceMonitor, 30000); // Check every 30 seconds
  } catch (error) {
    logInfo(`Error in marketplace monitor: ${error}`);
    // Retry after delay
    setTimeout(runMarketplaceMonitor, 60000); 
  }
}

// Set up observer to watch for new messages in the active conversation
function setupActiveConversationWatcher() {
  const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
  if (!chatContainer) {
    logInfo('Cannot set up watcher - chat container not found');
    return;
  }
  
  logInfo('Setting up active conversation watcher');
  
  const observer = new MutationObserver(async (mutations) => {
    // When new messages arrive, process them
    await chatManager.processCurrentChatMessages();
    
    // Log the updated conversation
    const history = chatManager.getConversationHistory(chatManager.currentChatId);
    logInfo(`Updated conversation has ${history.length} messages`);
  });
  
  observer.observe(chatContainer, { childList: true, subtree: true });
  logInfo('Active conversation watcher initialized');
  
  return observer;
}

// Simple response generator - replace with your AI integration
function generateAutoResponse(incomingMessage) {
  const lowerMessage = incomingMessage.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return 'Hello! Thanks for your message. How can I help you today?';
  }
  
  if (lowerMessage.includes('price')) {
    return 'The listed price is final. It includes shipping to anywhere in the country.';
  }
  
  if (lowerMessage.includes('available')) {
    return 'Yes, the product is still available. Are you interested?';
  }
  
  // Default response
  return 'Thank you for your message. I will respond as soon as possible.';
}

// For debugging
window.FB_CHAT_MONITOR = {
  chatManager,
  config: CONFIG,
  utils: SELECTOR_UTILS,
  runMonitor: runMarketplaceMonitor
};

// Initialize based on current URL
if (window.location.href.includes('facebook.com/marketplace/inbox')) {
  // Small delay to ensure the page is loaded
  setTimeout(runMarketplaceMonitor, 2000);
} else if (window.location.href.includes('messenger.com')) {
  // We'll focus on Marketplace for now
  logInfo('Messenger support coming soon!');
}
