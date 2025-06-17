/**
 * ThreadMessageHandler
 *
 * Module specialized in preparing messages for threads according to their type (new or existing)
 * and handling the continuation of contexts from specific points.
 */
class ThreadMessageHandler {
    /**
     * Prepares messages to send to the assistant depending on whether it is a new or existing thread
     * @param {Object} context - Context with messages and product details
     * @param {Object} threadInfo - Current thread information
     * @returns {Promise<Array>} Prepared messages
     */
    static prepareMessagesBasedOnThreadType(context, threadInfo) {
        const newCfg = CONFIG.newThreads || {};
        const existCfg = CONFIG.existingThreads || {};

        // NEW: Pre-process product details to filter images
        if (context.productDetails && window.ImageFilterUtils) {
            context.productDetails = window.ImageFilterUtils.preprocessProductDetails(context.productDetails);
        }

        if (threadInfo.isNew) {
            // Limit number of messages and images
            const msgs = context.messages.slice(-newCfg.maxMessages);
            msgs.forEach(m => {
                if (m.content.media?.images && m.content.media.images.length > newCfg.maxProductImages) {
                    m.content.media.images = m.content.media.images.slice(0, newCfg.maxProductImages);
                }
            });
            // Image quality
            msgs.forEach(m => {
                m.content.media.images?.forEach(img => {
                    img.quality = newCfg.imageDetail;
                });
            });
            return MessageUtils.prepareMessageContent({ ...context, messages: msgs });
        } else {
            const msgs = context.messages;
            const lastPos = threadInfo.lastPosition || {};
            let idx = -1;

            // 1) Search by last processed ID
            if (lastPos.messageId) {
                idx = msgs.findIndex(m => m.id === lastPos.messageId);
            }
            // 2) If not found, search by timestamp
            if (idx < 0 && lastPos.timestamp) {
                idx = msgs.findIndex(m => m.timestamp === lastPos.timestamp);
            }
            // 3) If still not found, take the last maxMessages
            let start = idx >= 0 ? idx + 1 : Math.max(0, msgs.length - newCfg.maxMessages);

            const sliceMsgs = msgs.slice(start);
            // Apply image limits and detail as in new thread
            sliceMsgs.forEach(m => {
                // CORRECTION: Ensure that m.content exists and has the correct structure
                if (!m.content) {
                    m.content = { text: '', media: { images: [] } };
                } else if (typeof m.content === 'string') {
                    // If content is a string, convert it to an object
                    const text = m.content;
                    m.content = { text, media: { images: [] } };
                } else if (!m.content.media) {
                    // If content exists but media doesn't, initialize it
                    m.content.media = { images: [] };
                } else if (!m.content.media.images) {
                    // If media exists but images doesn't, initialize it
                    m.content.media.images = [];
                }

                // NEW: Filter problematic images if the centralized module is available
                if (window.ImageFilterUtils && m.content.media && Array.isArray(m.content.media.images)) {
                    // Filter each image in the structure
                    m.content.media.images = m.content.media.images.filter(img => {
                        if (!img || !img.url) return false;
                        const isValid = !window.ImageFilterUtils.isProblematicFacebookImage(img.url);
                        if (!isValid) {
                            logger.debug(`Filtered problematic image in message: ${img.url}`);
                        }
                        return isValid;
                    });
                }

                // Now we can safely access m.content.media.images
                if (m.content.media.images && m.content.media.images.length > newCfg.maxProductImages) {
                    m.content.media.images = m.content.media.images.slice(0, newCfg.maxProductImages);
                }
                
                // Make sure images is an array before using forEach
                if (Array.isArray(m.content.media.images)) {
                  m.content.media.images.forEach(img => { 
                    if (img) { // Verify that img is not null or undefined
                      img.quality = newCfg.imageDetail; 
                    }
                  });
                }
            });

            // Prepare the final message using MessageUtils
            const preparedMessages = MessageUtils.prepareMessageContent({ ...context, messages: sliceMsgs });

            // NEW: Apply the centralized filter to the prepared messages
            return window.ImageFilterUtils ? 
              window.ImageFilterUtils.filterImagesInOpenAIMessages(preparedMessages) : 
              preparedMessages;
          }
    }

