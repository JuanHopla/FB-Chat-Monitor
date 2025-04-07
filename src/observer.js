import { logInfo } from './utils.js';

// Generic observer function to track DOM changes

export function initObserver(container, messageSelector, processingCallback) {
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
                    logInfo(`Processed ${newMessages.length} new messages`);
                }
            }
        });
    });

    observer.observe(container, { childList: true, subtree: true });
    return observer;
}