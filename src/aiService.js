/**
 * Service for handling AI-powered chat responses
 * @module aiService
 */
import { CONFIG } from './config.js';
import { logInfo, logError } from './utils.js';

/**
 * Format conversation history for AI processing
 * @param {Array} messages - Array of message objects
 * @param {Object} productInfo - Product information context
 * @returns {Array} Formatted messages for API
 */
export function formatConversationForAI(messages, productInfo) {
  const systemPrompt = `You are an AI assistant helping a BUYER respond to messages on Facebook Marketplace.
${productInfo ? `You're interested in the product: ${productInfo.title || "Unknown product"}
${productInfo.context ? `Context about the product: ${productInfo.context}` : ""}` : ""}
Your role is to act as the BUYER, not the seller.
Keep your responses concise, friendly and helpful. Respond in the same language as the seller's message.
Remember you are inquiring about or purchasing the item, NOT selling it.`;

  // Start with system message
  const formattedMessages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  // Add conversation history
  messages.forEach(message => {
    formattedMessages.push({
      role: message.isSentByYou ? "assistant" : "user",
      content: message.content
    });
  });

  return formattedMessages;
}

/**
 * Generate a response using an AI API
 * @param {Array} conversationHistory - Array of message objects
 * @param {Object} productInfo - Product information object
 * @returns {Promise<string>} The AI-generated response
 */
export async function generateAIResponse(conversationHistory, productInfo) {
  try {
    if (!CONFIG.AI.apiKey || !CONFIG.AI.enabled) {
      logError('AI API key not configured or AI is disabled');
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }

    const messages = formatConversationForAI(conversationHistory, productInfo);
    
    logInfo('Requesting response from AI service...');
    
    const response = await fetch(CONFIG.AI.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.AI.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.AI.model,
        messages: messages,
        temperature: CONFIG.AI.temperature,
        max_tokens: CONFIG.AI.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logError(`AI service error: ${response.status} ${response.statusText}`);
      logError(`Error details: ${JSON.stringify(errorData)}`);
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      logError('Empty response from AI service');
      return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
    }
    
    return aiResponse;
    
  } catch (error) {
    logError(`Error generating AI response: ${error.message}`);
    return getDefaultResponse(conversationHistory[conversationHistory.length - 1].content);
  }
}

/**
 * Get a default response based on message content when AI fails
 * @param {string} message - The incoming message
 * @returns {string} A default response
 */
export function getDefaultResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || 
      lowerMessage.includes('hola')) {
    return 'Hello! Thanks for your message. How can I help you today?';
  }
  
  if (lowerMessage.includes('price') || lowerMessage.includes('precio')) {
    return 'The listed price is final. It includes shipping to anywhere in the country.';
  }
  
  if (lowerMessage.includes('available') || lowerMessage.includes('disponible')) {
    return 'Yes, the product is still available. Are you interested?';
  }
  
  return 'Thank you for your message. I will respond as soon as possible.';
}

/**
 * Configure AI settings
 * @param {Object} config - Configuration object with API key, model, etc.
 * @returns {Object} The updated AI config
 */
export function configureAI(config) {
  // Make sure we're referencing the global CONFIG object
  CONFIG.AI.apiKey = config.apiKey || CONFIG.AI.apiKey;
  CONFIG.AI.model = config.model || CONFIG.AI.model;
  CONFIG.AI.enabled = config.hasOwnProperty('enabled') ? config.enabled : !!CONFIG.AI.apiKey;
  CONFIG.AI.temperature = config.temperature || CONFIG.AI.temperature;
  CONFIG.AI.maxTokens = config.maxTokens || CONFIG.AI.maxTokens;
  
  logInfo(`AI configured with model: ${CONFIG.AI.model}, enabled: ${CONFIG.AI.enabled}`);
  return {...CONFIG.AI}; // Return a copy to avoid direct modification
}