    /**
     * Prepares messages for a new thread with applied limits
     * @param {Object} context - Context with messages and product details
     * @returns {Promise<Array>} Prepared messages
     */
    static async prepareNewThreadMessages(context) {
        try {
            // Get configuration or use default values
            const config = window.CONFIG?.threadSystem?.newThreads || {
                maxMessages: 50,
                maxProductImages: 5,
                imageDetail: "high"
            };

            logger.debug(`Preparing new thread with limits: maxMessages=${config.maxMessages}, maxProductImages=${config.maxProductImages}`);

            // 1. Limit messages to the configured maximum (last N messages)
            const limitedMessages = context.messages.slice(-config.maxMessages);

            // 2. Process product details if available
            if (context.productDetails) {
                // Limit product images according to configuration
                if (context.productDetails.images && Array.isArray(context.productDetails.images)) {
                    context.productDetails.images = context.productDetails.images.slice(0, config.maxProductImages);
                    logger.debug(`Limited product images to ${context.productDetails.images.length}`);
                }

                // Same for allImages if it exists
                if (context.productDetails.allImages && Array.isArray(context.productDetails.allImages)) {
                    context.productDetails.allImages = context.productDetails.allImages.slice(0, config.maxProductImages);
                    logger.debug(`Limited allImages to ${context.productDetails.allImages.length}`);
                }

                // Adjust image quality if necessary
                if (config.imageDetail === "low") {
                    this._reduceImageQuality(context.productDetails);
                }
            }

            // 3. Use MessageUtils with the limited context
            const contextWithLimits = {
                ...context,
                messages: limitedMessages
            };

            // 4. Delegate to the existing MessageUtils to prepare the messages
            return await window.MessageUtils.prepareMessageContent(contextWithLimits);
        } catch (error) {
            logger.error(`Error preparing new thread messages: ${error.message}`, {}, error);
            throw error;
        }
    }

    /**
     * Prepares messages to continue an existing thread
     * @param {Object} context - Context with messages and product details
     * @param {Object} lastPosition - Last processed point
     * @returns {Promise<Array>} New messages
     */
    static async prepareContinuationMessages(context, lastPosition) {
        try {
            // If there is no position information, treat it as a new thread
            if (!lastPosition || (!lastPosition.messageId && !lastPosition.timestamp)) {
                logger.debug('No valid last position found, treating as new thread');
                return await this.prepareNewThreadMessages(context);
            }

            // Configuration for existing threads
            const config = window.CONFIG?.threadSystem?.existingThreads || {
                ignoreOlderThan: 24 * 60 * 60 * 1000,
                onlyNewConversations: false
            };

            // Verify if we should ignore old messages
            if (lastPosition.date && config.ignoreOlderThan > 0) {
                const timeSinceLastMessage = Date.now() - lastPosition.date;
                if (timeSinceLastMessage > config.ignoreOlderThan) {
                    logger.log(`Last message is too old (${Math.round(timeSinceLastMessage / 1000 / 60)} minutes), ignoring history`);
                    return await this.prepareNewThreadMessages(context);
                }
            }

            // PHASE 3: Implementation of conversation analysis to optimize processing
            const convAnalysis = this.analyzeConversation(context.messages);

            // If the conversation is too large, consider summary strategies
            if (convAnalysis.messageCount > 100) {
                return await this.prepareOptimizedContinuation(context, lastPosition, convAnalysis);
            }

            // Find index of the last processed message
            const lastMessageIndex = this.findLastProcessedMessageIndex(context.messages, lastPosition);

            if (lastMessageIndex === -1) {
                // If not found, use timestamp as reference
                logger.debug('Could not find last message by ID, trying timestamp match');
                const timestampIndex = window.TimestampUtils.findMessageByTimestamp(context.messages, lastPosition);

                if (timestampIndex !== -1) {
                    logger.debug(`Found match by timestamp at index ${timestampIndex}`);
                    return await this.formatMessagesFromIndex(context, timestampIndex + 1);
                }

                // If we don't find a continuation point, treat as new but with context
                logger.warn('Could not find continuation point, using standard preparation with context hint');
                context.messages.unshift({
                    role: 'system',
                    content: `Note: This is a continuation of a previous conversation. Last message context was: "${lastPosition.content || 'Unknown'}"`
                });
                return await this.prepareNewThreadMessages(context);
            }

            // If we find the exact point, continue from there
            logger.debug(`Found exact message match at index ${lastMessageIndex}`);
            return await this.formatMessagesFromIndex(context, lastMessageIndex + 1);
        } catch (error) {
            logger.error(`Error preparing continuation messages: ${error.message}`, {}, error);

            // Fallback in case of error
            return await this.prepareNewThreadMessages(context);
        }
    }

