/**
 * Utility to send messages split into chunks to the OpenAI Assistants API
 */

/**
 * Sends messages to an OpenAI thread, automatically dividing those that exceed the limit of 10 elements
 * @param {Array} messages - Array of {role, content} objects prepared for the API
 * @param {string} threadId - ID of the thread where to send the messages
 * @param {string|Object} apiKeyOrClient - OpenAI API key or OpenAIApiClient instance
 * @returns {Promise<boolean>} - True if all messages were sent correctly
 */
async function sendConversationInChunks(messages, threadId, apiKeyOrClient) {
    if (!threadId) {
        throw new Error('Valid threadId is required');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        console.warn('No messages to send to the thread');
        return false;
    }

    // Determine if we're using an API client or direct API key
    let apiClient = null;
    let apiKey = null;

    if (typeof apiKeyOrClient === 'string') {
        apiKey = apiKeyOrClient;
    } else if (apiKeyOrClient && typeof apiKeyOrClient === 'object') {
        apiClient = apiKeyOrClient;
    } else {
        throw new Error('Valid apiKey or apiClient is required');
    }

    // Set up for API calls
    const baseUrl = 'https://api.openai.com/v1';
    const headers = apiKey ? {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
    } : null;

    try {
        const logPrefix = '[MessageChunker]';
        console.log(`${logPrefix} Sending ${messages.length} messages to thread ${threadId}`);
        
        // For each message, check if it needs to be split
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            
            // Validate message structure
            if (!message.role || !message.content) {
                console.warn(`${logPrefix} Invalid message #${i+1}, skipped`);
                continue;
            }

            // Skip system messages
            if (message.role === 'system') {
                console.debug(`${logPrefix} Message #${i+1} (system) skipped`);
                continue;
            }

            // Check if the message needs to be split (more than 10 elements)
            if (Array.isArray(message.content) && message.content.length > 10) {
                console.debug(`${logPrefix} Splitting message #${i+1} with ${message.content.length} elements into blocks of 10`);
                
                // Divide into blocks of 10 elements
                const contentChunks = [];
                for (let j = 0; j < message.content.length; j += 10) {
                    contentChunks.push(message.content.slice(j, j + 10));
                }
                
                // Send each block as a separate message
                for (let k = 0; k < contentChunks.length; k++) {
                    const chunkContent = contentChunks[k];
                    const isFirstChunk = k === 0;
                    
                    // Add fragmentation indicators to text messages
                    if (chunkContent.length > 0 && chunkContent[0].type === 'text') {
                        const prefix = isFirstChunk ? '' : '[Continuación] ';
                        const suffix = k < contentChunks.length - 1 ? ' [Continúa...]' : '';
                        
                        if (prefix || suffix) {
                            chunkContent[0] = {
                                ...chunkContent[0],
                                text: prefix + chunkContent[0].text + suffix
                            };
                        }
                    }
                    
                    // Send this block - using apiClient if available, direct API call if not
                    if (apiClient) {
                        await apiClient.addMessage(threadId, {
                            role: message.role,
                            content: chunkContent
                        });
                    } else {
                        const response = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                role: message.role,
                                content: chunkContent
                            })
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
                        }
                    }
                    
                    console.debug(`${logPrefix} Sent block ${k+1}/${contentChunks.length} of message #${i+1}`);
                }
            } else {
                // Normal message (no splitting required)
                if (apiClient) {
                    await apiClient.addMessage(threadId, {
                        role: message.role,
                        content: message.content
                    });
                } else {
                    const response = await fetch(`${baseUrl}/threads/${threadId}/messages`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            role: message.role, 
                            content: message.content
                        })
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
                    }
                }
                
                console.debug(`${logPrefix} Sent complete message #${i+1}`);
            }
            
            // Small pause between messages
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }
        
        console.log(`${logPrefix} All messages sent successfully to thread ${threadId}`);
        return true;
    } catch (error) {
        console.error(`Error sending messages: ${error.message}`);
        throw error;
    }
}

// Export both as a standalone function and a utility object
window.sendConversationInChunks = sendConversationInChunks;
window.MessageChunker = { sendConversationInChunks };
