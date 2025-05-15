/**
 * FB Chat Monitor - Main entry point
 * This file imports all modules in the correct order to build the application
 */

// Import modules in the order they should be initialized
import './config.js';                  // Configuration first
import './utils.js';                   // Utility functions
import './conversation-analyzer.js';   // Conversation analysis
import './responseManager.js';         // Response management
import './human-simulator.js';         // Human behavior simulation
import './product-extractor.js';       // Product information extraction
import './openai-manager.js';          // OpenAI integration
import './assistant-manager-ui.js';    // Assistant management UI
import './ChatManager.js';             // Chat management
import './marketplace.js';             // Marketplace redirection
import './ui.js';                      // User interface components
import './main.js';                    // Main process
import './init.js';                    // Initialization
import './entry.js';                   // Entry point execution
