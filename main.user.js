// ==UserScript==
// @name         FB-Chat-Monitor
// @namespace    https://github.com/JuanHopla/FB-Chat-Monitor
// @version      0.1
// @description  Extracts chat data from Messenger and Facebook Marketplace in real-time using MutationObserver.
// @author       JuanHopla
// @match        https://www.messenger.com/*
// @match        https://www.facebook.com/marketplace/inbox*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/JuanHopla/FB-Chat-Monitor/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/JuanHopla/FB-Chat-Monitor/main/main.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('[FB-Chat-Monitor] Script loaded 🚀');
    
    // Configuration object with all necessary constants
    const CONFIG = {
        // General settings
        scrollAttempts: 20,
        scrollInterval: 300,
        waitElementTimeout: 10000,
        waitElementCheckInterval: 100,
        
        // Facebook Marketplace selectors
        MARKETPLACE: {
            // Navigation
            navigation: {
                // Multiple options for each selector for resilience
                inboxLink: [
                    'a[href*="/marketplace/inbox/"]',
                    'div[role="navigation"] a[href*="marketplace"][href*="inbox"]'
                ],
                buyingTab: [
                    'div[role="tab"]:nth-child(3)',
                    'div[role="tab"][tabindex="0"]:not([aria-selected="true"])'
                ],
                sellingTab: [
                    'div[role="tab"]:nth-child(2)',
                    'div[role="tab"][aria-selected="true"]'
                ]
            },
            
            // Chat list 
            chatList: {
                container: [
                    'div[role="main"]',
                    'div[class*="x78zum5"][class*="xdt5ytf"]',
                    'div.x1yztbdb.xw7yly9.xh8yej3 > div > div > div > div > div'
                ],
                chatItem: [
                    'div[role="button"][tabindex="0"]',
                    'div[role="row"]',
                    'div[class*="x1n2onr6"]'
                ],
                unreadIndicator: [
                    'div[class*="xwnonoy"]',
                    'span[dir="auto"] span > div[class*="x1s688f"]',
                    'div[aria-label*="unread"]'
                ],
                chatUserName: [
                    'span[dir="auto"][class*="x1lliihq"]',
                    'span[dir="auto"] span > div'
                ],
                lastMessagePreview: [
                    'span[class*="x1s688f"]',
                    'span[dir="auto"]:not([class*="x1lliihq"])'
                ]
            },
            
            // Active chat window
            activeChat: {
                container: [
                    'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm',
                    'div[role="main"] > div > div > div:last-child'
                ],
                messagesWrapper: [
                    'div.x1ey2m1c.x78zum5.x164qtfw.xixxii4.x1vjfegm',
                    'div[role="main"] > div > div > div:last-child > div'
                ],
                messageRow: [
                    'div[role="row"]',
                    'div[class*="x1n2onr6"]'
                ],
                messageContent: [
                    'div[dir="auto"]',
                    'span[class*="x1lliihq"]'
                ],
                messageTimestamp: [
                    'span[class*="x4k7w5x"] span[class*="x1lliihq"]',
                    'span[class*="x1lliihq"]:last-child'
                ],
                
                // Input area
                messageInput: [
                    'div[contenteditable="true"][role="textbox"]',
                    'div[aria-label*="Message"]'
                ],
                sendButton: [
                    'div[aria-label="Send"]',
                    'div[role="button"]:has(svg)'
                ],
                productInfo: [
                    'div[class*="product-info"]',
                    'div[class*="x1ey2m1c"]'
                ],
                productTitle: [
                    'div[class*="product-title"]',
                    'span[class*="x1lliihq"]'
                ],
                productPrice: [
                    'div[class*="product-price"]',
                    'span[class*="x1lliihq"]'
                ],
                productImage: [
                    'img[class*="product-image"]',
                    'img[class*="x1lliihq"]'
                ]
            }
        },
        
        // Messenger selectors - For compatibility
        MESSENGER: {
            messagesContainer: '.message-container',
            messageItem: '.message-item',
            author: '.author',
            content: '.content',
            date: '.timestamp'
        }
    };

    // Utility functions for selector resilience
    const SELECTOR_UTILS = {
        // Try multiple selectors in sequence until one works
        findElement(selectors, parent = document) {
            for (const selector of selectors) {
                try {
                    const element = parent.querySelector(selector);
                    if (element) return element;
                } catch (e) {
                    console.warn(`Selector failed: ${selector}`, e);
                }
            }
            return null;
        },
        
        // Try multiple selectors for finding all matching elements
        findAllElements(selectors, parent = document) {
            for (const selector of selectors) {
                try {
                    const elements = parent.querySelectorAll(selector);
                    if (elements.length > 0) return Array.from(elements);
                } catch (e) {
                    console.warn(`Selector failed: ${selector}`, e);
                }
            }
            return [];
        },
        
        // Find element by text content
        findElementByText(text, elementType = '*', parent = document) {
            const elements = parent.querySelectorAll(elementType);
            for (const el of elements) {
                if (el.textContent.includes(text)) return el;
            }
            return null;
        },
        
        // Check if an element is unread based on multiple possible indicators
        isUnreadChat(chatElement) {
            // Unread indicator method 1: specific class
            const hasUnreadIndicator = !!chatElement.querySelector('div[class*="xwnonoy"]');
            
            // Unread indicator method 2: text style
            const nameSpan = chatElement.querySelector('span[dir="auto"] span > div');
            if (nameSpan) {
                const nameClasses = nameSpan.parentElement?.className || '';
                const hasUnreadTextStyle = nameClasses.includes('x1s688f');
                const hasReadTextStyle = nameClasses.includes('xk50ysn');
                if (hasUnreadTextStyle && !hasReadTextStyle) return true;
            }
            
            return hasUnreadIndicator;
        }
    };
    
    // Utility functions
    function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
        return new Promise((resolve, reject) => {
            const interval = CONFIG.waitElementCheckInterval;
            let elapsed = 0;
            const check = () => {
                let el;
                if (Array.isArray(selector)) {
                    el = SELECTOR_UTILS.findElement(selector);
                } else {
                    el = document.querySelector(selector);
                }
                if (el) return resolve(el);
                elapsed += interval;
                if (elapsed >= timeout) return reject(`Element not found: ${selector}`);
                setTimeout(check, interval);
            };
            check();
        });
    }
    
    function autoScroll(container, callback, maxAttempts = CONFIG.scrollAttempts) {
        let lastScrollHeight = 0;
        let attempts = 0;
        
        function scrollStep() {
            if (attempts >= maxAttempts) {
                console.log('[FB-Chat-Monitor] End of scroll');
                return callback();
            }
            
            const currentHeight = container.scrollHeight;
            if (currentHeight !== lastScrollHeight) {
                lastScrollHeight = currentHeight;
                container.scrollTop = 0; // Scroll upward
                attempts++;
                setTimeout(scrollStep, CONFIG.scrollInterval);
            } else {
                attempts++;
                setTimeout(scrollStep, CONFIG.scrollInterval);
            }
        }
        
        scrollStep();
    }
    
    function logInfo(message) {
        console.log(`[FB-Chat-Monitor] ${message}`);
    }

    // ConversationBuilder functionality integrated directly
    function buildConversationThread(chatContainer, chatId) {
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
            chatManager.addMessageToHistory(chatId, message);
        });
        
        return messages;
    }

    function extractProductInfo(container) {
        const productInfoSelectors = CONFIG.MARKETPLACE.activeChat.productInfo;
        const productElement = SELECTOR_UTILS.findElement(productInfoSelectors, container);
        if (!productElement) return null;
        
        try {
            const title = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productTitle, productElement)?.innerText.trim();
            const price = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productPrice, productElement)?.innerText.trim();
            const imageEl = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.productImage, productElement);
            const imageUrl = imageEl?.src;
            
            return { title, price, imageUrl };
        } catch (error) {
            logInfo(`Error extracting product info: ${error}`);
            return null;
        }
    }

    function updateChatProductInfo(chatId, productInfo) {
        if (!chatManager.activeChats.has(chatId)) return;
        
        const chatData = chatManager.activeChats.get(chatId);
        chatData.productInfo = productInfo;
        logInfo(`Updated product info for chat ${chatId}: ${productInfo.title}`);
    }

    function extractMessages(container) {
        const messageElements = SELECTOR_UTILS.findAllElements(CONFIG.MARKETPLACE.activeChat.messageRow, container);
        const messages = [];
        
        messageElements.forEach(element => {
            const content = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageContent, element)?.innerText.trim();
            if (!content) return;
            
            const isSentByYou = isMessageSentByYou(element);
            const sender = isSentByYou ? 'You' : 'Contact';
            
            // Try to extract timestamp, fallback to current time
            let timestamp;
            try {
                const timestampEl = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.messageTimestamp, element);
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

    function isMessageSentByYou(messageElement) {
        const alignCheck = messageElement.querySelector('[style*="flex-end"]');
        const possibleYou = messageElement.closest('div[class*="x1yc453h"]');
        return !!(alignCheck || possibleYou);
    }

    // ChatManager class - incorporated directly for Tampermonkey compatibility
    class ChatManager {
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
                    // Only click if it's not already selected
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
            const idAttr = chatElement.id || chatElement.getAttribute('data-testid');
            if (idAttr) return `chat_${idAttr}`;
            
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
    }
    
    // Create chatManager instance
    const chatManager = new ChatManager();
    
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
                
                // Use conversation builder to enhance the conversation data
                const chatContainer = SELECTOR_UTILS.findElement(CONFIG.MARKETPLACE.activeChat.container);
                if (chatContainer) {
                    buildConversationThread(chatContainer, currentChatId);
                }
                
                // Here you would integrate with an AI assistant to get a response
                const lastMessage = history[history.length - 1];
                if (lastMessage && !lastMessage.isSentByYou) {
                    // Example of an automated response (replace with AI-generated response)
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

    // Translation of code in Spanish
    function generateAutoResponse(incomingMessage) {
        // Example of basic response logic
        if (incomingMessage.toLowerCase().includes('hola') || 
            incomingMessage.toLowerCase().includes('hi') ||
            incomingMessage.toLowerCase().includes('hello')) {
            return 'Hello! Thanks for your message. How can I help you?';
        }
        
        if (incomingMessage.toLowerCase().includes('precio')) {
            return 'The listed price is final. It includes shipping to anywhere in the country.';
        }
        
        if (incomingMessage.toLowerCase().includes('disponible')) {
            return 'Yes, the product is still available. Are you interested?';
        }
        
        // Default response for now
        return 'Thank you for your message. I will respond as soon as possible.';
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
    
    // For debugging
    window.FB_CHAT_MONITOR = {
        chatManager,
        config: CONFIG,
        utils: SELECTOR_UTILS,
        runMonitor: runMarketplaceMonitor
    };
    
    // Detect which page we're on and run the corresponding scraper
    if (window.location.href.includes('facebook.com/marketplace/inbox')) {
        // Small delay to ensure the page is loaded
        setTimeout(runMarketplaceMonitor, 2000);
    } else if (window.location.href.includes('messenger.com')) {
        // We'll focus on Marketplace for now
        logInfo('Messenger support coming soon!');
    }
})();