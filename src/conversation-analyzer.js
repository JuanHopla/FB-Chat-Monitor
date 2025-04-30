/**
 * Conversation Analyzer - Module for analyzing and extracting information from conversations
 * Provides tools to enhance response contextualization
 */

class ConversationAnalyzer {
  constructor() {
    // Keywords for detecting intents
    this.intentKeywords = {
      price: ['precio', 'cuánto', 'cuesta', 'vale', 'price', 'cost', 'how much'],
      availability: ['disponible', 'tienes', 'tiene', 'hay', 'available', 'have'],
      shipping: ['envío', 'enviar', 'mandar', 'shipping', 'send', 'deliver'],
      condition: ['estado', 'condición', 'funciona', 'condition', 'working', 'status'],
      negotiation: ['menos', 'descuento', 'rebajar', 'ofrezco', 'discount', 'offer', 'lower', 'cheap'],
      meetup: ['reunir', 'encontrar', 'verse', 'quedar', 'meet', 'pickup', 'collect'],
      urgency: ['urgente', 'pronto', 'rápido', 'hoy', 'mañana', 'urgent', 'soon', 'today', 'tomorrow']
    };
    
    // Common phrases for detecting greetings and farewells
    this.commonPhrases = {
      greetings: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hello', 'hi', 'hey', 'good morning', 'good afternoon'],
      farewells: ['adiós', 'hasta luego', 'nos vemos', 'chao', 'bye', 'see you', 'goodbye', 'later'],
      thanks: ['gracias', 'thank you', 'thanks', 'thx', 'ty']
    };
    
    logger.debug('Conversation Analyzer initialized');
  }