    /**
     * PHASE 3: Prepares an optimized continuation for long conversations
     * @param {Object} context - Complete context
     * @param {Object} lastPosition - Last processed point
     * @param {Object} analysis - Conversation analysis
     * @returns {Promise<Array>} Prepared messages
     */
    static async prepareOptimizedContinuation(context, lastPosition, analysis) {
        try {
            logger.debug(`Using optimized continuation for large conversation (${analysis.messageCount} messages)`);

            // Strategy 1: If there are many total messages but few new ones, use only the new ones
            if (analysis.lastKnownPosition > 0) {
                const newMessagesCount = context.messages.length - analysis.lastKnownPosition;

                // If there are a reasonable number of new messages, we use only those
                if (newMessagesCount > 0 && newMessagesCount <= 50) {
                    logger.debug(`Using ${newMessagesCount} new messages since last known position`);
                    return await this.formatMessagesFromIndex(context, analysis.lastKnownPosition);
                }
            }

            // Strategy 2: Use summary + recent messages
            // We summarize the old messages and add the most recent ones
            const summaryMessages = this.createConversationSummary(context.messages, analysis);

            // Get the last N messages (maximum 30)
            const recentMessages = context.messages.slice(-30);

            // Combine summary + recent messages
            const combinedContext = {
                ...context,
                messages: [...summaryMessages, ...recentMessages]
            };

            logger.debug(`Created optimized context with summary + ${recentMessages.length} recent messages`);
            return await window.MessageUtils.prepareMessageContent(combinedContext);

        } catch (error) {
            logger.error(`Error in optimized continuation: ${error.message}`, {}, error);
            // Fallback to a basic continuation
            return await this.formatMessagesFromIndex(context, Math.max(0, context.messages.length - 50));
        }
    }

    /**
     * PHASE 3: Creates a conversation summary to optimize the context
     * @param {Array} messages - Complete messages
     * @param {Object} analysis - Conversation analysis
     * @returns {Array} Summary messages
     */
    static createConversationSummary(messages, analysis) {
        // Create a system message with the summary
        const summary = {
            role: 'system',
            content: 'CONVERSATIONAL CONTEXT: '
        };

        // Information about the product (if it exists in the initial messages)
        let productInfo = '';
        for (let i = 0; i < Math.min(10, messages.length); i++) {
            const msg = messages[i];
            if (msg.content && typeof msg.content === 'object' && msg.content.text) {
                const text = msg.content.text.toLowerCase();
                if (text.includes('product') || text.includes('price') || text.includes('selling')) {
                    productInfo = msg.content.text;
                    break;
                }
            }
        }

        if (productInfo) {
            summary.content += `\nProduct discussed: ${productInfo}\n\n`;
        }

        // Summarize the number of messages and participants
        summary.content += `This is a continuation of a conversation with ${analysis.messageCount} previous messages`;

        // Mention price negotiations if detected
        if (analysis.hasPriceNegotiation) {
            summary.content += `. There has been price negotiation`;
        }

        // Add information about agreements
        if (analysis.hasAgreement) {
            summary.content += `. The parties appear to have reached some agreement`;
        } else {
            summary.content += `. The conversation is ongoing with no final agreement yet`;
        }

        // Add an extract of the last known message as a reference
        if (analysis.lastMessage) {
            summary.content += `.\n\nLast message context: "${analysis.lastMessage}"`;
        }

        return [summary];
    }

