/**
 * Centralized utilities for filtering Facebook images
 * Provides functions to detect and filter problematic images
 * that may cause errors when processed by the OpenAI API
 */
class ImageFilterUtils {
  /**
   * Exhaustive set of patterns to detect problematic Facebook images
   * Includes all known format variants
   * @private
   */
  static problematicPatterns = [
    // Size patterns in URLs (variants with underscores)
    /_s\d+x\d+_/i,         // _s100x100_
    /_s\d+x\d+[_|-]/i,     // _s100x100_ or _s100x100-
    /_p\d+x\d+_/i,         // _p100x100_
    /_\d+x\d+_/i,          // _100x100_
    /stp=dst-jpg_s\d+x\d+/i, // stp=dst-jpg_s100x100 (common variant)
    /dst-jpg_s\d+x\d+/i,   // dst-jpg_s100x100 (another variant)
    
    // Size patterns in URLs (variants with slashes)
    /\/s\d+x\d+\//i,       // /s100x100/
    /\/p\d+x\d+\//i,       // /p100x100/
    /\/t\d+.\d+\//i,       // /t1.0/ (thumbnails)
    /\/t\d+\.\d+-\d+\//i,  // /t39.30808-1/ (profile avatar)
    /\/v\/t\d+\.\d+-\d+\//i, // /v/t39.30808-1/ (variant)
    
    // Thumbnail suffixes
    /_t\./i,               // _t. (thumbnail)
    /_s\./i,               // _s. (small)
    /_n\./i,               // _n. (normal)
    /_xs/i,                // _xs (extra small)
    /_xxs/i,               // _xxs (extra extra small)
    
    // Directories and keywords
    /\/profile\//i,        // /profile/ (profile folder)
    /profile[-_]pic/i,     // profile-pic or profile_pic
    /\/avatar\//i,         // /avatar/ (avatar folder)
    /\/scontent.*\/[st]\d+x\d+/i, // scontent with size pattern
    
    // Other thumbnail/avatar indicators
    /pp?\d+x\d+/i,         // p50x50, pp50x50
    /c\d+\.\d+\.\d+\.\d+/i // c4.5.65.65 (cropping format)
  ];
  
  /**
   * Detects problematic Facebook URLs based on all known patterns
   * @param {string} url - URL to check
   * @returns {boolean} - true if the URL is problematic, false if it seems safe
   */
  static isProblematicFacebookImage(url) {
    if (!url || typeof url !== 'string') {
      return true; // Empty or invalid URLs are considered problematic
    }
    
    // First detect if it is a Facebook URL
    const isFacebookUrl = url.includes('fbcdn.net') || 
                         url.includes('facebook.com') || 
                         url.includes('fbsbx.com');
    
    // If it is not a Facebook URL, it is generally safe
    if (!isFacebookUrl) {
      return false;
    }
    
    // Check against all known patterns
    return this.problematicPatterns.some(pattern => pattern.test(url));
  }
  
  /**
   * Applies deep filtering to any data structure to find and filter image URLs
   * @param {any} data - Data structure to process (can be object, array, etc.)
   * @param {Function} callback - Optional: function to call for each URL found and filtered
   * @returns {any} - Structure with problematic URLs filtered
   */
  static deepFilterImages(data, callback = null) {
    if (!data) return data;
    
    // Simple case: the input is a string URL
    if (typeof data === 'string' && this.looksLikeImageUrl(data)) {
      const isProblematic = this.isProblematicFacebookImage(data);
      if (isProblematic && callback) callback(data, true);
      return isProblematic ? null : data;
    }
    
    // For arrays, process each element
    if (Array.isArray(data)) {
      return data
        .map(item => this.deepFilterImages(item, callback))
        .filter(item => item !== null);
    }
    
    // For objects, process each property
    if (typeof data === 'object' && data !== null) {
      const result = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Detect and filter properties that appear to be images
        if (this.isImageProperty(key)) {
          if (typeof value === 'string' && this.isProblematicFacebookImage(value)) {
            // Report problematic image found
            if (callback) callback(value, true);
            // Do not include this property in the filtered result
            continue;
          }
        }
        
        // Recursively process all values
        result[key] = this.deepFilterImages(value, callback);
      }
      
      return result;
    }
    
