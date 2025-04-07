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
    
    // For Tampermonkey testing, we include the main code here
    // We detect the current URL and load the corresponding module
    
    // Simplified version of the main code for testing
    const CONFIG = {
        // General settings
        scrollAttempts: 20,
        scrollInterval: 300,
        waitElementTimeout: 10000,
        waitElementCheckInterval: 100,
        
        // Facebook Marketplace selectors
        MARKETPLACE: {
            buyingTab: 'div[role=tab]:nth-child(3)',
            chatContainer: 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm',
            messagesWrapper: 'div.x1ey2m1c.x78zum5.x164qtfw.xixxii4.x1vjfegm',
            messageRow: 'div[role="row"]',
            messageContent: 'div[dir="auto"]'
        },
        
        // Messenger selectors
        MESSENGER: {
            messagesContainer: '.message-container',
            messageItem: '.message-item',
            author: '.author',
            content: '.content',
            date: '.timestamp'
        }
    };
    
    // Utility functions
    function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
        return new Promise((resolve, reject) => {
            const interval = CONFIG.waitElementCheckInterval;
            let elapsed = 0;
            const check = () => {
                const el = document.querySelector(selector);
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
    
    // Facebook Marketplace Scraper
    function initFbMarketplaceScraper() {
        logInfo('Initializing Facebook Marketplace scraper...');
        
        waitForElement(CONFIG.MARKETPLACE.buyingTab).then(buyingBtn => {
            buyingBtn.click();
            logInfo('Clicked "Buying" tab ✅');
            return waitForElement(CONFIG.MARKETPLACE.chatContainer);
        }).then(chatContainer => {
            const messagesWrapper = chatContainer.querySelector(CONFIG.MARKETPLACE.messagesWrapper);
            logInfo('Scrolling to load chat history...');
            
            autoScroll(messagesWrapper, () => {
                logInfo('Chat history loaded ✅');
                // Extract existing messages and set up the observer
                setupMarketplaceObserver(messagesWrapper);
            });
        }).catch(err => {
            console.error('[FB-Chat-Monitor] Error:', err);
        });
    }
    
    function setupMarketplaceObserver(container) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const messageElement = node.matches && 
                                node.matches(CONFIG.MARKETPLACE.messageRow) ? 
                                node : node.querySelector(CONFIG.MARKETPLACE.messageRow);
                            
                            if (messageElement) {
                                const content = messageElement.querySelector(CONFIG.MARKETPLACE.messageContent)?.innerText.trim();
                                if (content) {
                                    // Get sender information (you or the other person)
                                    const isSentByYou = isMessageSentByYou(messageElement);
                                    const sender = isSentByYou ? 'You' : 'Contact';
                                    
                                    // Log and save the message
                                    logInfo(`New message in Marketplace: "${content}"`);
                                    saveMessage('marketplace', { 
                                        sender: sender,
                                        content: content,
                                        isSentByYou: isSentByYou
                                    });
                                }
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(container, { childList: true, subtree: true });
        logInfo('Marketplace observer started 🧠');
    }
    
    // Helper function to determine if a message was sent by the current user
    function isMessageSentByYou(messageElement) {
        // Check if message is sent by current user based on styling
        const alignCheck = messageElement.querySelector('[style*="flex-end"]');
        const possibleYou = messageElement.closest('div[class*="x1yc453h"]');
        return !!(alignCheck || possibleYou);
    }
    
    // Messenger Scraper
    function initMessengerScraper() {
        logInfo('Initializing Messenger scraper...');
        
        waitForElement(CONFIG.MESSENGER.messagesContainer).then(container => {
            logInfo('Found messages container ✅');
            setupMessengerObserver(container);
        }).catch(err => {
            console.error('[FB-Chat-Monitor] Error:', err);
        });
    }
    
    function setupMessengerObserver(container) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const messageElement = node.matches && 
                                node.matches(CONFIG.MESSENGER.messageItem) ? 
                                node : node.querySelector(CONFIG.MESSENGER.messageItem);
                            
                            if (messageElement) {
                                const author = messageElement.querySelector(CONFIG.MESSENGER.author)?.innerText.trim();
                                const content = messageElement.querySelector(CONFIG.MESSENGER.content)?.innerText.trim();
                                const date = messageElement.querySelector(CONFIG.MESSENGER.date)?.getAttribute('title') || new Date().toISOString();
                                
                                if (author && content) {
                                    // Determine if the message is from the current user
                                    const currentUser = 'You'; // Could be dynamically determined
                                    const isSentByYou = author === currentUser;
                                    
                                    // Log and save the message
                                    logInfo(`New message in Messenger from ${author}: "${content}"`);
                                    saveMessage('messenger', {
                                        sender: author,
                                        content: content,
                                        date: date,
                                        isSentByYou: isSentByYou
                                    });
                                }
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(container, { childList: true, subtree: true });
        logInfo('Messenger observer started 🧠');
    }
    
    // Added: Function to save messages to localStorage for persistence
    function saveMessage(platform, messageData) {
        try {
            const key = `fb-chat-monitor-${platform}`;
            const existingData = JSON.parse(localStorage.getItem(key) || '[]');
            existingData.push({
                ...messageData,
                timestamp: new Date().toISOString()
            });
            // Keep only last 100 messages
            if (existingData.length > 100) {
                existingData.shift();
            }
            localStorage.setItem(key, JSON.stringify(existingData));
        } catch (error) {
            console.error('[FB-Chat-Monitor] Error saving message:', error);
        }
    }
    
    // Added: Function to access saved messages
    function getSavedMessages(platform) {
        try {
            const key = `fb-chat-monitor-${platform}`;
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (error) {
            console.error('[FB-Chat-Monitor] Error retrieving messages:', error);
            return [];
        }
    }
    
    // Expose function to global scope for debugging
    window.FB_CHAT_MONITOR = {
        getSavedMessages,
        clearSavedMessages: (platform) => {
            localStorage.removeItem(`fb-chat-monitor-${platform}`);
            logInfo(`Cleared saved messages for ${platform}`);
        }
    };
    
    // Detect which page we're on and run the corresponding scraper
    if (window.location.href.includes('facebook.com/marketplace/inbox')) {
        setTimeout(initFbMarketplaceScraper, 1000); // Small delay to ensure the page is loaded
    } else if (window.location.href.includes('messenger.com')) {
        setTimeout(initMessengerScraper, 1000);
    }
})();