  /**
   * Analyze a conversation and extract relevant contextual information
   * @param {Array} messages - List of messages
   * @param {Object} productDetails - Product details (optional)
   * @returns {Object} Conversation analysis
   */
  analyzeConversation(messages, productDetails = null) {
    // If no messages, return empty analysis
    if (!messages || messages.length === 0) {
      logger.debug('No messages to analyze');
      return {
        intents: {},
        sentiment: 'neutral',
        language: 'unknown',
        productReferences: false,
        stage: 'initial'
      };
    }
    
    // Extract only text from messages
    const textMessages = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { text: msg.content, isSentByYou: msg.sentByUs || msg.isSentByYou };
      } else if (msg.content && msg.content.text) {
        return { text: msg.content.text, isSentByYou: msg.sentByUs || msg.isSentByYou };
      }
      return { text: '', isSentByYou: false };
    });
    
    // Detect intents
    const intents = this.detectIntents(textMessages);
    
    // Detect conversation stage
    const stage = this.detectConversationStage(textMessages);
    
    // Detect language
    const language = this.detectLanguage(textMessages);
    
    // Analyze sentiment
    const sentiment = this.detectSentiment(textMessages);
    
    // Detect if there's reference to the product
    const productReferences = productDetails ? 
      this.detectProductReferences(textMessages, productDetails) : false;
    
    const analysis = {
      intents,
      sentiment,
      language,
      productReferences,
      stage
    };
    
    logger.debug(`Analysis complete: ${JSON.stringify(analysis)}`);
    return analysis;
  }

  /**
   * Detect main intents in messages
   */
  detectIntents(messages) {
    const intentScores = {};
    
    // Initialize scores
    Object.keys(this.intentKeywords).forEach(intent => {
      intentScores[intent] = 0;
    });
    
    // Analyze recent messages (maximum 5)
    const recentMessages = messages.slice(-5);
    
    for (const message of recentMessages) {
      const text = message.text.toLowerCase();
      
      // Look for intent keywords
      for (const [intent, keywords] of Object.entries(this.intentKeywords)) {
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            // Increase score, giving more weight to recent messages
            intentScores[intent] += message.isSentByYou ? 0.5 : 1;
          }
        }
      }
    }
    
    // Normalize scores
    const totalScore = Object.values(intentScores).reduce((sum, score) => sum + score, 0);
    const normalizedScores = {};
    
    if (totalScore > 0) {
      for (const [intent, score] of Object.entries(intentScores)) {
        normalizedScores[intent] = score / totalScore;
      }
    }
    
    // Find dominant intents (score > 0.2)
    const dominantIntents = {};
    for (const [intent, score] of Object.entries(normalizedScores)) {
      if (score > 0.2) {
        dominantIntents[intent] = score;
      }
    }
    
    return dominantIntents;
  }

  /**
   * Detect conversation stage
   */
  detectConversationStage(messages) {
    if (messages.length <= 1) {
      return 'initial';
    }
    
    const lastMessage = messages[messages.length - 1];
    const lastFewMessages = messages.slice(-3);
    
    // Check for farewell messages
    const hasFarewellMessages = lastFewMessages.some(msg => 
      this.commonPhrases.farewells.some(phrase => 
        msg.text.toLowerCase().includes(phrase)
      )
    );
    
    if (hasFarewellMessages) {
      return 'closing';
    }
    
    // Check for shipping/delivery questions
    const hasShippingQuestions = lastFewMessages.some(msg => 
      this.intentKeywords.shipping.some(keyword => 
        msg.text.toLowerCase().includes(keyword)
      )
    );
    
    if (hasShippingQuestions) {
      return 'logistics';
    }
    
    // Check for negotiation
    const hasNegotiation = lastFewMessages.some(msg => 
      this.intentKeywords.negotiation.some(keyword => 
        msg.text.toLowerCase().includes(keyword)
      )
    );
    
    if (hasNegotiation) {
      return 'negotiation';
    }
    
    // Check for initial questions
    if (messages.length < 5) {
      // Check for greetings
      const hasGreetings = lastFewMessages.some(msg => 
        this.commonPhrases.greetings.some(greeting => 
          msg.text.toLowerCase().includes(greeting)
        )
      );
      
      if (hasGreetings) {
        return 'greeting';
      }
      
      return 'inquiry';
    }
    
    return 'discussion';
  }

  /**
   * Detect predominant language (basic)
   */
  detectLanguage(messages) {
    // Count Spanish vs English characters
    let spanishCharCount = 0;
    let englishWordCount = 0;
    
    // Specific words to identify language
    const spanishWords = ['el', 'la', 'los', 'las', 'es', 'son', 'de', 'para', 'con', 'por', 'que', 'este', 'esta', 'estos', 'estas'];
    const englishWords = ['the', 'is', 'are', 'of', 'for', 'with', 'by', 'that', 'this', 'these', 'those', 'it', 'they', 'we', 'you'];
    
    // Spanish-specific characters
    const spanishChars = 'áéíóúüñ¿¡';
    
    // Count in the last 5 messages
    const recentMessages = messages.slice(-5);
    
    for (const message of recentMessages) {
      const text = message.text.toLowerCase();
      
      // Count Spanish characters
      for (const char of text) {
        if (spanishChars.includes(char)) {
          spanishCharCount++;
        }
      }
      
      // Count specific words
      const words = text.split(/\s+/);
      for (const word of words) {
        if (spanishWords.includes(word)) {
          spanishCharCount += 2;
        }
        if (englishWords.includes(word)) {
          englishWordCount += 2;
        }
      }
    }
    
    // Determine language based on counts
    if (spanishCharCount > englishWordCount) {
      return 'es';
    } else if (englishWordCount > 0) {
      return 'en';
    }
    
    return 'unknown';
  }

  /**
   * Detect general sentiment (basic)
   */
  detectSentiment(messages) {
    // Positive and negative words
    const positiveWords = ['gracias', 'thanks', 'genial', 'great', 'perfecto', 'perfect', 'bueno', 'good', 'excelente', 'excellent', 'me gusta', 'like'];
    const negativeWords = ['problema', 'problem', 'malo', 'bad', 'error', 'fallo', 'fail', 'caro', 'expensive', 'tarde', 'late'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    // Analyze recent messages (maximum 5)
    const recentMessages = messages.slice(-5);
    
    for (const message of recentMessages) {
      if (message.isSentByYou) continue; // Only analyze contact's messages
      
      const text = message.text.toLowerCase();
      
      // Count positive/negative words
      for (const word of positiveWords) {
        if (text.includes(word)) {
          positiveCount++;
        }
      }
      
      for (const word of negativeWords) {
        if (text.includes(word)) {
          negativeCount++;
        }
      }
      
      // Detect positive/negative emojis
      if (/😊|😁|😄|👍|❤️|💯/u.test(text)) {
        positiveCount += 2;
      }
      
      if (/😠|😡|👎|😞|😔|😕/u.test(text)) {
        negativeCount += 2;
      }
    }
    
    // Determine sentiment
    if (positiveCount > negativeCount + 1) {
      return 'positive';
    } else if (negativeCount > positiveCount + 1) {
      return 'negative';
    }
    
    return 'neutral';
  }

  /**
   * Detect if messages reference the product
   */
  detectProductReferences(messages, productDetails) {
    if (!productDetails || !productDetails.title) {
      return false;
    }
    
    // Extract keywords from product title (words > 3 characters)
    const productWords = productDetails.title
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // If price is available, add as keyword
    let priceValue = '';
    if (productDetails.price) {
      priceValue = productDetails.price.replace(/[^\d.,]/g, '');
    }
    
    // Analyze recent messages (maximum 3)
    const recentMessages = messages.slice(-3);
    
    for (const message of recentMessages) {
      if (message.isSentByYou) continue; // Only analyze contact's messages
      
      const text = message.text.toLowerCase();
      
      // Check if price is mentioned
      if (priceValue && text.includes(priceValue)) {
        return true;
      }
      
      // Check if product keywords are mentioned
      let matchCount = 0;
      for (const word of productWords) {
        if (text.includes(word)) {
          matchCount++;
        }
      }
      
      // If at least 2 keywords are mentioned, consider it a reference
      if (matchCount >= 2) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate response suggestions based on analysis
   */
  generateResponseSuggestions(analysis, productDetails = null) {
    const suggestions = [];
    const language = analysis.language;
    
    // Suggestions based on conversation stage
    switch (analysis.stage) {
      case 'initial':
      case 'greeting':
        if (language === 'es') {
          suggestions.push('¡Hola! Gracias por contactar. ¿En qué puedo ayudarte?');
          suggestions.push('¡Hola! Cuéntame, ¿qué te interesa saber?');
        } else {
          suggestions.push('Hello! Thanks for reaching out. How can I help you?');
          suggestions.push('Hi there! What would you like to know?');
        }
        break;
        
      case 'inquiry':
        if (productDetails && productDetails.title) {
          if (language === 'es') {
            suggestions.push(`Claro, te cuento más sobre ${productDetails.title}. ¿Qué quieres saber?`);
          } else {
            suggestions.push(`Sure, let me tell you more about the ${productDetails.title}. What would you like to know?`);
          }
        } else {
          if (language === 'es') {
            suggestions.push('¿Qué información necesitas? Estoy para ayudarte.');
          } else {
            suggestions.push('What information do you need? I\'m here to help.');
          }
        }
        break;
        
      case 'negotiation':
        if (productDetails && productDetails.price) {
          if (language === 'es') {
            suggestions.push(`El precio es ${productDetails.price} y es bastante justo por las características.`);
            suggestions.push(`Podría considerar una oferta razonable. ¿Qué tienes en mente?`);
          } else {
            suggestions.push(`The price is ${productDetails.price} which is quite fair for the features.`);
            suggestions.push(`I could consider a reasonable offer. What do you have in mind?`);
          }
        } else {
          if (language === 'es') {
            suggestions.push('Estoy abierto a negociar un precio justo para ambos.');
          } else {
            suggestions.push('I\'m open to negotiating a fair price for both of us.');
          }
        }
        break;
        
      case 'logistics':
        if (language === 'es') {
          suggestions.push('Podemos coordinar la entrega según lo que te resulte más conveniente.');
          suggestions.push('Puedo hacer envío o también coordinar un punto de encuentro.');
        } else {
          suggestions.push('We can arrange delivery in whatever way is most convenient for you.');
          suggestions.push('I can ship it or we can arrange a meeting point.');
        }
        break;
        
      case 'closing':
        if (language === 'es') {
          suggestions.push('¡Perfecto! Cualquier duda adicional me avisas.');
          suggestions.push('¡Gracias por tu interés! Estamos en contacto.');
        } else {
          suggestions.push('Perfect! Let me know if you have any other questions.');
          suggestions.push('Thank you for your interest! We\'ll be in touch.');
        }
        break;
        
      default:
        if (language === 'es') {
          suggestions.push('Estoy aquí para resolver cualquier duda que tengas.');
        } else {
          suggestions.push('I\'m here to answer any questions you might have.');
        }
    }
    
    logger.debug(`Generated ${suggestions.length} suggestions based on analysis`);
    return suggestions;
  }
}

// Create the instance and assign it to the global context
const conversationAnalyzer = new ConversationAnalyzer();
// only one global instance:
window.conversationAnalyzer = conversationAnalyzer;
