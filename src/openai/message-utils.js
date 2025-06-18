/**
 * Utilities to format and prepare messages for the OpenAI API
 * Handles the transformation of chat context to a format compatible with OpenAI
 */
class MessageUtils {
    /**
     * Prepares the message content with context for the AI
     * @param {Object} context - Context with messages and product details
     * @returns {Promise<Array>} Array of message content
     */
    static async prepareMessageContent(context) {
        if (!context || !context.messages || !Array.isArray(context.messages)) {
            logger.error('Invalid context for message preparation');
            return [];
        }

        try {
            // NEW: Pre-process product details to filter images
            if (context.productDetails && window.ImageFilterUtils) {
                context.productDetails = window.ImageFilterUtils.preprocessProductDetails(context.productDetails);
            }
            
            // First, ensure that all messages have the correct structure
            context.messages = context.messages.map(msg => {
                // Ensure that the message has a content object
                if (!msg.content) {
                    msg.content = { text: '', media: { images: [] } };
                } else if (typeof msg.content === 'string') {
                    // If content is a string, convert it to an object
                    const text = msg.content;
                    msg.content = { text, media: { images: [] } };
                } else if (!msg.content.media) {
                    // If content exists but media does not, initialize it
                    msg.content.media = { images: [] };
                } else if (!msg.content.media.images) {
                    // If media exists but images does not, initialize it
                    msg.content.media.images = [];
                }
                return msg;
            });

            // Organizes messages chronologically and assigns correct roles
            const formattedMessages = this.organizeMessagesByRole(context.messages);
            let preparedMessages = [];

            // Adds product details as the first message (or messages if content exceeds 10 items)
            if (context.productDetails) {
                const productContent = [];
                
                // Use extractor summary
                const summary = window.productExtractor.getRelevantProductSummary(context.productDetails);
                productContent.push({ type: "text", text: "PRODUCT DETAILS:\n" + summary });
                
                // Add product images (only from allImages, not the seller's profile)
                if (Array.isArray(context.productDetails.allImages) && context.productDetails.allImages.length > 0) {
                    let imagesToProcess = context.productDetails.allImages;
                    if (window.ImageFilterUtils) {
                        imagesToProcess = window.ImageFilterUtils.filterImageUrls(imagesToProcess);
                    }
                    
                    const validItems = [];
                    for (const imgUrl of imagesToProcess.slice(0, 6)) {
                        if (!imgUrl || typeof imgUrl !== 'string' || imgUrl.trim() === '') continue;
                        if (window.ImageFilterUtils && window.ImageFilterUtils.isProblematicFacebookImage(imgUrl)) continue;
                        validItems.push({ type: "image_url", image_url: { url: imgUrl } });
                    }
                    if (validItems.length > 0) {
                        productContent.push(...validItems);
                    }
                }
                
                // Push as a single user message
                preparedMessages.push({
                    role: "user",
                    content: productContent
                });
            }

            // Ignore trivial messages that do not add value to the conversation
            // IMPROVED: Filter trivial messages
            const filteredMessages = this.filterTrivialMessages(formattedMessages);
            
            // Convert message objects to the appropriate format for the API with validation
            // MODIFIED: Process each message and divide into chunks if necessary
            for (const message of filteredMessages) {
                // Prepare the message content
                const messageContentArray = this.prepareMessageContentItems(message);
                
                // IMPROVED: Verify that the array is not empty and has at least one text
                if (messageContentArray.length === 0) {
                    continue; // Skip messages without content
                }
                
                // Ensure that there is at least one text element
                if (!messageContentArray.some(item => item.type === 'text')) {
                    // If there are only images/files, add a descriptive text
                    const mediaTypes = [...new Set(messageContentArray.map(item => item.type))];
                    messageContentArray.unshift({
                        type: "text",
                        text: mediaTypes.length === 1 ? 
                            `[Content of type ${mediaTypes[0]}]` : 
                            `[Multimedia content: ${mediaTypes.join(', ')}]`
                    });
                }
                
                // Divide into chunks if necessary (limit of 10 elements per message)
                if (messageContentArray.length > 10) {
                    logger.debug(`Message content exceeds 10 items (${messageContentArray.length}), splitting into chunks`);
                    
                    for (let i = 0; i < messageContentArray.length; i += 10) {
                        const chunk = messageContentArray.slice(i, Math.min(i + 10, messageContentArray.length));
                        const isFirstChunk = i === 0;
                        
                        // IMPROVED: Verify if the chunk has at least one text element
                        const hasText = chunk.some(item => item.type === 'text');
                        
                        // If it does not have text or is not the first fragment and starts with an image, add a context text
                        if ((!hasText || !isFirstChunk) && chunk[0].type !== 'text') {
                            chunk.unshift({
                                type: "text",
                                text: message.role === 'assistant' ? 
                                      (isFirstChunk ? "Response:" : "[Continuation of response]") : 
                                      (isFirstChunk ? "Message:" : "[Continuation of message]")
                            });
                            // If this makes the chunk have 11 elements, remove the last one
                            if (chunk.length > 10) {
                                chunk.pop();
                            }
                        }
                        
                        // If this is a chunk after the first and contains text, add indicator
                        if (!isFirstChunk && chunk.some(item => item.type === 'text')) {
                            const firstTextIndex = chunk.findIndex(item => item.type === 'text');
                            if (firstTextIndex >= 0) {
                                const prefix = '[Continuation] ';
                                chunk[firstTextIndex] = {
                                    ...chunk[firstTextIndex],
                                    text: prefix + chunk[firstTextIndex].text
                                };
                            }
                        }
                        
                        // If this is not the last chunk and contains text, add indicator
                        const isLastChunk = i + 10 >= messageContentArray.length;
                        if (!isLastChunk) {
                            const lastTextIndex = [...chunk].reverse().findIndex(item => item.type === 'text');
                            if (lastTextIndex >= 0) {
                                const actualIndex = chunk.length - 1 - lastTextIndex;
                                const suffix = ' [Continues...]';
                                chunk[actualIndex] = {
                                    ...chunk[actualIndex],
                                    text: chunk[actualIndex].text + suffix
                                };
                            }
                        }
                        
                        preparedMessages.push({
                            role: message.role || 'user',
                            content: chunk
                        });
                    }
                } else {
                    // If it does not exceed 10 elements, add as a single message
                    preparedMessages.push({
                        role: message.role || 'user',
                        content: messageContentArray
                    });
                }
            }

            // Final validation to register potential problems
            preparedMessages.forEach((msg, index) => {
                // Check that the content array is valid
                const hasValidContent = msg.content && Array.isArray(msg.content) && msg.content.length > 0;
                
                if (!hasValidContent) {
                    logger.warn(`Message #${index} has an invalid content array. Role: ${msg.role}`);
                } else {
                    // Check each content item
                    msg.content.forEach((item, itemIndex) => {
                        if (item.type === "text" && (!item.text || typeof item.text !== 'string')) {
                            logger.warn(`Message #${index}, content item #${itemIndex} has invalid text.`);
                        }
                        if (item.type === "image_url" && (!item.image_url || !item.image_url.url)) {
                            logger.warn(`Message #${index}, content item #${itemIndex} has invalid image_url.`);
                        }
                    });
                }
            });

            // Register the exact messages being sent to OpenAI
            logger.debug('=== EXACT MESSAGE SENT TO OPENAI ===');
            logger.debug('1. Context Role:', context.role);
            logger.debug('2. Messages:', JSON.stringify(preparedMessages));
            logger.debug(`3. Total messages: ${preparedMessages.length}, with chunking applied`);
            
            // Log a summary of the chunks
            const chunkSummary = preparedMessages.map((msg, i) => 
                `Msg #${i+1}: role=${msg.role}, items=${msg.content.length}, ` +
                `types=[${[...new Set(msg.content.map(item => item.type))].join(',')}]`
            );
            logger.debug(`Message chunks summary:\n${chunkSummary.join('\n')}`);
            
            console.log('OPENAI_PAYLOAD →', preparedMessages);
            
            // NEW: Filter problematic images in all messages just before returning
            if (window.ImageFilterUtils) {
                preparedMessages = window.ImageFilterUtils.filterImagesInOpenAIMessages(preparedMessages);
            }
            
            return preparedMessages;
        } catch (error) {
            logger.error(`Error preparing message content: ${error.message}`, {}, error);
            return [];
        }
    }

