// ----- FACEBOOK PRODUCT EXTRACTION -----

/**
 * Product Extractor - Handles extraction of product details from Facebook Marketplace
 * Uses Facebook's internal GraphQL API to extract comprehensive product data
 */
class ProductExtractor {
  constructor() {
    // Use CONFIG for cache settings instead of hardcoded values
    this.productCache = new Map();
    this.cacheTTL = CONFIG.product?.cacheTTL || 24 * 60 * 60 * 1000; // Default 24h if not in config
    
    // GraphQL query document IDs - could also come from config
    this.docIds = CONFIG.graphQL?.docIds || {
      productDetails: '5531412743583276',
      productImages: '7129541003741089',
      sellerInfo: '6218156281622605'
    };
    
    // Statistics
    this.stats = {
      totalExtracted: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiErrors: 0
    };
    
    // Load cache from localStorage if available
    this.loadCache();
    
    // Use CONFIG for cleanup interval timing
    const cleanupInterval = CONFIG.product?.cleanupInterval || 60 * 60 * 1000; // Default 1h
    setInterval(() => this.cleanupCache(), cleanupInterval);
  }
  
  /**
   * Extract product ID from current chat/conversation
   * @returns {String|null} Product ID or null if not found
   */
  extractProductIdFromCurrentChat() {
    try {
      logger.debug('Attempting to extract product ID from current chat');
      
      // Method 1: Look for product links in the page
      const productLinks = document.querySelectorAll('a[href*="/marketplace/item/"]');
      if (productLinks.length > 0) {
        for (const link of productLinks) {
          const match = link.href.match(/\/marketplace\/item\/(\d+)/);
          if (match && match[1]) {
            logger.debug(`Found product ID ${match[1]} from link`);
            return match[1];
          }
        }
      }
      
      // Method 2: Look for data attributes that may contain product ID
      const elements = document.querySelectorAll('[data-marketplace-id], [data-ft*="mf_story_key"]');
      for (const element of elements) {
        // Try data-marketplace-id attribute
        const marketplaceId = element.getAttribute('data-marketplace-id');
        if (marketplaceId) {
          logger.debug(`Found product ID ${marketplaceId} from data-marketplace-id`);
          return marketplaceId;
        }
        
        // Try data-ft attribute which may contain product info in JSON
        const dataFt = element.getAttribute('data-ft');
        if (dataFt) {
          try {
            const ftData = JSON.parse(dataFt);
            if (ftData.mf_story_key) {
              logger.debug(`Found product ID ${ftData.mf_story_key} from data-ft`);
              return ftData.mf_story_key;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      // Method 3: Look for product ID in the URL
      const urlMatch = window.location.href.match(/\/marketplace\/item\/(\d+)/);
      if (urlMatch && urlMatch[1]) {
        logger.debug(`Found product ID ${urlMatch[1]} from URL`);
        return urlMatch[1];
      }
      
      // Method 4: Look for meta tags that might contain product info
      const metaTags = document.querySelectorAll('meta[property^="og:"]');
      for (const tag of metaTags) {
        const content = tag.getAttribute('content') || '';
        if (content.includes('/marketplace/item/')) {
          const metaMatch = content.match(/\/marketplace\/item\/(\d+)/);
          if (metaMatch && metaMatch[1]) {
            logger.debug(`Found product ID ${metaMatch[1]} from meta tag`);
            return metaMatch[1];
          }
        }
      }
      
      logger.debug('No product ID found in current chat');
      return null;
    } catch (error) {
      logger.error(`Error extracting product ID: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get detailed product information using GraphQL API
   * @param {String} productId - The product ID
   * @returns {Promise<Object|null>} Product details or null if not found
   */
  async getProductDetails(productId) {
    try {
      if (!productId) {
        logger.error('Cannot get product details: No product ID provided');
        return null;
      }
      
      logger.debug(`Getting product details for ID: ${productId}`);
      
      // Check cache first
      if (this.productCache.has(productId)) {
        const cachedProduct = this.productCache.get(productId);
        // Check if cache is still valid
        if (Date.now() - cachedProduct.timestamp < this.cacheTTL) {
          logger.debug(`Product cache hit for ID: ${productId}`);
          this.stats.cacheHits++;
          return cachedProduct.data;
        } else {
          logger.debug(`Product cache expired for ID: ${productId}`);
          this.productCache.delete(productId);
        }
      }
      
      this.stats.cacheMisses++;
      
      // Fetch product details using GraphQL
      const productDetails = await this.fetchProductDetailsFromGraphQL(productId);
      if (!productDetails) {
        logger.error(`Failed to fetch product details for ID: ${productId}`);
        return null;
      }
      
      // Fetch additional high-res images if needed
      if (productDetails.imageUrls && productDetails.imageUrls.length > 0) {
        try {
          const highResImages = await this.fetchHighResImages(productId);
          if (highResImages && highResImages.length > 0) {
            productDetails.highResImageUrls = highResImages;
          }
        } catch (imageError) {
          logger.warn(`Could not fetch high-res images: ${imageError.message}`);
        }
      }
      
      // Cache the product
      this.cacheProduct(productId, productDetails);
      
      // Update stats
      this.stats.totalExtracted++;
      
      return productDetails;
    } catch (error) {
      this.stats.apiErrors++;
      logger.error(`Error getting product details: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Fetch product details using Facebook's GraphQL API
   * @param {String} productId - The product ID
   * @returns {Promise<Object|null>} Product details
   */
  async fetchProductDetailsFromGraphQL(productId) {
    try {
      logger.debug(`Fetching GraphQL data for product ID: ${productId}`);
      
      // Prepare GraphQL request
      const variables = {
        targetId: productId,
        scale: 3,
        environmentInfo: { isFullscreenModal: false }
      };
      
      // Create form data for the request
      const formData = new URLSearchParams();
      formData.append('variables', JSON.stringify(variables));
      formData.append('doc_id', this.docIds.productDetails);
      
      // Make the request
      const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`GraphQL request failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Check for errors in the response
      if (result.errors) {
        throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
      }
      
      // Extract product data
      return this.parseProductData(result.data);
    } catch (error) {
      logger.error(`GraphQL request failed: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Parse product data from GraphQL response
   * @param {Object} data - GraphQL response data
   * @returns {Object} Parsed product details
   */
  parseProductData(data) {
    if (!data || !data.marketplace_product_details) {
      throw new Error('Invalid product data structure');
    }
    
    const product = data.marketplace_product_details;
    
    // Extract basic product details
    const productDetails = {
      id: product.id,
      title: product.marketplace_listing_title || '',
      price: product.listing_price?.formatted_amount || '',
      description: product.description || '',
      condition: product.condition || '',
      location: product.location?.reverse_geocode?.city || '',
      category: product.primary_listing_category?.name || '',
      createdTime: product.creation_time || 0,
      updatedTime: product.updated_time || 0,
      url: `https://www.facebook.com/marketplace/item/${product.id}/`,
      availability: product.availability_status || 'available',
      currency: product.listing_price?.currency || 'USD'
    };
    
    // Extract seller information
    if (product.marketplace_listing_seller) {
      productDetails.seller = {
        id: product.marketplace_listing_seller.id || '',
        name: product.marketplace_listing_seller.name || '',
        profileUrl: product.marketplace_listing_seller.url || '',
        profilePicture: product.marketplace_listing_seller.profile_picture?.uri || '',
        verified: !!product.marketplace_listing_seller.is_verified
      };
    }
    
    // Extract images
    productDetails.imageUrls = [];
    if (product.listing_photos && product.listing_photos.length > 0) {
      productDetails.imageUrls = product.listing_photos
        .map(photo => photo.image?.uri)
        .filter(uri => !!uri);
    }
    
    // Extract additional attributes
    productDetails.attributes = {};
    if (product.custom_attributes && product.custom_attributes.length > 0) {
      product.custom_attributes.forEach(attr => {
        if (attr.name && attr.value) {
          productDetails.attributes[attr.name] = attr.value;
        }
      });
    }
    
    return productDetails;
  }
  
  /**
   * Fetch high-resolution images for a product
   * @param {String} productId - The product ID
   * @returns {Promise<Array<String>>} Array of high-res image URLs
   */
  async fetchHighResImages(productId) {
    try {
      // Prepare GraphQL request for high-res images
      const variables = {
        targetId: productId,
        scale: 6 // Request higher scale for better resolution
      };
      
      // Create form data for the request
      const formData = new URLSearchParams();
      formData.append('variables', JSON.stringify(variables));
      formData.append('doc_id', this.docIds.productImages);
      
      // Make the request
      const response = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Image request failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Extract image URLs
      if (result.data && result.data.node && result.data.node.listing_photos) {
        return result.data.node.listing_photos
          .map(photo => photo.image?.uri)
          .filter(uri => !!uri);
      }
      
      return [];
    } catch (error) {
      logger.warn(`Failed to fetch high-res images: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Cache a product for future reference
   * @param {String} productId - The product ID
   * @param {Object} productData - The product data
   */
  cacheProduct(productId, productData) {
    this.productCache.set(productId, {
      data: productData,
      timestamp: Date.now()
    });
    
    // Save to localStorage (with size limit)
    this.saveCache();
    
    logger.debug(`Product ${productId} cached`);
  }
  
  /**
   * Clean up expired entries from cache
   */
  cleanupCache() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [productId, entry] of this.productCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.productCache.delete(productId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.debug(`Cleaned up ${removedCount} expired product cache entries`);
      this.saveCache();
    }
  }
  
  /**
   * Load product cache from localStorage
   */
  loadCache() {
    try {
      const cachedData = localStorage.getItem('FB_CHAT_MONITOR_PRODUCT_CACHE');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        Object.entries(parsed).forEach(([id, entry]) => {
          this.productCache.set(id, entry);
        });
        logger.debug(`Loaded ${this.productCache.size} product cache entries from storage`);
      }
    } catch (error) {
      logger.error(`Failed to load product cache: ${error.message}`);
      // Initialize empty cache if load fails
      this.productCache = new Map();
    }
  }
  
  /**
   * Save product cache to localStorage
   */
  saveCache() {
    try {
      // Convert Map to object for storage
      const cacheObject = {};
      for (const [id, data] of this.productCache.entries()) {
        cacheObject[id] = data;
      }
      
      // Check size and trim if necessary (localStorage has ~5MB limit)
      const jsonData = JSON.stringify(cacheObject);
      if (jsonData.length > 4 * 1024 * 1024) { // 4MB limit
        logger.warn('Product cache exceeds 4MB, trimming older entries');
        this.trimCacheToFit(3 * 1024 * 1024); // Trim to 3MB
      } else {
        localStorage.setItem('FB_CHAT_MONITOR_PRODUCT_CACHE', jsonData);
        logger.debug(`Saved ${this.productCache.size} product cache entries to storage`);
      }
    } catch (error) {
      logger.error(`Failed to save product cache: ${error.message}`);
    }
  }
  
  /**
   * Trim cache to fit within size limit
   * @param {Number} maxSize - Maximum size in bytes
   */
  trimCacheToFit(maxSize) {
    // Convert entries to array and sort by timestamp (oldest first)
    const entries = Array.from(this.productCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Create new object and add entries until we reach the size limit
    const newCache = {};
    let currentSize = 0;
    let entriesAdded = 0;
    
    for (const [id, data] of entries) {
      const entrySize = JSON.stringify({[id]: data}).length;
      if (currentSize + entrySize <= maxSize) {
        newCache[id] = data;
        currentSize += entrySize;
        entriesAdded++;
      } else {
        this.productCache.delete(id);
      }
    }
    
    // Update the cache Map to match
    this.productCache = new Map(Object.entries(newCache));
    
    localStorage.setItem('FB_CHAT_MONITOR_PRODUCT_CACHE', JSON.stringify(newCache));
    logger.debug(`Trimmed cache to ${entriesAdded} entries (${Math.round(currentSize/1024)}KB)`);
  }
  
  /**
   * Get statistics about product extraction
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.productCache.size,
      cacheHitRate: this.stats.totalExtracted > 0 ? 
        Math.round(this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100) : 0
    };
  }
  
  /**
   * Clear product cache
   */
  clearCache() {
    this.productCache.clear();
    localStorage.removeItem('FB_CHAT_MONITOR_PRODUCT_CACHE');
    logger.log('Product cache cleared');
  }
}

// Create and export the Product Extractor instance
const productExtractor = new ProductExtractor();
// only one global instance:
window.productExtractor = productExtractor;
