/**
 * Product Extractor Module
 *
 * Extracts detailed information from Facebook Marketplace products
 */

// Cache to store already extracted products and avoid repeated requests
const productCache = {};

// Load stored cache
(function loadCachedProducts() {
  try {
    const savedCache = storageUtils.get('PRODUCT_CACHE', {});
    Object.assign(productCache, savedCache);
    logger.debug(`Loaded ${Object.keys(productCache).length} cached products from storage`);
  } catch (error) {
    logger.error('Error loading product cache', error);
  }
})();

// Save cache periodically
setInterval(() => {
  try {
    storageUtils.set('PRODUCT_CACHE', productCache);
    logger.debug(`Saved ${Object.keys(productCache).length} product cache entries to storage`);
  } catch (error) {
    logger.error('Error saving product cache', error);
  }
}, 60000); // Every minute

/**
 * Extract product ID from URL
 * @param {string} url - Product URL
 * @returns {string|null} Product ID or null if not found
 */
function extractProductIdFromUrl(url) {
  try {
    if (!url) return null;

    // Try various URL patterns
    const patterns = [
      /marketplace\/item\/(\d+)/i,
      /marketplace\/item\.php\?id=(\d+)/i,
      /item\/(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  } catch (error) {
    logger.error('Error extracting product ID from URL', error);
    return null;
  }
}

/**
 * Extract product details from HTML using embedded JSON
 * @param {Document} doc - HTML Document
 * @param {string} originalUrl - Original product URL
 * @returns {Object|null} Product details or null if not found
 */
function extractFromInlineJson(doc, originalUrl) {
  logger.debug('[ProductExtractor] Extracting data from embedded JSON...');
  const scripts = doc.querySelectorAll('script');
  let mainJsonData = null;
  let mediaJsonData = null;
  const mainPrefix = 'adp_MarketplacePDPContainerQueryRelayPreloader_';
  const mediaPrefix = 'adp_MarketplacePDPC2CMediaViewerWithImagesQueryRelayPreloader_';

  for (const script of scripts) {
    const scriptContent = script.textContent;
    if (!scriptContent) continue;

    const mainSearchKey = '"' + mainPrefix;
    const mediaSearchKey = '"' + mediaPrefix;

    let keyStartIndex = -1;
    let isMainData = false;

    // Search for main JSON
    if (!mainJsonData) {
      keyStartIndex = scriptContent.indexOf(mainSearchKey);
      if (keyStartIndex !== -1) isMainData = true;
    }

    // Search for media JSON
    if (keyStartIndex === -1 && !mediaJsonData) {
      keyStartIndex = scriptContent.indexOf(mediaSearchKey);
      if (keyStartIndex !== -1) isMainData = false;
    }

    if (keyStartIndex === -1) continue;

    try {
      // Find JSON object delimiters
      const keyEndIndex = scriptContent.indexOf('"', keyStartIndex + 1);
      if (keyEndIndex === -1) continue;
      const commaIndex = scriptContent.indexOf(',', keyEndIndex);
      if (commaIndex === -1) continue;
      const openBraceIndex = scriptContent.indexOf('{', commaIndex);
      if (openBraceIndex === -1) continue;

      let braceCount = 1;
      let currentPos = openBraceIndex + 1;
      // Manually search for closing brace, ignoring string content
      while (currentPos < scriptContent.length && braceCount > 0) {
        const char = scriptContent[currentPos];
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '"') { // Skip strings
          currentPos++;
          while (currentPos < scriptContent.length) {
            if (scriptContent[currentPos] === '\\') currentPos++; // Skip escaped character
            else if (scriptContent[currentPos] === '"') break; // End of string
            currentPos++;
          }
        }
        currentPos++;
      }

      if (braceCount === 0) {
        const closeBraceIndex = currentPos - 1;
        const potentialJsonString = scriptContent.substring(openBraceIndex, closeBraceIndex + 1);
        try {
          const parsedJson = JSON.parse(potentialJsonString);
          logger.debug(`[ProductExtractor] Parsed JSON (${isMainData ? 'Main' : 'Media'}).`);

          if (isMainData) {
            if (parsedJson?.__bbox?.result?.data?.viewer?.marketplace_product_details_page?.target) {
              mainJsonData = parsedJson;
            } else logger.debug('[ProductExtractor] Incorrect main structure.');
          } else {
            if (parsedJson?.__bbox?.result?.data?.viewer?.marketplace_product_details_page?.target?.listing_photos) {
              mediaJsonData = parsedJson;
            } else logger.debug('[ProductExtractor] Incorrect media structure.');
          }
          if (mainJsonData && mediaJsonData) break; // Exit if we have both
        } catch (parseError) {
          logger.warn(`[ProductExtractor] Error parsing JSON (${isMainData ? 'Main' : 'Media'}):`, parseError);
        }
      }
    } catch (e) {
      logger.error(`[ProductExtractor] Error processing script (${isMainData ? 'Main' : 'Media'}):`, e);
    }
  }

  // Process data if main JSON was found
  if (mainJsonData) {
    try {
      const target = mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.target;
      const seller = target.marketplace_listing_seller;
      const location = target.location?.reverse_geocode_detailed;

      let allImages = [];
      // Extract images from media JSON if it exists
      if (mediaJsonData) {
        try {
          const photos = mediaJsonData.__bbox.result.data.viewer.marketplace_product_details_page.target.listing_photos;
          if (photos && Array.isArray(photos)) {
            allImages = photos.map(photo => photo?.image?.uri).filter(Boolean);
          }
        } catch (e) {
          logger.warn('[ProductExtractor] Error extracting images from media JSON:', e);
        }
      }

      // Ensure the primary image is in the list
      const primaryImageUri = target.primary_listing_photo?.listing_image?.uri;
      if (primaryImageUri && !allImages.includes(primaryImageUri)) {
        allImages.unshift(primaryImageUri);
      }

      // Format the price when it is present in amount but not in formatted_price
      let formattedPrice = target.formatted_price?.text || '';
      const amount = target.listing_price?.amount || '';
      const currency = target.listing_price?.currency || '';

      // If the formatted price is empty but we have amount and currency, create a custom format
      if (!formattedPrice && amount) {
        // Format the price according to the currency
        if (currency === 'COP') {
          formattedPrice = `$${parseInt(amount).toLocaleString('es-CO')} COP`;
        } else if (currency === 'USD') {
          formattedPrice = `$${parseInt(amount).toLocaleString('en-US')}`;
        } else if (currency === 'EUR') {
          formattedPrice = `€${parseInt(amount).toLocaleString('de-DE')}`;
        } else {
          // Generic format for other currencies
          formattedPrice = `${currency} ${parseInt(amount).toLocaleString()}`;
        }
        logger.debug(`[ProductExtractor] Manually formatted price: ${formattedPrice}`);
      }

      const result = {
        source: 'inline_json',
        title: target.marketplace_listing_title || '',
        description: target.redacted_description?.text || '',
        price: formattedPrice, // Use the formatted price (original or generated)
        currency: target.listing_price?.currency || '',
        amount: target.listing_price?.amount || '',
        url: target.story?.url || originalUrl,
        listingId: target.id || '',
        image: allImages.length > 0 ? allImages[0] : '',
        imageUrls: allImages,
        sellerName: seller?.name || '',
        sellerId: seller?.id || '',
        sellerProfilePic: seller?.profile_picture?.uri || '',
        categoryName: target.marketplace_listing_category_name || '',
        isSold: target.is_sold || false,
        isLive: target.is_live || false,
        city: location?.city || '',
        state: location?.state || '',
        postalCode: location?.postal_code || '',
        extractedFrom: 'inline_json'
      };
      logger.debug('[ProductExtractor] Extraction completed from embedded JSON.');
      return result;
    } catch (error) {
      logger.error('[ProductExtractor] Error processing main JSON data:', error);
    }
  }

  return null;
}

/**
 * Extract product details from the DOM as a fallback
 * @param {Document} doc - HTML Document
 * @param {string} productId - Product ID
 * @returns {Object} Product details
 */
function extractFromDOM(doc, productId) {
  logger.debug('[ProductExtractor] Extracting basic data from DOM...');

  try {
    // Try to extract the title
    let title = 'Marketplace';
    const titleElements = doc.querySelectorAll('h1, span.x193iq5w');
    for (const el of titleElements) {
      if (el.textContent && el.textContent.trim().length > 0 && el.textContent.trim() !== 'Marketplace') {
        title = el.textContent.trim();
        break;
      }
    }

    // Try to extract the price
    let price = '';
    const priceElements = doc.querySelectorAll('.x193iq5w.xeuugli.x13faqbe.x1vvkbs, span[dir="auto"] > span');
    for (const el of priceElements) {
      if (el.textContent && /\$|€|£|¥|₹|₽|¢|₩|₴|₦|₫|₱/i.test(el.textContent)) {
        price = el.textContent.trim();
        break;
      }
    }

    // Try to extract the description
    let description = '';
    const descElements = doc.querySelectorAll('span[dir="auto"], div[data-ad-comet-preview="message"], div[data-contents="true"]');
    for (const el of descElements) {
      if (el.textContent && el.textContent.length > 50 && !el.textContent.includes('Marketplace')) {
        description = el.textContent.trim();
        break;
      }
    }

    // If a long description was not found, use text from the chat
    if (!description || description.length < 50) {
      // Try to get it from the message content
      const chatElements = doc.querySelectorAll('div[role="row"] div[dir="auto"]');
      if (chatElements.length > 0) {
        // Use the last message as an approximate description
        description = chatElements[chatElements.length - 1].textContent.trim();
      }
    }

    // Try to extract images
    const imageUrls = [];
    const imageElements = doc.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
    for (const img of imageElements) {
      if (img.src && !img.src.includes('profile') && !imageUrls.includes(img.src)) {
        imageUrls.push(img.src);
        if (imageUrls.length >= 5) break; // Limit to 5 images
      }
    }

    const result = {
      id: productId,
      title,
      price,
      description,
      imageUrls,
      extractedFromDOM: true,
      extractedFrom: 'dom-fallback'
    };

    logger.debug('[ProductExtractor] Extracted basic product details from DOM', result);
    return result;
  } catch (error) {
    logger.error('[ProductExtractor] Error extracting from DOM', error);
    return {
      id: productId,
      title: 'Marketplace',
      price: '',
      description: '',
      imageUrls: [],
      extractedFromDOM: true,
      extractedFrom: 'dom-error'
    };
  }
}

/**
 * Fetch product details using GM_xmlhttpRequest
 * @param {string} productId - Product ID
 * @param {string} url - URL to get the details
 * @returns {Promise<Object>} Product details
 */
function fetchProductWithGM(productId, url) {
  return new Promise((resolve, reject) => {
    logger.debug('[ProductExtractor] Using GM_xmlhttpRequest to fetch HTML for product:', { productId, url });

    // Check if it is already cached
    if (productCache[productId]) {
      logger.debug(`[ProductExtractor] Product ${productId} found in cache`);
      // Show the complete details of the product in cache
      console.log("--- CACHED PRODUCT DATA ---");
      console.log(JSON.stringify(productCache[productId], null, 2));
      console.log("--- END PRODUCT DATA ---");
      return resolve(productCache[productId]);
    }

    // Use GM_xmlhttpRequest to get the HTML of the product page
    if (typeof GM_xmlhttpRequest !== 'function') {
      return reject(new Error('GM_xmlhttpRequest not available'));
    }

    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 15000,
      onload: function (response) {
        if (response.status >= 200 && response.status < 300) {
          try {
            const doc = new DOMParser().parseFromString(response.responseText, 'text/html');

            // First try to extract data from the embedded JSON
            let productDetails = extractFromInlineJson(doc, url);

            // If JSON extraction failed, extract basic data from the DOM
            if (!productDetails) {
              logger.warn('[ProductExtractor] Inline JSON extraction failed for ' + productId + ', trying DOM extraction fallback');
              productDetails = extractFromDOM(doc, productId);
            }

            // Store in cache
            productCache[productId] = productDetails;
            logger.debug(`[ProductExtractor] Product ${productId} cached`);

            // Show the complete details of the extracted product
            console.log("--- EXTRACTED PRODUCT DATA ---");
            console.log(JSON.stringify(productDetails, null, 2));
            console.log("--- END PRODUCT DATA ---");

            resolve(productDetails);
          } catch (error) {
            logger.error('[ProductExtractor] Error parsing product HTML', error);

            // Try DOM fallback even if parsing fails
            try {
              const fallbackDetails = extractFromDOM(new DOMParser().parseFromString(response.responseText, 'text/html'), productId);
              productCache[productId] = fallbackDetails;

              // Show fallback details
              console.log("--- PRODUCT DATA (FALLBACK) ---");
              console.log(JSON.stringify(fallbackDetails, null, 2));
              console.log("--- END PRODUCT DATA ---");

              resolve(fallbackDetails);
            } catch (fallbackError) {
              reject(fallbackError);
            }
          }
        } else {
          reject(new Error(`HTTP Error: ${response.status}`));
        }
      },
      onerror: function (error) {
        logger.error('[ProductExtractor] GM_xmlhttpRequest network error for product ' + productId, { error: JSON.stringify(error) });
        reject(error);
      },
      ontimeout: function () {
        reject(new Error('Request timeout'));
      }
    });
  });
}