    /**
     * Filters trivial messages that do not add value to the conversation
     * @param {Array} messages - List of messages
     * @returns {Array} - Filtered list of messages
     * @private
     */
    static filterTrivialMessages(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return [];

        // Regular expressions to identify trivial messages
        const trivialPatterns = [
            /^(👍|👌|✅|🙏|😊)$/,
        ];

        // 1. Identify which messages are trivial
        const messagesToKeep = messages.filter(msg => {
            // If the message has no content or is not text, we keep it
            if (!msg.content || typeof msg.content !== 'object' || !msg.content.text) {
                return true;
            }

            const messageText = typeof msg.content.text === 'string' 
                ? msg.content.text.trim() 
                : msg.content.text;
                
            // If it has images or other media, it is not trivial
            if (msg.content.imageUrls && msg.content.imageUrls.length > 0) {
                return true;
            }
            
            if (msg.content.media && Object.values(msg.content.media).some(v => v !== null && v.length > 0)) {
                return true;
            }
            
            // Check if it matches any trivial pattern
            for (const pattern of trivialPatterns) {
                if (pattern.test(messageText)) {
                    return false; // It is trivial, we exclude it
                }
            }
            
            return true; // It is not trivial, we keep it
        });

        logger.debug(`Filtered out ${messages.length - messagesToKeep.length} trivial messages`);
        return messagesToKeep;
    }