    // For other data types, return unchanged
    return data;
  }
  
  /**
   * Detects if a property appears to contain an image by its name
   * @param {string} key - Property name
   * @returns {boolean} - true if it looks like an image property
   */
  static isImageProperty(key) {
    if (typeof key !== 'string') return false;
    
    const keyLower = key.toLowerCase();
    return keyLower === 'image' ||
           keyLower === 'img' ||
           keyLower === 'avatar' ||
           keyLower === 'photo' ||
           keyLower === 'picture' ||
           keyLower === 'thumbnail' ||
           keyLower === 'icon' ||
           keyLower === 'profilepic' ||
           keyLower === 'profileimage' ||
           keyLower === 'image_url' ||
           keyLower === 'imageurl' ||
           keyLower === 'url' && keyLower.includes('image') ||
           keyLower.includes('img') ||
           keyLower.includes('thumb') ||
           keyLower.includes('avatar') ||
           keyLower.includes('pic') ||
           keyLower.endsWith('src');
  }
  
  /**
   * Determines if a string appears to be an image URL
   * @param {string} url - URL to check
   * @returns {boolean} - true if it looks like an image URL
   */
  static looksLikeImageUrl(url) {
    if (typeof url !== 'string') return false;
    
    // Check if it is a URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    
    // Check common image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];
    if (imageExtensions.some(ext => url.toLowerCase().includes(ext))) {
      return true;
    }
    
    // Check Facebook image URL patterns
    if (url.includes('fbcdn.net') || url.includes('fbsbx.com')) {
      return true;
    }
    
    // Check common parameters in image URLs
    const imageParams = ['image', 'img', 'photo', 'picture', 'thumb', 'thumbnail'];
    if (imageParams.some(param => url.toLowerCase().includes(param))) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Checks if a Facebook image is accessible asynchronously
   * @param {string} url - Image URL
   * @returns {Promise<boolean>} - true if the image is accessible
   */
  static async isImageAccessible(url) {
    try {
      // If we already detected that it is problematic, do not do additional verification
      if (this.isProblematicFacebookImage(url)) {
        logger.debug(`Image automatically rejected by pattern: ${url}`);
        return false;
      }
      
      // Shorter timeout for Facebook URLs
      const isFacebookUrl = url.includes('fbcdn.net') || 
                          url.includes('facebook.com') || 
                          url.includes('fbsbx.com');
      const timeout = isFacebookUrl ? 2000 : 4000;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors'
        });
        clearTimeout(timeoutId);
        
        return response.type === 'opaque' || response.ok;
      } catch (error) {
        logger.debug(`Error checking image accessibility: ${error.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error in isImageAccessible: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Filters an array of image URLs, removing problematic ones
   * @param {Array<string>} urls - Array of image URLs
   * @returns {Array<string>} - Filtered array without problematic images
   */
  static filterImageUrls(urls) {
    if (!Array.isArray(urls)) return [];
    
    return urls.filter(url => {
      if (!url || typeof url !== 'string') return false;
      return !this.isProblematicFacebookImage(url);
    });
  }
  
  /**
   * Filters images in a message prepared for OpenAI
   * @param {Object} message - Message prepared for OpenAI
   * @returns {Object} - Message with filtered images
   */
  static filterImagesInOpenAIMessage(message) {
    if (!message || !message.content) return message;
    
    // If the content is an array, filter image_url elements
    if (Array.isArray(message.content)) {
      message.content = message.content.filter(item => {
        if (item.type === 'image_url' && item.image_url?.url) {
          const isProblematic = this.isProblematicFacebookImage(item.image_url.url);
          if (isProblematic) {
            logger.debug(`Removed problematic image from OpenAI message: ${item.image_url.url}`);
            return false;
          }
        }
        return true;
      });
      
      // Ensure there is at least one text element if there are elements left
      if (message.content.length > 0 && !message.content.some(item => item.type === 'text')) {
        message.content.unshift({
          type: "text",
          text: "Multimedia content (some images have been filtered):"
        });
      }
      // If it was empty, add an explanatory text
      else if (message.content.length === 0) {
        message.content.push({
          type: "text",
          text: "All images were filtered due to possible compatibility issues."
        });
      }
    }
    
    return message;
  }
  
  /**
   * Filters all problematic images in an array of messages for OpenAI
   * @param {Array} messages - Messages prepared for OpenAI
   * @returns {Array} - Messages with filtered images
   */
  static filterImagesInOpenAIMessages(messages) {
    if (!Array.isArray(messages)) return messages;
    return messages.map(msg => this.filterImagesInOpenAIMessage(msg));
  }
  
  /**
   * Checks and filters an image or returns null if it is problematic
   * @param {string} url - URL of the image to check
   * @returns {string|null} - Original URL if it is safe, null if it is problematic
   */
  static validateImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    return this.isProblematicFacebookImage(url) ? null : url;
  }
  
  /**
   * Preprocesses a product details object to filter problematic images
   * @param {Object} productDetails - Product details
   * @returns {Object} - Product details with filtered images
   */
  static preprocessProductDetails(productDetails) {
    if (!productDetails) return productDetails;
    
    // Create a copy to avoid modifying the original
    const filtered = { ...productDetails };
    
    // Filter all known image properties
    if (Array.isArray(filtered.images)) {
      filtered.images = this.filterImageUrls(filtered.images);
    }
    if (Array.isArray(filtered.allImages)) {
      filtered.allImages = this.filterImageUrls(filtered.allImages);
    }
    if (Array.isArray(filtered.imageUrls)) {
      filtered.imageUrls = this.filterImageUrls(filtered.imageUrls);
    }
    
    // Delete singular image properties
    if (filtered.Image && this.isProblematicFacebookImage(filtered.Image)) {
      delete filtered.Image;
    }
    if (filtered.image && this.isProblematicFacebookImage(filtered.image)) {
      delete filtered.image;
    }
    
    // Delete seller avatar
    if (filtered.sellerProfilePic && this.isProblematicFacebookImage(filtered.sellerProfilePic)) {
      delete filtered.sellerProfilePic;
    }
    
    return filtered;
  }
}

// Export globally
window.ImageFilterUtils = ImageFilterUtils;