/**
 * Extracts product details from the current page's DOM in chat
 * @returns {Object|null} Product details or null if not found
 */
function extractProductDetailsFromCurrentPage() {
  logger.debug('[ProductExtractor] Attempting DOM extraction fallback for product details');

  try {
    // Get product ID from the current URL
    let productId = null;
    const productLink = document.querySelector('a[href*="/marketplace/item/"]');

    if (productLink) {
      productId = extractProductIdFromUrl(productLink.href);
    }

    if (!productId) {
      logger.warn('[ProductExtractor] No product ID found in current page');
      return null;
    }

    // If the product is cached, return it
    if (productCache[productId]) {
      // Show the product details in cache
      console.log("--- CACHED PRODUCT DATA (DOM) ---");
      console.log(JSON.stringify(productCache[productId], null, 2));
      console.log("--- END PRODUCT DATA ---");
      return productCache[productId];
    }

    // Extract basic details from the DOM
    const result = extractFromDOM(document, productId);

    // Save to cache
    productCache[productId] = result;
    logger.debug(`[ProductExtractor] Product ${productId} cached from DOM extraction`);

    // Show the product details extracted from the DOM
    console.log("--- PRODUCT DATA EXTRACTED FROM DOM ---");
    console.log(JSON.stringify(result, null, 2));
    console.log("--- END PRODUCT DATA ---");

    return result;
  } catch (error) {
    logger.error('[ProductExtractor] Error extracting product details from current page', error);
    return null;
  }
}