    /**
     * Prepares the content items for an individual message
     * @param {Object} message - Message to prepare
     * @returns {Array} Array of content items
     * @private
     */
    static prepareMessageContentItems(message) {
        if (!message) return [{ type: "text", text: "No content" }];
        
        // If the message has no content, use an informative text
        if (!message.content) {
            return [{ type: "text", text: "No content" }];
        }
        
        // If the content is already in array format, validate each element
        if (Array.isArray(message.content)) {
            // IMPROVED: Filter valid elements more strictly
            const validContent = message.content
                .map(item => {
                    // For images, verify that the URL exists and is not empty
                    if (item.type === 'image_url' && 
                        item.image_url?.url !== undefined && 
                        typeof item.image_url.url === 'string' && 
                        item.image_url.url.trim() !== '') {
                        return item;
                    }
                    
                    // For text, verify that the text is not empty
                    if (item.type === 'text' && 
                        typeof item.text === 'string' && 
                        item.text.trim() !== '') {
                        return item;
                    }
                    
                    // discard everything else
                    return null;
                })
                .filter(item => item !== null);
            
            // IMPROVED: If no valid elements remain, return a default text
            return validContent.length ? validContent : [{ type: "text", text: "No valid content" }];
        }
        
        // For content of type string, convert to the appropriate format
        if (typeof message.content === 'string') {
            const trimmedText = message.content.trim();
            return [{
                type: "text",
                text: trimmedText || "No content" // Empty text replaced
            }];
        }
        
        // For content object with text and media
        if (typeof message.content === 'object' && message.content !== null) {
            const contentArray = [];
            
            // Add text content if available and valid
            if (message.content.text && typeof message.content.text === 'string' && message.content.text.trim() !== '') {
                contentArray.push({
                    type: "text",
                    text: message.content.text.trim()
                });
            }
            
            // Add images if available
            if (message.content.imageUrls && Array.isArray(message.content.imageUrls)) {
                // IMPROVED: Filter empty or invalid URLs
                message.content.imageUrls
                    .filter(url => url && typeof url === 'string' && url.trim() !== '')
                    .forEach(imageUrl => {
                        contentArray.push({
                            type: "image_url",
                            image_url: { url: imageUrl }
                        });
                    });
            }
            
            // Support for media.images from enhanced message structure
            if (message.content.media && Array.isArray(message.content.media.images)) {
                // IMPROVED: Filter images without URL or with empty URL
                message.content.media.images
                    .filter(image => image && image.url && typeof image.url === 'string' && image.url.trim() !== '')
                    .forEach(image => {
                        contentArray.push({
                            type: "image_url",
                            image_url: { url: image.url }
                        });
                    });
            }
            
            // IMPROVED: If there is no valid content, add a default text
            // and ensure that there is always at least one element of type text
            if (contentArray.length === 0) {
                contentArray.push({
                    type: "text",
                    text: "No valid content"
                });
            } else if (!contentArray.some(item => item.type === 'text')) {
                // If there are only images, add a descriptive text
                contentArray.unshift({
                    type: "text",
                    text: "Multimedia content:"
                });
            }
            
            return contentArray;
        }
        
        // Fallback for unexpected formats
        return [{
            type: "text",
            text: "Unrecognized content"
        }];
    }

