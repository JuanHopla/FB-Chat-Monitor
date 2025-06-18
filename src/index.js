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

// OpenAI system components - critical load order (corrected)
import './openai/api-client.js';                 // API Client (FIRST)
import './openai/message-utils.js';              // Message utilities
import './openai/timestamp-utils.js';            // Timestamp utilities
import './openai/message-chunker.js';            // Message chunking for API limits
import './openai/thread-manager.js';             // Thread management (BEFORE thread-message-handler)
import './openai/thread-message-handler.js';     // Specific handler for messages by thread type
import './openai/chat-thread-system.js';         // Centralized thread system

import './openai-manager.js';          // OpenAI integration - AFTER components
import './assistant-manager-ui.js';    // Assistant management UI
import './chatManager.js';             // Chat management
import './marketplace.js';             // Marketplace redirection
import './ui.js';                      // User interface components
import './main.js';                    // Main process
import './init.js';                    // Initialization
import './entry.js';                   // Entry point execution