/**
 * Extract product ID from the current chat by searching for links in the DOM
 * @returns {string|null} Product ID or null if not found
 */
function extractProductIdFromCurrentChat() {
  try {
    logger.debug('Attempting to extract product ID from current chat');

    // Search for Marketplace product links in the current conversation
    const productLinks = document.querySelectorAll('a[href*="/marketplace/item/"]');

    if (productLinks.length === 0) {
      // If no direct links were found, search in text elements
      const marketplaceRefs = document.querySelectorAll('div[role="row"] div[dir="auto"] a');
      for (const ref of marketplaceRefs) {
        if (ref.href && ref.href.includes('/marketplace/item/')) {
          const productId = extractProductIdFromUrl(ref.href);
          if (productId) {
            logger.debug(`Found product ID ${productId} from text reference`);
            return productId;
          }
        }
      }

      // Search in iframe or embedded elements
      const embeddedLinks = document.querySelectorAll('iframe[src*="marketplace"], div[data-testid*="marketplace"]');
      for (const embed of embeddedLinks) {
        const src = embed.src || embed.getAttribute('data-testid');
        if (src) {
          const matches = src.match(/marketplace\/item\/(\d+)/i);
          if (matches && matches[1]) {
            logger.debug(`Found product ID ${matches[1]} from embedded element`);
            return matches[1];
          }
        }
      }

      logger.debug('No product links found in current chat');
      return null;
    }

    // Get the product link (use the first one found)
    const productLink = productLinks[0].href;
    const productId = extractProductIdFromUrl(productLink);

    if (productId) {
      logger.debug(`Found product ID ${productId} from link`);
      logger.debug(`Product link found: ${productLink}`);
      return productId;
    }

    logger.debug('Could not extract product ID from link');
    return null;
  } catch (error) {
    logger.error('Error extracting product ID from current chat:', error);
    return null;
  }
}

