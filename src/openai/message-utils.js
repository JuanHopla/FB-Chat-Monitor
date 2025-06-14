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
            // Organizes messages chronologically and assigns correct roles
            const formattedMessages = this.organizeMessagesByRole(context.messages);

            // Adds product details as the first message
            if (context.productDetails) {
                // Create content array for multimodal format
                const productContent = [];
                
                // Build a plain text with all relevant properties
                let productDetailsText = "PRODUCT DETAILS:\n";
                
                // Exclude images and properties that we don't want in the text
                const excludeFromText = [
                    'images', 'image', 'imageUrls', 'allImages', 'sellerProfilePic'
                ];
                
                // Generate text with the basic fields first if they exist
                const basicFields = ['categoryName', 'title', 'price', 'condition', 'description', 'url'];
                
                for (const field of basicFields) {
                    if (context.productDetails[field]) {
                        // Capitalize the first letter of the field
                        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
                        productDetailsText += `${fieldName}: ${context.productDetails[field]}\n`;
                    }
                }
                
                // Add any other field that is not in the basic or excluded fields
                for (const [key, value] of Object.entries(context.productDetails)) {
                    if (!basicFields.includes(key) && !excludeFromText.includes(key) && value !== undefined && value !== null) {
                        // Capitalize the first letter of the field
                        const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                        productDetailsText += `${fieldName}: ${value}\n`;
                    }
                }

                // Add to product content
                productContent.push({ type: "text", text: productDetailsText.trim() });

                // Add product images (only from allImages, not the seller's profile)
                if (Array.isArray(context.productDetails.allImages) && context.productDetails.allImages.length > 0) {
                    // Validate images before including them
                    const validItems = [];
                    for (const imgUrl of context.productDetails.allImages.slice(0, 6)) { // Limit to 6 images
                        try {
                            const resp = await fetch(imgUrl, { method: 'HEAD' });
                            if (resp.ok) {
                                validItems.push({ 
                                    type: "image_url", 
                                    image_url: { url: imgUrl } 
                                });
                            }
                        } catch { /* omit errors */ }
                    }
                    
                    // Add validated images to content
                    if (validItems.length > 0) {
                        productContent.push(...validItems);
                    }
                }

                // Insert the product message at the beginning of the conversation
                formattedMessages.unshift({
                    role: "user",
                    content: productContent
                });
            }

            // Convert message objects to the appropriate format for the API with validation
            const finalMessages = formattedMessages.map((message, index) => {
                // If the message has no content, use a default empty text message
                if (!message.content) {
                    logger.debug(`Message #${index} has no content. Using default empty text.`);
                    return {
                        role: message.role || "user",
                        content: [{ type: "text", text: " " }] // Space as minimum valid content
                    };
                }

                // Ensure that the message has a valid role
                if (!message.role || !["user", "assistant", "system"].includes(message.role)) {
                    message.role = "user"; // Default to user if the role is invalid
                }

                // If the content is already in array format, validate each element
                if (Array.isArray(message.content)) {
                    const validContent = message.content
                        .map(item => {
                            // PASSTHROUGH for images
                            if (item.type === 'image_url' && item.image_url?.url !== undefined) {
                                return item;
                            }
                            // Keep texts
                            if (item.type === 'text' && typeof item.text === 'string') {
                                return item;
                            }
                            // discard everything else
                            return null;
                        })
                        .filter(item => item !== null);

                    return {
                        role: message.role,
                        content: validContent.length ? validContent : [{ type: "text", text: " " }]
                    };
                }
                
                // For content of type string, convert to appropriate format
                if (typeof message.content === 'string') {
                    return {
                        role: message.role,
                        content: [{
                            type: "text",
                            text: message.content || " " // Use space if empty
                        }]
                    };
                }
                
                // For content object with text and media
                if (typeof message.content === 'object' && message.content !== null) {
                    const contentArray = [];
                    
                    // Add text content if available and valid
                    if (message.content.text && typeof message.content.text === 'string') {
                        contentArray.push({
                            type: "text",
                            text: message.content.text.trim() || " " // Space as fallback
                        });
                    }
                    
                    // Add images if available and not skipped
                    if (message.content.imageUrls && Array.isArray(message.content.imageUrls)) {
                        message.content.imageUrls.forEach(imageUrl => {
                            if (imageUrl && typeof imageUrl === 'string') {
                                contentArray.push({
                                    type: "image_url",
                                    image_url: {
                                        url: imageUrl
                                    }
                                });
                            }
                        });
                    }
                    
                    // Ensure we have at least one valid content element
                    if (contentArray.length === 0) {
                        contentArray.push({
                            type: "text",
                            text: " " // Space as minimum valid content
                        });
                    }
                    
                    return {
                        role: message.role,
                        content: contentArray
                    };
                }
                
                // Fallback for unexpected formats
                return {
                    role: message.role,
                    content: [{
                        type: "text",
                        text: " " // Space as minimum valid content
                    }]
                };
            });

            // Final validation to register potential problems
            finalMessages.forEach((msg, index) => {
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
            logger.debug('2. Messages:', JSON.stringify(finalMessages));
            console.log('OPENAI_PAYLOAD →', finalMessages);
            
            return finalMessages;
        } catch (error) {
            logger.error(`Error preparing message content: ${error.message}`, {}, error);
            return [];
        }
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
