import { CONFIG } from './config.js';
import { logInfo } from './utils.js';
import { ChatManager } from './chatManager.js';

/**
 * Process a container with messages to build a conversation thread
 * @param {Element} chatContainer The DOM element containing all messages
 * @param {String} chatId Unique identifier for this chat
 */
export function buildConversationThread(chatContainer, chatId) {
  logInfo(`Building conversation thread for chat: ${chatId}`);
  
  // Extract product information if available
  const productInfo = extractProductInfo(chatContainer);
  if (productInfo) {
    updateChatProductInfo(chatId, productInfo);
  }
  
  // Extract all messages in the container
  const messages = extractMessages(chatContainer);
  logInfo(`Found ${messages.length} messages in chat`);
  
  // Sort messages by timestamp (oldest first)
  messages.sort((a, b) => {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  
  // Update conversation history
  messages.forEach(message => {
    ChatManager.addMessageToHistory(chatId, message);
  });
  
  return messages;
}

/**
 * Extract product information from the chat header
 */
function extractProductInfo(container) {
  const productElement = container.querySelector(CONFIG.MARKETPLACE.productInfo);
  if (!productElement) return null;
  
  try {
    const title = productElement.querySelector(CONFIG.MARKETPLACE.productTitle)?.innerText.trim();
    const price = productElement.querySelector(CONFIG.MARKETPLACE.productPrice)?.innerText.trim();
    const imageUrl = productElement.querySelector(CONFIG.MARKETPLACE.productImage)?.src;
    
    return { title, price, imageUrl };
  } catch (error) {
    logInfo(`Error extracting product info: ${error}`);
    return null;
  }
}

/**
 * Update the product info for a specific chat
 */
function updateChatProductInfo(chatId, productInfo) {
  if (!ChatManager.activeChats.has(chatId)) return;
  
  const chatData = ChatManager.activeChats.get(chatId);
  chatData.productInfo = productInfo;
  logInfo(`Updated product info for chat ${chatId}: ${productInfo.title}`);
}

/**
 * Extract all messages from a chat container
 */
function extractMessages(container) {
  const messageElements = container.querySelectorAll(CONFIG.MARKETPLACE.messageRow);
  const messages = [];
  
  messageElements.forEach(element => {
    const content = element.querySelector(CONFIG.MARKETPLACE.messageContent)?.innerText.trim();
    if (!content) return;
    
    const isSentByYou = isMessageSentByYou(element);
    const sender = isSentByYou ? 'You' : 'Contact';
    
    // Try to extract timestamp, fallback to current time
    let timestamp;
    try {
      const timestampEl = element.querySelector(CONFIG.MARKETPLACE.messageTimestamp);
      timestamp = timestampEl?.getAttribute('title') || new Date().toISOString();
    } catch (e) {
      timestamp = new Date().toISOString();
    }
    
    messages.push({
      sender,
      content,
      timestamp,
      isSentByYou
    });
  });
  
  return messages;
}

/**
 * Determine if a message was sent by the current user
 */
function isMessageSentByYou(messageElement) {
  const alignCheck = messageElement.querySelector('[style*="flex-end"]');
  const possibleYou = messageElement.closest('div[class*="x1yc453h"]');
  return !!(alignCheck || possibleYou);
}
