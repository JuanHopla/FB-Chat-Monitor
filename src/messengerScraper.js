import { CONFIG } from './config.js';
import { waitForElement, logInfo } from './utils.js';
import { initObserver } from './observer.js';

function extractMessageData(messageElement) {
    // Extract message information from Messenger DOM elements
    const author = messageElement.querySelector(CONFIG.MESSENGER.author)?.innerText.trim() || 'Unknown';
    const content = messageElement.querySelector(CONFIG.MESSENGER.content)?.innerText.trim() || '';
    const date = messageElement.querySelector(CONFIG.MESSENGER.date)?.getAttribute('title') || '';
    return { author, content, date };
}

function processMessages(messages) {
    messages.forEach(msgEl => {
        const data = extractMessageData(msgEl);
        logInfo(`Message extracted: ${JSON.stringify(data)}`);
        // Add logic here to save or send data
    });
}

function initMessengerScraper() {
    logInfo('[Messenger Bot] Initializing...');
    
    // Wait for the messages container to appear
    waitForElement(CONFIG.MESSENGER.messagesContainer).then(container => {
        // Extract existing messages
        const existingMessages = container.querySelectorAll(CONFIG.MESSENGER.messageItem);
        processMessages(Array.from(existingMessages));
        
        // Initialize observer to track new messages
        initObserver(container, CONFIG.MESSENGER.messageItem, processMessages);
        logInfo('[Messenger Bot] Observer initialized');
    }).catch(err => {
        console.error('[Messenger Bot] Error:', err);
    });
}

export { initMessengerScraper };