    /**
     * PHASE 3: Analyzes the conversation to extract useful information
     * @param {Array} messages - Messages to analyze
     * @returns {Object} Conversation analysis
     */
    static analyzeConversation(messages) {
        const analysis = {
            messageCount: messages.length,
            lastKnownPosition: -1,
            hasPriceNegotiation: false,
            hasAgreement: false,
            lastMessage: '',
            participantCount: 0
        };

        // Set for tracking unique participants
        const participants = new Set();

        // Patterns to detect price negotiation
        const pricePatterns = [
            /price|precio|pay|pagar|\$|€|cost|costo|worth|vale/i,
            /discount|descuento|offer|oferta|lower|cheaper|barato|cheap/i
        ];

        // Patterns to detect agreements
        const agreementPatterns = [
            /agree|agreed|acuerdo|deal|trato|accept|acepto/i,
            /sounds good|me parece bien|perfect|perfecto/i,
            /when can|we meet|nos encontramos|pickup|recoger/i
        ];

        // Analyze each message
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // Verify participant
            if (msg.sentByUs !== undefined) {
                participants.add(msg.sentByUs ? 'me' : 'them');
            } else if (msg.role) {
                participants.add(msg.role);
            }

            // Extract message text
            let messageText = '';
            if (typeof msg.content === 'string') {
                messageText = msg.content;
            } else if (msg.content && msg.content.text) {
                messageText = typeof msg.content.text === 'string' ?
                    msg.content.text :
                    JSON.stringify(msg.content.text);
            }

            // Verify price negotiation
            if (!analysis.hasPriceNegotiation && messageText) {
                analysis.hasPriceNegotiation = pricePatterns.some(pattern => pattern.test(messageText));
            }

            // Verify agreements
            if (!analysis.hasAgreement && messageText) {
                analysis.hasAgreement = agreementPatterns.some(pattern => pattern.test(messageText));
            }

            // Save reference of the last message
            if (messageText && i === messages.length - 1) {
                // Limit to 50 characters
                analysis.lastMessage = messageText.substring(0, 100);
                if (analysis.lastMessage.length < messageText.length) {
                    analysis.lastMessage += '...';
                }
            }

            // Verify if this message could be a known continuation point
            if (msg.id && msg.id.startsWith('msg_')) {
                analysis.lastKnownPosition = i;
            }
        }

        analysis.participantCount = participants.size;

