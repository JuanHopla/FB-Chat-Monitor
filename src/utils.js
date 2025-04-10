// Import configuration
import { CONFIG } from './config.js';

// Utility functions for selector resilience
export const SELECTOR_UTILS = {
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
export function waitForElement(selector, timeout = CONFIG.waitElementTimeout) {
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

export function autoScroll(container, callback, maxAttempts = CONFIG.scrollAttempts) {
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

export function logInfo(message) {
    console.log(`[FB-Chat-Monitor] ${message}`);
}