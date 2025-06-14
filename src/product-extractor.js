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
 * Filters only relevant fields that have valid values
 * @param {Object} data - Unfiltered data
 * @returns {Object} Filtered data with only relevant fields
 */
function filterRelevantFields(data) {
  if (!data || typeof data !== 'object') return {};
  
  return Object.entries(data).reduce((acc, [key, val]) => {
    const isNonEmptyString = (typeof val === 'string' && val !== '');
    const isNonEmptyArray = (Array.isArray(val) && val.length > 0);
    const isNonNullNumber = (typeof val === 'number' && !isNaN(val));
    const isBoolean = (typeof val === 'boolean');
    if (isNonEmptyString || isNonEmptyArray || isNonNullNumber || isBoolean) {
      acc[key] = val;
    }
    return acc;
  }, {});
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
            logger.debug(`[ProductExtractor] Extracted ${allImages.length} images from media JSON`);
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
      
      // NEW: Filter possible duplicate thumbnails (as in the POC)
      if (allImages.length >= 2 && allImages[0].split('?')[0] === allImages[1].split('?')[0]) {
        logger.debug('[ProductExtractor] Duplicate thumbnail detected, removing the first one.');
        allImages.shift();
      }

      const result = {
        source: 'inline_json',
        title: target.marketplace_listing_title || '',
        description: target.redacted_description?.text || '',
        price: target.formatted_price?.text || '',
        currency: target.listing_price?.currency || '',
        amount: target.listing_price?.amount || '',
        url: target.story?.url || originalUrl,
        listingId: target.id || '',
        image: allImages.length > 0 ? allImages[0] : '',
        allImages: allImages,
        sellerName: seller?.name || '',
        sellerId: seller?.id || '',
        sellerProfilePic: seller?.profile_picture?.uri || '',
        sellerJoinTimestamp: seller?.join_time || null,
        categoryName: target.marketplace_listing_category_name || '',
        categorySlug: target.marketplace_listing_category?.slug || '',
        isSold: target.is_sold || false,
        isLive: target.is_live || false,
        deliveryTypes: target.delivery_types || [],
        city: location?.city || '',
        state: location?.state || '',
        postalCode: location?.postal_code || '',
        latitude: target.location?.latitude || null,
        longitude: target.location?.longitude || null,

        // --- All nodes/subsets for later filtering ---
        pageTypename: mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.__typename || '',
        productDetailsType: mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.product_details_type || '',
        pageId: mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.id || '',

        // marketplace_listing_renderable_target
        listingRenderableTargetTypename: rt.__typename || '',
        listingRenderableTargetSweepstake: rt.sweepstake_enabled || false,
        listingRenderableTargetId: rt.id || '',
        seoVirtualCategory: rt.seo_virtual_category || '',
        personalizationInfo: rt.personalization_info || '',
        isShippingOffered: rt.is_shipping_offered || false,
        listingRenderableTargetLatitude: rt.location?.latitude || null,
        listingRenderableTargetLongitude: rt.location?.longitude || null,

        // target (main detail)
        inventoryType: target.listing_inventory_type || '',
        boostedMarketplaceListing: target.product_item?.boosted_marketplace_listing || null,
        promotedListing: target.product_item?.promoted_listing || null,
        originGroup: target.origin_group || null,
        loggingId: target.logging_id || '',
        messagingEnabled: target.messaging_enabled || false,
        canShare: target.can_share || false,
        shareUri: target.share_uri || '',
        rebuyOrderReceipt: target.rebuy_order_receipt || null,
        activeOrder: target.active_order || null,
        orderSummaries: target.order_summaries || [],

        // story
        storyUrl: target.story?.url || '',
        storyActors: target.story?.actors?.map(a => ({ id: a.id, name: a.name })) || [],

        // marketplace_listing_seller
        sellerUserProfileId: seller?.marketplace_user_profile?.id || '',

        // cross-post
        crossPostSyncMetadata: target.cross_post_sync_metadata || null,

        // additional target detail
        customTitle: target.custom_title || '',
        hasChildren: target.has_children || false,
        hiddenFromFriends: target.hidden_from_friends || false,
        canSellerChangeAvailability: target.can_seller_change_availability || false,
        isOnMarketplace: target.is_on_marketplace || false,
        listingIsRejected: target.listing_is_rejected || false,
        listingPriceWithOffset: target.listing_price?.amount_with_offset || '',
        crossPostIds: target.cross_post_info?.all_listings?.map(l => l.id) || [],
        productItemId: target.product_item?.id || '',
        defaultVariantListingId: target.default_variant_listing?.id || '',
        primaryMpEntId: target.primary_mp_ent?.id || '',
        energyEfficiencyClassEu: target.energy_efficiency_class_eu || '',
        shippingEligible: target.c2c_shipping_eligible || false,
        shouldHidePdpShippingContent: target.should_hide_pdp_shipping_content || false,
        shippingProfile: target.shipping_profile || null,
        inventoryCount: target.inventory_count || null,
        paymentTimePeriod: target.payment_time_period || null,
        isPending: target.is_pending || false,
        isDraft: target.is_draft || false,
        isCheckoutEnabled: target.is_checkout_enabled || false,
        canSellerEdit: target.can_seller_edit || false,
        realEstateListingAgentId: target.real_estate_listing_agent?.id || '',
        listedById: target.listed_by?.id || '',
        marketplaceLeadGenForm: target.marketplace_lead_gen_form || null,

        // seller extra info
        sellerUserId: seller?.user_id || '',
        c2cOrdersShipped: seller?.marketplace_user_profile?.c2c_orders_shipped || null,
        sellerVerifiedBadge: seller?.marketplace_should_display_verified_badge || false,
        sellerRatingsFiveStarAverage: seller?.marketplace_ratings_stats_by_role?.seller_stats?.five_star_ratings_average || null,
        sellerRatingsTotalCount: seller?.marketplace_ratings_stats_by_role?.seller_stats?.five_star_total_rating_count_by_role || null,
        sellerRatingsArePrivate: seller?.marketplace_ratings_stats_by_role?.seller_ratings_are_private || false,

        // viewer info
        viewerInDMA: mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.viewer?.marketplace_actor_with_integrity_status?.marketplace_user_in_dma || false,
        viewerLoanPaymentOptions: mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page.viewer?.marketplace_settings?.loan_payment_options || null,

        // generic Real Estate fields (already existed)
        additionalFeesDescription: target.additional_fees_description?.text || '',
        unitAreaInfo: target.unit_area_info || null,
        unitRoomInfo: target.unit_room_info || null,
        bikeScoreInfo: target.bike_score_info || null,
        transitScoreInfo: target.transit_score_info || null,
        walkScoreInfo: target.walk_score_info || null,
        nearbySchools: target.nearby_schools || [],
        nearbyTransits: target.nearby_transits || [],
            };
            
            // --- Filter only "relevant" fields ---
            const filtered = filterRelevantFields(result);
            
            logger.debug('[ProductExtractor] Extraction completed from embedded JSON.');
            logger.debug(`[ProductExtractor] Filtered out ${Object.keys(result).length - Object.keys(filtered).length} empty fields`);
            
            return filtered;
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

    // Apply the same filtering to the DOM results
    const filtered = filterRelevantFields(result);
    
    logger.debug('[ProductExtractor] Extracted basic product details from DOM');
    logger.debug(`[ProductExtractor] DOM extraction produced ${Object.keys(filtered).length} relevant fields`);
    
    return filtered;
  } catch (error) {
    logger.error('[ProductExtractor] Error extracting from DOM', error);
    
    // Also filter the default result
    return filterRelevantFields({
      id: productId,
      title: 'Marketplace',
      extractedFromDOM: true,
      extractedFrom: 'dom-error'
    });
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

            // EXTRACT embedded JSON data
            let productDetails = extractFromInlineJson(doc, url);
            if (!productDetails) {
              logger.warn('[ProductExtractor] Inline JSON failed, using DOM');
              productDetails = extractFromDOM(doc, productId);
            }

            // IMPORTANT MODIFICATION: Remove unconditional overwriting
            // Only use DOM images as a fallback if there are no images from JSON
            if (!productDetails.allImages || productDetails.allImages.length === 0) {
              logger.debug('[ProductExtractor] No images from JSON, using DOM images as fallback');
              const domFallback = extractFromDOM(doc, productId);
              if (domFallback?.imageUrls?.length) {
                productDetails.allImages = domFallback.imageUrls;
                productDetails.image = domFallback.imageUrls[0];
                // Re-filter after adding images
                productDetails = filterRelevantFields(productDetails);
              }
            } else {
              logger.debug(`[ProductExtractor] Using ${productDetails.allImages.length} images from JSON (higher quality)`);
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
              
              // Ensure filtering of the fallback result
              const filteredFallback = filterRelevantFields(fallbackDetails);
              productCache[productId] = filteredFallback;

              // Show fallback details
              console.log("--- PRODUCT DATA (FALLBACK) ---");
              console.log(JSON.stringify(filteredFallback, null, 2));
              console.log("--- END PRODUCT DATA ---");

              resolve(filteredFallback);
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

    // Result is already filtered by extractFromDOM
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
      return productCache[productId]; // Already filtered in cache
    }

    // Build URL if not provided
    if (!url) {
      url = `https://www.facebook.com/marketplace/item/${productId}/`;
    }

    logger.debug(`Fetching product details for ID: ${productId} from URL: ${url}`);

    try {
      // Try to get details using GM_xmlhttpRequest
      const productDetails = await fetchProductWithGM(productId, url);
      
      // KEEP: Use DOM only as a fallback if there are no images
      if (!productDetails.allImages || productDetails.allImages.length === 0) {
        logger.debug('[ProductExtractor] No images found in JSON, trying DOM extraction');
        const domImages = getProductImagesFromChat(document);
        if (domImages && domImages.length > 0) {
          productDetails.allImages = domImages;
          productDetails.image = domImages[0];
          // Re-filter after adding images 
          return filterRelevantFields(productDetails);
        }
      }
      
      return productDetails;
    } catch (error) {
      // If the request fails, try to extract details from the DOM of the current page
      logger.warn(`Failed to fetch product ${productId} from URL: ${error.message}`);
      logger.debug('Attempting DOM extraction fallback');

      const fallbackDetails = extractProductDetailsFromCurrentPage() || {
        id: productId,
        title: 'Unknown Product',
        extractedFromDOM: true,
        extractedFrom: 'fallback-error'
      };

      // Ensure filtering even for the final fallback
      const filteredFallback = filterRelevantFields(fallbackDetails);
      
      // Save even limited details to the cache
      productCache[productId] = filteredFallback;

      // If it is a default extraction, show it too
      if (filteredFallback.extractedFrom === 'fallback-error') {
        console.log("--- PRODUCT DATA (DEFAULT FALLBACK) ---");
        console.log(JSON.stringify(filteredFallback, null, 2));
        console.log("--- END PRODUCT DATA ---");
      }

      return filteredFallback;
    }
  } catch (error) {
    logger.error(`Error getting product details for ${productId}:`, error);
    throw error;
  }
}

/**
 * Add a function to manually inspect a product
 */
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

// -----------------------------------------
// Helper function to get <img.src> from the chat
// -----------------------------------------
function getProductImagesFromChat(chatContainer) {
  const sel = CONFIG.selectors.activeChat.messageImageElement;
  const imgs = Array.isArray(sel)
    ? sel.map(s => [...chatContainer.querySelectorAll(s)]).flat()
    : [...chatContainer.querySelectorAll(sel)];
  return imgs
    .map(img => img.src)
    .filter(src => src && /^https?:\/\//.test(src));
}

window.productExtractor = {
  getProductDetails,
  extractProductIdFromUrl,
  extractProductIdFromCurrentChat,
  inspectProduct,
  getProductImagesFromChat,
  filterRelevantFields
};