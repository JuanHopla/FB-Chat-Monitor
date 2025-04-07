import { CONFIG } from './config.js';
import { waitForElement, autoScroll, logInfo } from './utils.js';

function isMessageSentByYou(bubble) {
    // Check if message is sent by current user based on styling
    const alignCheck = bubble.querySelector('[style*="flex-end"]');
    const possibleYou = bubble.closest('div[class*="x1yc453h"]');
    return !!(alignCheck || possibleYou);
}

function getMessageId(bubble) {
    // Extract unique message identifier (using content as ID)
    const textNode = bubble.querySelector(CONFIG.MARKETPLACE.messageContent);
    if (!textNode) return null;
    return textNode.innerText.trim();
}

function extractMessages(container) {
    const messageBubbles = container.querySelectorAll(CONFIG.MARKETPLACE.messageRow);
    logInfo('📜 Chat history:');
    messageBubbles.forEach(bubble => {
        const messageId = getMessageId(bubble);
        if (!messageId || (window.processedMessagesFB && window.processedMessagesFB.has(messageId))) return;
        if (!window.processedMessagesFB) { window.processedMessagesFB = new Set(); }
        window.processedMessagesFB.add(messageId);
        const isSent = isMessageSentByYou(bubble);
        const label = isSent ? 'You' : 'Sender';
        logInfo(`💬 ${label}: ${messageId}`);
    });
}

function initFbObserver(container) {
    // Initialize mutation observer to track new messages in real-time
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    const bubble = node.closest(CONFIG.MARKETPLACE.messageRow) || node;
                    const messageId = getMessageId(bubble);
                    if (!messageId || (window.processedMessagesFB && window.processedMessagesFB.has(messageId))) continue;
                    if (!window.processedMessagesFB) { window.processedMessagesFB = new Set(); }
                    window.processedMessagesFB.add(messageId);
                    const isSent = isMessageSentByYou(bubble);
                    const label = isSent ? 'You' : 'Sender';
                    logInfo(`💬 ${label}: ${messageId}`);
                }
            }
        }
    });
    observer.observe(container, { childList: true, subtree: true });
    logInfo('[FB Bot] Observer started 🧠');
}

function initFbMarketplaceScraper() {
    logInfo('[FB Bot] Initializing...');
    waitForElement(CONFIG.MARKETPLACE.buyingTab).then(buyingBtn => {
        buyingBtn.click();
        logInfo('[FB Bot] Clicked "Buying" ✅');
        return waitForElement(CONFIG.MARKETPLACE.chatContainer);
    }).then(chatContainer => {
        const messagesWrapper = chatContainer.querySelector(CONFIG.MARKETPLACE.messagesWrapper);
        logInfo('[FB Bot] Scrolling to load chat history...');
        autoScroll(messagesWrapper, () => {
            logInfo('[FB Bot] Chat history loaded ✅');
            extractMessages(messagesWrapper);
            initFbObserver(messagesWrapper);
        });
    }).catch(err => {
        console.error('[FB Bot] Error:', err);
    });
}

export { initFbMarketplaceScraper };