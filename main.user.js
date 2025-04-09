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
                
                // Here you would integrate with an AI assistant to get a response
                // For now, we'll just log the conversation
                logInfo('Conversation history:');
                history.forEach(msg => {
                    logInfo(`${msg.sender}: ${msg.content}`);
                });
                
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