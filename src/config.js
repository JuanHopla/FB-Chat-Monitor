// Configuration file with selectors and constants

// Configuration object with all necessary constants
export const CONFIG = {
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

// For backward compatibility
export const FB_MARKETPLACE_SELECTORS = CONFIG.MARKETPLACE;
export const MESSENGER_SELECTORS = CONFIG.MESSENGER;