/**
 * Gets details of a product by its ID
 * @param {string} productId - Product ID
 * @param {string} [url] - Optional product URL
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId, url = null) {
  try {
    if (!productId) {
      throw new Error('Product ID is required');
    }

    // If the product is already cached, return the cached version
    if (productCache[productId]) {
      logger.debug(`Retrieved product ${productId} from cache`);
      return productCache[productId];
    }

    // Build URL if not provided
    if (!url) {
      url = `https://www.facebook.com/marketplace/item/${productId}/`;
    }

    logger.debug(`Fetching product details for ID: ${productId} from URL: ${url}`);

    try {
      // Try to get details using GM_xmlhttpRequest
      const productDetails = await fetchProductWithGM(productId, url);
      return productDetails;
    } catch (error) {
      // If the request fails, try to extract details from the DOM of the current page
      logger.warn(`Failed to fetch product ${productId} from URL: ${error.message}`);
      logger.debug('Attempting DOM extraction fallback');

      const fallbackDetails = extractProductDetailsFromCurrentPage() || {
        id: productId,
        title: 'Unknown Product',
        price: '',
        description: '',
        imageUrls: [],
        extractedFromDOM: true,
        extractedFrom: 'fallback-error'
      };

      // Save even limited details to the cache
      productCache[productId] = fallbackDetails;

      // If it is a default extraction, show it too
      if (fallbackDetails.extractedFrom === 'fallback-error') {
        console.log("--- PRODUCT DATA (DEFAULT FALLBACK) ---");
        console.log(JSON.stringify(fallbackDetails, null, 2));
        console.log("--- END PRODUCT DATA ---");
      }

      return fallbackDetails;
    }
  } catch (error) {
    logger.error(`Error getting product details for ${productId}:`, error);
    throw error;
  }
}

// Add a function to manually inspect a product
function inspectProduct(productId) {
  if (!productId) {
    const productLink = document.querySelector('a[href*="/marketplace/item/"]');
    if (productLink) {
      productId = extractProductIdFromUrl(productLink.href);
    }
  }

  if (productId && productCache[productId]) {
    console.log("--- MANUAL PRODUCT INSPECTION ---");
    console.log(JSON.stringify(productCache[productId], null, 2));
    console.log("--- END INSPECTION ---");
    return productCache[productId];
  } else {
    console.error("No product with ID " + productId + " in cache to inspect");
    return null;
  }
}

// Export functions
window.productExtractor = {
  getProductDetails,
  extractProductIdFromUrl,
  extractProductIdFromCurrentChat,
  inspectProduct  // New function for manual inspection
};