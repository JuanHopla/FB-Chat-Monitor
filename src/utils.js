import { CONFIG } from './config.js';

// Utility to wait for an element to appear in the DOM
export function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
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

// Function for auto-scrolling to load historical messages
export function autoScroll(container, callback, maxAttempts = CONFIG.scrollAttempts) {
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

// Utility for logging info with consistent format
export function logInfo(message) {
    console.log(`[INFO] ${message}`);
}