# FB-Chat-Monitor

A Tampermonkey-based project that monitors and extracts chat data from Facebook Messenger and Facebook Marketplace in real-time using MutationObserver.

Project structure:
- main.user.js         // Main script with Tampermonkey metadata
- src/
   - config.js         // Constants and selectors
   - fbMarketplaceScraper.js // Facebook Marketplace specific scraping functions
   - messengerScraper.js // Messenger specific scraping functions  
   - observer.js       // Functions to initialize DOM observers
   - utils.js          // Helper functions
- build/
   - bundle.user.js    // (Optional) Generated bundle for installation

## Features
- Real-time chat monitoring and extraction
- Works with both Facebook Messenger and Facebook Marketplace
- Modular architecture for easy maintenance and extension
- Robust message sender detection