        return analysis;
    }

    /**
     * Finds the index of the last processed message
     * @param {Array} messages - List of messages
     * @param {Object} lastPosition - Position information (messageId, content)
     * @returns {number} Message index or -1 if not found
     */
    static findLastProcessedMessageIndex(messages, lastPosition) {
        if (!lastPosition || !lastPosition.messageId || !lastPosition.content) {
            return -1;
        }

        // Search by ID and content
        const exactMatch = messages.findIndex(msg =>
            msg.id === lastPosition.messageId &&
            (msg.content?.text === lastPosition.content ||
                (typeof msg.content === 'string' && msg.content === lastPosition.content))
        );

        if (exactMatch !== -1) {
            return exactMatch;
        }

        // Search only by ID if we don't find an exact match
        const idMatch = messages.findIndex(msg => msg.id === lastPosition.messageId);

        if (idMatch !== -1) {
            return idMatch;
        }

        // Search by content if we don't find an ID match
        if (lastPosition.content) {
            const contentMatch = messages.findIndex(msg => {
                const msgText = msg.content?.text ||
                    (typeof msg.content === 'string' ? msg.content : '');
                return msgText === lastPosition.content;
            });

            if (contentMatch !== -1) {
                return contentMatch;
            }
        }

        return -1;
    }

    /**
     * Formats messages from a specific index to send to the API
     * @param {Object} context - Complete context
     * @param {number} startIndex - Index from where to start
     * @returns {Promise<Array} Formatted messages
     */
    static async formatMessagesFromIndex(context, startIndex) {
        try {
            // Verify that the index is valid
            if (startIndex < 0 || startIndex >= context.messages.length) {
                logger.warn(`Invalid start index (${startIndex}) for formatMessagesFromIndex`);
                return await this.prepareNewThreadMessages(context);
            }

            // Copy only the new messages (from the indicated index)
            const newMessages = context.messages.slice(startIndex);

            if (newMessages.length === 0) {
                logger.warn('No new messages found after the last processed point');

                // Include the last message to give context
                if (startIndex > 0) {
                    newMessages.push(context.messages[startIndex - 1]);
                }

                // If there are still no messages, include a system message to give context
                if (newMessages.length === 0) {
                    newMessages.push({
                        role: 'system',
                        content: 'Continue the previous conversation. User may have questions about the last message.'
                    });
                }
            }

            logger.log(`Preparing ${newMessages.length} new messages from index ${startIndex}`);

            // PHASE 3: Determine if it is necessary to include more context
            let needsExtraContext = false;

            // If there are more than 5 new messages and the thread has been going on for longer
            if (newMessages.length > 5 && startIndex > 10) {
                needsExtraContext = true;
            }

            // If the need for additional context has been detected
            if (needsExtraContext) {
                // Analysis of previous messages
                const previousMessages = context.messages.slice(0, startIndex);
                const analysis = this.analyzeConversation(previousMessages);

                // Create summary messages
                const summaryMessages = this.createConversationSummary(previousMessages, analysis);

                // Combine summary with new messages
                newMessages.unshift(...summaryMessages);

                logger.debug('Added conversation summary for context continuity');
            }

            // Prepare the new context only with the new messages (plus summary if necessary)
            const continuationContext = {
                ...context,
                messages: newMessages,
                isContinuation: true // Mark to indicate that it is a continuation
            };

            // If there is a product in the original context, simplify it for the continuation
            // so as not to repeat all the product information
            if (context.productDetails) {
                continuationContext.productDetails = {
                    title: context.productDetails.title,
                    price: context.productDetails.price
                };
            }

            // Use MessageUtils for the final preparation
            return await window.MessageUtils.prepareMessageContent(continuationContext);
        } catch (error) {
            logger.error(`Error formatting messages from index: ${error.message}`, {}, error);
            return await this.prepareNewThreadMessages(context);
        }
    }

    /**
     * Reduces the quality of images to save tokens
     * @param {Object} productDetails - Product details with images
     * @private
     */
    static _reduceImageQuality(productDetails) {
        try {
            // Function to reduce quality in a URL
            const reduceQuality = (url) => {
                if (!url || typeof url !== 'string') return url;

                // For Facebook/CDN URLs that support quality parameters
                if (url.includes('fbcdn.net') || url.includes('fbsbx.com')) {
                    // Remove existing high quality parameters
                    let modifiedUrl = url.replace(/&oh=.*?(&|$)/, '$1')
                        .replace(/&oe=.*?(&|$)/, '$1');

                    // Add low quality parameter if it doesn't already have one
                    if (!modifiedUrl.includes('&q=')) {
                        modifiedUrl += (modifiedUrl.includes('?') ? '&' : '?') + 'q=70';
                    }

                    return modifiedUrl;
                }

                return url; // Return unchanged if it cannot be modified
            };

            // Apply to all images
            if (productDetails.images && Array.isArray(productDetails.images)) {
                productDetails.images = productDetails.images.map(reduceQuality);
            }

            if (productDetails.allImages && Array.isArray(productDetails.allImages)) {
                productDetails.allImages = productDetails.allImages.map(reduceQuality);
            }

            if (productDetails.imageUrls && Array.isArray(productDetails.imageUrls)) {
                productDetails.imageUrls = productDetails.imageUrls.map(reduceQuality);
            }
        } catch (error) {
            logger.debug(`Error reducing image quality: ${error.message}`);
            // We do not propagate the error since this is an optional optimization
        }
    }
}

// Export globally
window.ThreadMessageHandler = ThreadMessageHandler;
