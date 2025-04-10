// Import dependencies
import { CONFIG } from './config.js';
import { SELECTOR_UTILS, logInfo } from './utils.js';

// ChatManager class
export class ChatManager {
    constructor() {
        this.activeChats = new Map(); // Map<chatId, chatData>
        this.pendingChats = []; // Queue of chats with unread messages
        this.currentChatId = null;
    }
    
    /**
     * Scans Marketplace Inbox for unread messages
     * @returns {Promise<number>} Number of unread chats found
     */
    async scanForUnreadChats() {
        logInfo('Scanning for unread chats...');
        
        try {
            // Select the buying tab if not already selected
            const buyingTab = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.navigation.buyingTab);
            if (buyingTab) {
                // Only click if it's not already selected - Fixing incorrect condition
                if (buyingTab.getAttribute('aria-selected') !== 'true') {
                    buyingTab.click();
                    logInfo('Clicked "Buying" tab');
                    // Wait a moment for the UI to update
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            // Get the chat list container
            const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.chatList.container);
            if (!chatContainer) {
                logInfo('Chat container not found');
                return 0;
            }
            
            // Find all chat items
            const chatItems = SELECTOR_UTILS.findAllElements(CONFIG.MARKETPLACE.chatList.chatItem, chatContainer);
            logInfo(`Found ${chatItems.length} chat items`);
            
            // Reset the pending chats queue
            this.pendingChats = [];
            
            // Check each chat for unread messages
            for (const chat of chatItems) {
                const isUnread = SELECTOR_UTILS.isUnreadChat(chat);
                const userName = this.extractUserName(chat);
                
                if (isUnread) {
                    // Get a unique identifier for this chat
                    const chatId = this.getChatId(chat);
                    
                    // Add to pending chats queue
                    this.pendingChats.push({
                        chatId,
                        userName,
                        element: chat
                    });
                    
                    logInfo(`Found unread chat: ${userName} (${chatId})`);
                }
            }
            
            return this.pendingChats.length;
        } catch (error) {
            logInfo(`Error scanning for unread chats: ${error}`);
            return 0;
        }
    }
    
    /**
     * Opens the next chat with unread messages
     * @returns {Promise<boolean>} True if a chat was opened, false otherwise
     */
    async openNextPendingChat() {
        if (this.pendingChats.length === 0) {
            logInfo('No pending chats to open');
            return false;
        }
        
        const nextChat = this.pendingChats.shift();
        logInfo(`Opening chat with: ${nextChat.userName}`);
        
        try {
            // Click on the chat to open it
            nextChat.element.click();
            this.currentChatId = nextChat.chatId;
            
            // Wait a moment for the chat to load
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Initialize chat data if not exists
            if (!this.activeChats.has(nextChat.chatId)) {
                this.activeChats.set(nextChat.chatId, {
                    chatId: nextChat.chatId,
                    userName: nextChat.userName,
                    lastActivity: new Date(),
                    unreadMessages: true,
                    conversationHistory: []
                });
            }
            
            // Process the messages in this chat
            await this.processCurrentChatMessages();
            
            return true;
        } catch (error) {
            logInfo(`Error opening chat: ${error}`);
            return false;
        }
    }
    
    /**
     * Extracts and processes messages from the current active chat
     */
    async processCurrentChatMessages() {
        if (!this.currentChatId) {
            logInfo('No active chat to process');
            return;
        }
        
        const chatData = this.activeChats.get(this.currentChatId);
        if (!chatData) {
            logInfo(`No data found for chat ID: ${this.currentChatId}`);
            return;
        }
        
        logInfo(`Processing messages for chat with: ${chatData.userName}`);
        
        // Find the active chat container
        const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
        if (!chatContainer) {
            logInfo('Active chat container not found');
            return;
        }
        
        // Find the conversation header to identify which chat we're in
        const conversationHeader = this.findConversationHeader(chatContainer);
        if (conversationHeader) {
            const headerText = conversationHeader.innerText;
            logInfo(`Current conversation: ${headerText}`);
            
            // Use this to confirm we're in the right conversation
            if (!headerText.includes(chatData.userName)) {
                logInfo(`Warning: Expected chat with ${chatData.userName} but found ${headerText}`);
            }
        }
        
        // Find the messages wrapper
        const messagesWrapper = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messagesWrapper, chatContainer);
        if (!messagesWrapper) {
            logInfo('Messages wrapper not found');
            return;
        }
        
        // Find all messages
        const messages = SELECTOR_UTILS.findAllElements(CONFIG.MARKETPLACE.activeChat.messageRow, messagesWrapper);
        logInfo(`Found ${messages.length} messages in current chat`);
        
        // Process each message
        for (const message of messages) {
            // Skip if this is a section divider between conversations
            if (this.isConversationDivider(message)) {
                logInfo('Found conversation divider - skipping');
                continue;
            }
            
            // Get message content
            const contentElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageContent, message);
            if (!contentElement || !contentElement.innerText.trim()) continue;
            
            const content = contentElement.innerText.trim();
            
            // Determine sender
            const isSentByYou = this.isMessageSentByYou(message);
            const sender = isSentByYou ? 'You' : chatData.userName;
            
