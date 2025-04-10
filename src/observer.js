import { logInfo } from './utils.js';

/**
 * Initialize a MutationObserver to watch for DOM changes
 * @param {Element} container - The DOM element to observe
 * @param {string|string[]} selector - Selector for elements to watch for
 * @param {Function} callback - Function to call when relevant mutations occur
 * @returns {MutationObserver} The observer instance
 */
export function initObserver(container, selector, callback) {
    logInfo(`Initializing observer for ${container.tagName}`);
    
    const observer = new MutationObserver(mutations => {
        let shouldProcess = false;
        
        // Check if any relevant nodes were added
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                if (Array.isArray(selector)) {
                    for (const sel of selector) {
                        if (mutation.target.querySelector(sel)) {
                            shouldProcess = true;
                            break;
                        }
                    }
                    if (shouldProcess) break;
                } else if (mutation.target.querySelector(selector)) {
                    shouldProcess = true;
                    break;
                }
            }
        }
        
        // If relevant nodes were added, trigger callback
        if (shouldProcess) {
            logInfo('Observer detected relevant changes');
            callback(mutations);
        }
    });
    
    observer.observe(container, {
        childList: true,
        subtree: true
    });
    
    logInfo('Observer initialized successfully');
    return observer;
}

/**
 * Stop and disconnect an observer
 * @param {MutationObserver} observer - The observer to disconnect
 */
export function stopObserver(observer) {
    if (observer) {
        observer.disconnect();
        logInfo('Observer disconnected');
    }
}