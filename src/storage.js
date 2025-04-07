import { logInfo } from './utils.js';

/**
 * Storage module for FB-Chat-Monitor
 * Handles saving, retrieving and managing message data across platforms
 */

// Save a message to the specified platform's storage
export function saveToPlatform(platform, messageData) {
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
        logInfo(`Message saved to ${platform} storage`);
    } catch (error) {
        console.error(`[FB-Chat-Monitor] Error saving message to ${platform}:`, error);
    }
}

// Get all messages from the specified platform's storage
export function getMessagesFromPlatform(platform) {
    try {
        const key = `fb-chat-monitor-${platform}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (error) {
        console.error(`[FB-Chat-Monitor] Error retrieving messages from ${platform}:`, error);
        return [];
    }
}

// Clear all messages for a specified platform
export function clearPlatformMessages(platform) {
    localStorage.removeItem(`fb-chat-monitor-${platform}`);
    logInfo(`Cleared saved messages for ${platform}`);
}

// Export all messages as JSON file for download
export function exportMessages(platform) {
    try {
        const messages = getMessagesFromPlatform(platform);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(messages, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `fb-chat-monitor-${platform}-export-${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        logInfo(`Exported ${messages.length} messages from ${platform}`);
    } catch (error) {
        console.error(`[FB-Chat-Monitor] Error exporting messages from ${platform}:`, error);
    }
}