            // Get timestamp if available
            let timestamp = new Date().toISOString();
            const timestampElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageTimestamp, message);
            if (timestampElement) {
                timestamp = timestampElement.getAttribute('title') || timestamp;
            }
            
            // Create message object
            const messageObj = {
                content,
                sender,
                isSentByYou,
                timestamp
            };
            
            // Check if we already have this message to avoid duplicates
            if (!this.isDuplicateMessage(chatData.conversationHistory, messageObj)) {
                chatData.conversationHistory.push(messageObj);
                logInfo(`Added message to history: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`);
            }
        }
        
        // Update chat data
        chatData.lastActivity = new Date();
        chatData.unreadMessages = false;
        
        // Save updated chat data
        this.activeChats.set(this.currentChatId, chatData);
    }
    
    /**
     * Adds a message to the history of a specific chat
     * @param {String} chatId The ID of the chat
     * @param {Object} messageObj The message object to add
     * @returns {Boolean} True if the message was added, false if it was a duplicate
     */
    addMessageToHistory(chatId, messageObj) {
        if (!this.activeChats.has(chatId)) {
            logInfo(`Cannot add message: chat ID ${chatId} not found`);
            return false;
        }
        
        const chatData = this.activeChats.get(chatId);
        
        // Check for duplicates
        if (this.isDuplicateMessage(chatData.conversationHistory, messageObj)) {
            return false;
        }
        
        // Add the message
        chatData.conversationHistory.push(messageObj);
        logInfo(`Added message to chat ${chatId}: "${messageObj.content.substring(0, 30)}${messageObj.content.length > 30 ? '...' : ''}"`);
        
        return true;
    }
    
    /**
     * Send a message to the current chat
     * @param {String} message Text message to send
     * @returns {Promise<boolean>} True if message was sent successfully
     */
    async sendMessage(message) {
        if (!this.currentChatId) {
            logInfo('No active chat to send message to');
            return false;
        }
        
        try {
            // Find input field
            const inputField = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageInput);
            if (!inputField) {
                logInfo('Message input field not found');
                return false;
            }
            
            // Focus and set content
            inputField.focus();
            
            // Use execCommand for compatibility
            document.execCommand('insertText', false, message);
            
            // Alternative: set innerText and dispatch input event
            if (!inputField.innerText || inputField.innerText.trim() === '') {
                inputField.innerText = message;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Wait a moment for the UI to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Find and click send button
            const sendButton = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.sendButton);
            if (!sendButton) {
                logInfo('Send button not found');
                return false;
            }
            
            sendButton.click();
            logInfo(`Message sent: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
            
            // Wait for message to be sent
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Process messages again to include the one we just sent
            await this.processCurrentChatMessages();
            
            return true;
        } catch (error) {
            logInfo(`Error sending message: ${error}`);
            return false;
        }
    }
    
    /**
     * Checks if a message is already in the conversation history
     */
    isDuplicateMessage(history, newMessage) {
        return history.some(msg => 
            msg.content === newMessage.content && 
            msg.sender === newMessage.sender
        );
    }
    
    /**
     * Finds the conversation header to identify which chat we're in
     */
    findConversationHeader(container) {
        // This is a placeholder - you'll need to identify how Facebook structures the conversation header
        // It might be something like a heading element or div with the user's name
        const possibleHeaders = container.querySelectorAll('div[role="heading"], span[class*="x1lliihq"]:first-child');
        
        for (const header of possibleHeaders) {
            if (header.innerText && !header.innerText.includes('Message') && !header.innerText.includes('Chat')) {
                return header;
            }
        }
        
        return null;
    }
    
    /**
     * Checks if an element is a divider between different conversations
     */
    isConversationDivider(element) {
        // Check for elements that typically separate different conversations
        const text = element.innerText;
        return text.includes('You started this chat') || 
               text.includes('View seller profile') ||
               element.querySelector('img[alt]'); // Product images often divide conversations
    }
    
    /**
     * Determines if a message was sent by the current user
     */
    isMessageSentByYou(messageElement) {
        const alignCheck = messageElement.querySelector('[style*="flex-end"]');
        const possibleYou = messageElement.closest('div[class*="x1yc453h"]');
        return !!(alignCheck || possibleYou);
    }
    
    /**
     * Extracts user name from a chat item
     */
    extractUserName(chatElement) {
        const nameElement = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.chatList.chatUserName, chatElement);
        return nameElement?.innerText?.trim() || 'Unknown User';
    }
    
    /**
     * Generates a unique ID for a chat element
     */
    getChatId(chatElement) {
        // Try to get a stable ID from the DOM
        const idAttr = chatElement.id || chatElement.getAttribute('data-testid');
        if (idAttr) return `chat_${idAttr}`;
        
        // Fall back to using the user name (not perfect but workable)
        const userName = this.extractUserName(chatElement);
        return `chat_${userName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    }
    
    /**
     * Gets conversation history for a specific chat
     */
    getConversationHistory(chatId) {
        return this.activeChats.get(chatId)?.conversationHistory || [];
    }
    
    /**
     * Gets information about all active chats
     */
    getAllChats() {
        const chats = [];
        this.activeChats.forEach(chat => {
            chats.push({
                id: chat.chatId,
                userName: chat.userName,
                lastActivity: chat.lastActivity,
                unreadMessages: chat.unreadMessages,
                messageCount: chat.conversationHistory.length
            });
        });
        return chats;
    }
}

// Create and export singleton instance
export const chatManager = new ChatManager();