    /**
     * Organizes messages into user and assistant categories and ensures chronological order
     * @param {Array} messages - List of messages
     * @returns {Array} Messages organized by chronological order with appropriate roles
     */
    static organizeMessagesByRole(messages) {
        if (!Array.isArray(messages) || messages.length === 0) {
            return [];
        }
        
        try {
            // Make a copy of messages to avoid modifying the original
            const sortedMessages = [...messages];
            
            // Sort messages chronologically by timestamp if it exists
            sortedMessages.sort((a, b) => {
                // If both have timestamp, use it to sort
                if (a.timestamp && b.timestamp) {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                }
                // If only one has timestamp, put it first
                else if (a.timestamp) return -1;
                else if (b.timestamp) return 1;
                
                // If they have sequential id (like msg_chat_1, msg_chat_2)
                if (a.id && b.id && a.id.includes('_') && b.id.includes('_')) {
                    const aNum = parseInt(a.id.split('_').pop());
                    const bNum = parseInt(b.id.split('_').pop());
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return aNum - bNum;
                    }
                }
                
                // Default: keep the original order (which is usually chronological)
                return 0;
            });
            
            // Assign appropriate roles according to the sentByUs flag
            for (let i = 0; i < sortedMessages.length; i++) {
                const message = sortedMessages[i];
                
                // Ensure that each message has content
                if (!message.content) {
                    message.content = { text: "" };
                }
                // If the content is a direct string, convert it to an object
                else if (typeof message.content === 'string') {
                    message.content = { text: message.content };
                }
                
                // Assign the correct role according to who sent it
                // CORRECTION: The logic must be:
                // - If it was sent by us (sentByUs=true), then it is the assistant
                // - If it was sent by the other (sentByUs=false), then it is the user
                if (typeof message.sentByUs === 'boolean') {
                    message.role = message.sentByUs ? "assistant" : "user";
                } else if (!message.role || !["user", "assistant", "system"].includes(message.role)) {
                    // If there is no information about who sent it and it does not have a valid role,
                    // assign a role based on alternation
                    // We assume that the first message is always from the user
                    message.role = (i % 2 === 0) ? "user" : "assistant";
                }
            }
            
            logger.debug(`Messages organized: ${sortedMessages.length} messages with proper roles`);
            return sortedMessages;
        } catch (error) {
            logger.error(`Error organizing messages: ${error.message}`);
            return [...messages]; // Return a copy of the original messages without changes
        }
    }
    /**
        * Filters problematic image URLs (small, thumbnails, etc.)
        * @param {Array<string>} urls - Array of image URLs
        * @returns {Array<string>} Filtered URLs
        */
        static filterProblemImageUrls(urls) {
           // Use the centralized filter if available
           if (window.ImageFilterUtils) {
              return window.ImageFilterUtils.filterImageUrls(urls);
           }
           
           // Use original implementation as fallback
           if (!Array.isArray(urls)) return [];
           
           return urls.filter(url => {
              if (!url || typeof url !== 'string') return false;
              
              // Check if it is a Facebook URL
              const isFacebookUrl = url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('fbsbx.com');
              
              if (isFacebookUrl) {
                 // Filter thumbnails and other small images
                 const isSmallImage = url.includes('s50x50') || url.includes('_t.') || 
                                 url.includes('_s.') || url.includes('p50x50') ||
                                 url.includes('_xs') || url.includes('_xxs');
                                           
                 // Filter avatar/profile images
                 const isProfileImage = url.includes('/profile/') || url.includes('profile-pic') || 
                                  url.includes('profile_pic') || url.includes('/avatar/');
                                  
                 return !(isSmallImage || isProfileImage);
              }
              
              return true;
           });
    }
}

// Export globally
window.MessageUtils = MessageUtils;
