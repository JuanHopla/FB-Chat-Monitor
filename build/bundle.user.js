// ==UserScript==
// @name         Messenger & FB Marketplace Chat Scraper
// @namespace    http://yoursite.com/
// @version      0.1
// @description  Extracts chat data from Messenger and Facebook Marketplace in real-time using MutationObserver.
// @author       YourName
// @match        https://www.messenger.com/*
// @match        https://www.facebook.com/marketplace/inbox*
// @grant        none
// ==/UserScript==

(function(){
    'use strict';
    
    // Config module content
    const CONFIG = {
        scrollAttempts: 20,
        scrollInterval: 300,
        waitElementTimeout: 10000,
        waitElementCheckInterval: 100
    };
    
    const FB_MARKETPLACE_SELECTORS = {
        buyingTab: 'div[role=tab]:nth-child(3)',
        chatContainer: 'div.x1ey2m1c.xds687c.xixxii4.x1vjfegm',
        messagesWrapper: 'div.x1ey2m1c.x78zum5.x164qtfw.xixxii4.x1vjfegm',
        messageRow: 'div[role="row"]',
        messageContent: 'div[dir="auto"]'
    };
    
    const MESSENGER_SELECTORS = {
        messagesContainer: '.message-container',
        messageItem: '.message-item',
        author: '.author',
        content: '.content',
        date: '.timestamp'
    };
    
    // Utils module content
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
                console.log('End of scroll');
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
    
    // Observer module content
    function initObserver(container, messageSelector, processingCallback) {
        if (!container) {
            console.error('Observer: Container element not found');
            return;
        }

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    const newMessages = Array.from(mutation.addedNodes)
                        .filter(node => node.nodeType === Node.ELEMENT_NODE)
                        .filter(node => node.matches && (node.matches(messageSelector) || node.querySelector(messageSelector)));
                    
                    if (newMessages.length > 0) {
                        processingCallback(newMessages);
                    }
                }
            });
        });

        observer.observe(container, { childList: true, subtree: true });
        return observer;
    }
    
    // FB Marketplace Scraper module content
    function isMessageSentByYou(bubble) {
        const alignCheck = bubble.querySelector('[style*="flex-end"]');
        const possibleYou = bubble.closest('div[class*="x1yc453h"]');
        return !!(alignCheck || possibleYou);
    }

    function getMessageId(bubble) {
        const textNode = bubble.querySelector('div[dir="auto"]');
        if (!textNode) return null;
        return textNode.innerText.trim();
    }

    function extractFbMessages(container) {
        const messageBubbles = container.querySelectorAll(FB_MARKETPLACE_SELECTORS.messageRow);
        console.log('[📜 Chat history:]');
        messageBubbles.forEach(bubble => {
            const messageId = getMessageId(bubble);
            if (!messageId || (window.processedMessagesFB && window.processedMessagesFB.has(messageId))) return;
            if (!window.processedMessagesFB) { window.processedMessagesFB = new Set(); }
            window.processedMessagesFB.add(messageId);
            const isSent = isMessageSentByYou(bubble);
            const label = isSent ? 'You' : 'Sender';
            console.log(`[💬 ${label}]`, messageId);
        });
    }

    function initFbMarketplaceScraper() {
        console.log('[FB Bot] Initializing...');
        waitForElement(FB_MARKETPLACE_SELECTORS.buyingTab).then(buyingBtn => {
            buyingBtn.click();
            console.log('[FB Bot] Clicked "Buying" ✅');
            return waitForElement(FB_MARKETPLACE_SELECTORS.chatContainer);
        }).then(chatContainer => {
            const messagesWrapper = chatContainer.querySelector(FB_MARKETPLACE_SELECTORS.messagesWrapper);
            console.log('[FB Bot] Scrolling to load chat history...');
            autoScroll(messagesWrapper, () => {
                console.log('[FB Bot] Chat history loaded ✅');
                extractFbMessages(messagesWrapper);
                
                const observer = new MutationObserver(mutations => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                const bubble = node.closest(FB_MARKETPLACE_SELECTORS.messageRow) || node;
                                const messageId = getMessageId(bubble);
                                if (!messageId || (window.processedMessagesFB && window.processedMessagesFB.has(messageId))) continue;
                                if (!window.processedMessagesFB) { window.processedMessagesFB = new Set(); }
                                window.processedMessagesFB.add(messageId);
                                const isSent = isMessageSentByYou(bubble);
                                const label = isSent ? 'You' : 'Sender';
                                console.log(`[💬 ${label}]`, messageId);
                            }
                        }
                    }
                });
                
                observer.observe(messagesWrapper, { childList: true, subtree: true });
                console.log('[FB Bot] Observer started 🧠');
            });
        }).catch(err => {
            console.error('[FB Bot] Error:', err);
        });
    }
    
    // Messenger Scraper module content
    function extractMessengerData(messageElement) {
        const author = messageElement.querySelector(MESSENGER_SELECTORS.author)?.innerText.trim() || 'Unknown';
        const content = messageElement.querySelector(MESSENGER_SELECTORS.content)?.innerText.trim() || '';
        const date = messageElement.querySelector(MESSENGER_SELECTORS.date)?.getAttribute('title') || '';
        return { author, content, date };
    }

    function processMessengerMessages(messages) {
        messages.forEach(msgEl => {
            const data = extractMessengerData(msgEl);
            console.log('Message extracted:', data);
        });
    }

    function initMessengerScraper() {
        console.log('[Messenger Bot] Initializing...');
        
        waitForElement(MESSENGER_SELECTORS.messagesContainer).then(container => {
            const existingMessages = container.querySelectorAll(MESSENGER_SELECTORS.messageItem);
            processMessengerMessages(Array.from(existingMessages));
            
            initObserver(container, MESSENGER_SELECTORS.messageItem, processMessengerMessages);
            console.log('[Messenger Bot] Observer initialized');
        }).catch(err => {
            console.error('[Messenger Bot] Error:', err);
        });
    }
    
    // Main execution
    console.log('[Chat Scraper] Script loaded 🚀');
    
    if (window.location.href.includes('facebook.com/marketplace/inbox')) {
        initFbMarketplaceScraper();
    } else if (window.location.href.includes('messenger.com')) {
        initMessengerScraper();
    }
})();
