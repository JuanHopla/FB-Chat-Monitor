/**
 * Product Extractor Module (POC-Style Implementation)
 *
 * Extracts detailed information from Facebook Marketplace products using POC logic.
 */

// Cache to store already extracted products and avoid repeated requests
const productCache = {};
let storageUtilsInstance; // To be initialized by the main script

// Load stored cache
function loadCachedProducts() {
  if (!storageUtilsInstance) {
    console.warn('[ProductExtractorPOC] storageUtilsInstance not initialized. Cache loading skipped.');
    return;
  }
  try {
    const savedCache = storageUtilsInstance.get('PRODUCT_CACHE', {});
    Object.assign(productCache, savedCache);
    console.log(`[ProductExtractorPOC] Loaded ${Object.keys(productCache).length} cached products from storage`);
  } catch (error) {
    console.error('[ProductExtractorPOC] Error loading product cache', error);
  }
}

// Save cache periodically
setInterval(() => {
  if (!storageUtilsInstance) {
    return; // Silently skip if not initialized
  }
  try {
    storageUtilsInstance.set('PRODUCT_CACHE', productCache);
    // console.log(`[ProductExtractorPOC] Saved ${Object.keys(productCache).length} product cache entries to storage`);
  } catch (error) {
    console.error('[ProductExtractorPOC] Error saving product cache', error);
  }
}, 60000); // Every minute

/**
 * Extract product ID from URL (Kept from original product-extractor.js for utility)
 * @param {string} url - Product URL
 * @returns {string|null} Product ID or null if not found
 */
function extractProductIdFromUrl(url) {
  try {
    if (!url) return null;
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
    console.error('[ProductExtractorPOC] Error extracting product ID from URL', error);
    return null;
  }
}

/**
 * Filters only relevant fields that have valid values (Directly from POC)
 * @param {Object} data - Unfiltered data
 * @returns {Object} Filtered data with only relevant fields
 */
function filterRelevantFields(data) {
  if (!data || typeof data !== 'object') return {};
  return Object.entries(data).reduce((acc, [key, val]) => {
    // remove null or undefined
    if (val == null) return acc;
    // strings: remove only whitespace and empty strings
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return acc;
      acc[key] = s;
    }
    // non-empty arrays
    else if (Array.isArray(val) && val.length > 0) {
      acc[key] = val;
    }
    // valid numbers
    else if (typeof val === 'number' && !isNaN(val)) {
      acc[key] = val;
    }
    // booleans
    else if (typeof val === 'boolean') {
      acc[key] = val;
    }
    return acc;
  }, {});
}

/**
 * Extract product details from HTML using embedded JSON (Adapted from POC)
 * @param {Document} doc - HTML Document
 * @param {string} originalUrl - Original product URL
 * @param {string} productId - Product ID
 * @returns {Object|null} Product details or null if not found
 */
function extractFromInlineJsonPOC(doc, originalUrl, productId) {
    console.log('[ProductExtractorPOC] Initiating extraction from inline JSON...');
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

        // Search for main JSON if not yet found
        if (!mainJsonData) {
            keyStartIndex = scriptContent.indexOf(mainSearchKey);
            if (keyStartIndex !== -1) isMainData = true;
        }

        // Search for media JSON if not yet found and main was not found in this script
        if (keyStartIndex === -1 && !mediaJsonData) {
            keyStartIndex = scriptContent.indexOf(mediaSearchKey);
            if (keyStartIndex !== -1) isMainData = false;
        }

        if (keyStartIndex === -1) continue; // Not a relevant JSON

        try {
            // Find JSON object delimiters (exact POC logic)
            const keyEndIndex = scriptContent.indexOf('"', keyStartIndex + 1);
            if (keyEndIndex === -1) continue;
            const commaIndex = scriptContent.indexOf(',', keyEndIndex);
            if (commaIndex === -1) continue;
            const openBraceIndex = scriptContent.indexOf('{', commaIndex);
            if (openBraceIndex === -1) continue;

            let braceCount = 1;
            let currentPos = openBraceIndex + 1;
            while (currentPos < scriptContent.length && braceCount > 0) {
                const char = scriptContent[currentPos];
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
                else if (char === '"') {
                    currentPos++;
                    while (currentPos < scriptContent.length) {
                        if (scriptContent[currentPos] === '\\') currentPos++;
                        else if (scriptContent[currentPos] === '"') break;
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

                    if (isMainData) {
                        if (parsedJson?.__bbox?.result?.data?.viewer?.marketplace_product_details_page?.target) {
                            mainJsonData = parsedJson;
                        }
                    } else {
                        if (parsedJson?.__bbox?.result?.data?.viewer?.marketplace_product_details_page?.target?.listing_photos) {
                            mediaJsonData = parsedJson;
                        }
                    }
                    if (mainJsonData && mediaJsonData) break;
                } catch (parseError) {
                    // continue
                }
            }
        } catch (e) {
            // continue
        }
    }

    if (!mainJsonData) {
        console.error('[ProductExtractorPOC] Main JSON data with expected structure not found.');
        return null;
    }
    
    // console.log('[ProductExtractorPOC] Processing mainJsonData:', JSON.stringify(mainJsonData, null, 2).substring(0, 500) + "...");
    // if (mediaJsonData) console.log('[ProductExtractorPOC] Processing mediaJsonData:', JSON.stringify(mediaJsonData, null, 2).substring(0, 500) + "...");

    try {
        const page = mainJsonData.__bbox.result.data.viewer.marketplace_product_details_page;
        const target = page.target;
        const rt = page.marketplace_listing_renderable_target; // rt from mainJsonData
        const seller = target.marketplace_listing_seller;
        const locationDetails = target.location?.reverse_geocode_detailed; // POC uses target.location.reverse_geocode_detailed

        let allImages = [];
        let primaryImage = null;

        // Image extraction logic from POC, slightly adapted
        // 1. Try mediaJsonData (if found and structured like product-extractor's expectation)
        if (mediaJsonData?.__bbox?.result?.data?.node?.all_listing_photos?.edges) {
            allImages = mediaJsonData.__bbox.result.data.node.all_listing_photos.edges
                .map(edge => edge?.node?.image?.uri)
                .filter(Boolean);
            // console.log(`[ProductExtractorPOC] ${allImages.length} images from Media JSON (all_listing_photos).`);
        }
        // 2. Try mediaJsonData (if found and structured like POC's expectation for media)
        else if (mediaJsonData?.__bbox?.result?.data?.viewer?.marketplace_product_details_page?.target?.listing_photos) {
             const photos = mediaJsonData.__bbox.result.data.viewer.marketplace_product_details_page.target.listing_photos;
             if (photos && Array.isArray(photos)) {
                allImages = photos.map(photo => photo?.image?.uri).filter(Boolean);
                // console.log(`[ProductExtractorPOC] ${allImages.length} images from Media JSON (listing_photos).`);
             }
        }
        // 3. Fallback to mainJsonData.target.listing_photos (POC style)
        else if (target?.listing_photos && Array.isArray(target.listing_photos)) {
             allImages = target.listing_photos.map(photo => photo?.image?.uri).filter(Boolean);
             // console.log(`[ProductExtractorPOC] ${allImages.length} images from Main JSON target.listing_photos.`);
        }
        
        // Ensure primary image from main JSON (target or rt) is included (POC logic)
        const mainPrimaryImageUri = target?.primary_listing_photo?.listing_image?.uri || rt?.primary_listing_photo?.image?.uri;
        if (mainPrimaryImageUri) {
            if (!allImages.includes(mainPrimaryImageUri)) {
                allImages.unshift(mainPrimaryImageUri);
            }
            primaryImage = allImages[0]; // The first image is now the primary
            // console.log('[ProductExtractorPOC] Ensured primary image from Main JSON is in list.');
        } else if (allImages.length > 0) {
            primaryImage = allImages[0];
        }

        // Filter duplicate thumbnail (POC logic)
        if (allImages.length >= 2) {
            try {
                const url1 = new URL(allImages[0]);
                const url2 = new URL(allImages[1]);
                if (url1.pathname === url2.pathname && url1.searchParams.get('stp') !== url2.searchParams.get('stp')) {
                    // console.log('[ProductExtractorPOC] Duplicate thumbnail detected (POC logic), removing first.');
                    allImages.shift();
                    if (allImages.length > 0) primaryImage = allImages[0];
                }
            } catch(e) { /* console.warn('[ProductExtractorPOC] Error during image duplicate check:', e.message); */ }
        }
        if (!primaryImage && allImages.length > 0) primaryImage = allImages[0];


        const productDetails = {
            source: 'inline_json_poc',
            productId: productId,
            title: target?.marketplace_listing_title || rt?.marketplace_listing_title || '',
            description: target?.redacted_description?.text || rt?.description?.text || '',
            price: target?.formatted_price?.text || rt?.formatted_price?.text || '',
            currency: target?.listing_price?.currency || rt?.currency || '',
            amount: target?.listing_price?.amount?.toString() || rt?.price?.amount_with_offset?.toString() || '', // POC used .amount, ensure string
            url: target?.story?.url || rt?.story?.url || originalUrl,
            listingId: target?.id || rt?.id || productId,

            // --- New fields for the summary ---
            creationTime: target?.creation_time || null,
            locationText: target?.location_text?.text || '',
            storyText: target?.story?.translated_message_for_viewer?.text || '',

            // Vehicles
            mileage: target?.mileage || null,
            transmission: target?.transmission || '',
            exteriorColor: target?.exterior_color || '',
            interiorColor: target?.interior_color || '',
            nhtsaSafetyRating: target?.nhtsa_safety_rating || null,
            fuelType: target?.fuel_type || '',
            cityMpg: target?.city_mpg || null,
            highwayMpg: target?.highway_mpg || null,
            combinedMpg: target?.combined_mpg || null,
            owners: target?.owners || null,
            isPaidOff: target?.is_paid_off || false,
            cleanTitle: target?.clean_title || false,
            hasDamage: target?.has_damage || false,

            image: primaryImage || '',
            allImages: allImages,

            sellerName: seller?.name || '',
            sellerId: seller?.id || '',
            sellerProfilePic: seller?.profile_picture?.uri || '',
            sellerJoinTimestamp: seller?.join_time || null,
            
            categoryName: target?.marketplace_listing_category_name || rt?.category_name || '',
            categorySlug: target?.marketplace_listing_category?.slug || rt?.marketplace_listing_category?.slug || '',
            
            isSold: target?.is_sold || rt?.is_sold || false,
            isLive: target?.is_live || rt?.is_live || false,
            deliveryTypes: target?.delivery_types || rt?.delivery_types || [],
            
            // Location: prefer reverse_geocode_detailed from target (POC style) then rt
            city: locationDetails?.city_name || locationDetails?.city || rt?.location?.reverse_geocode_detailed?.city_name || '',
            state: locationDetails?.region_name || locationDetails?.state || rt?.location?.reverse_geocode_detailed?.region_name || '',
            postalCode: locationDetails?.postal_code || rt?.location?.reverse_geocode_detailed?.postal_code || '',
            latitude: target?.location?.latitude || rt?.location?.latitude || null,
            longitude: target?.location?.longitude || rt?.location?.longitude || null,

            // --- Fields from POC's extensive list, mapped primarily from target, then rt, then page ---
            pageTypename: page?.__typename || '',
            productDetailsType: page?.product_details_type || '',
            pageId: page?.id || '',

            listingRenderableTargetTypename: rt?.__typename || '',
            listingRenderableTargetSweepstake: rt?.sweepstake_enabled || false,
            listingRenderableTargetId: rt?.id || '', // Already have listingId
            seoVirtualCategory: rt?.seo_virtual_category || '',
            personalizationInfo: rt?.personalization_info || '',
            isShippingOffered: rt?.is_shipping_offered || target?.is_shipping_offered || false,
            
            inventoryType: target?.listing_inventory_type || rt?.listing_inventory_type || '',
            boostedMarketplaceListing: target?.product_item?.boosted_marketplace_listing || rt?.product_item?.boosted_marketplace_listing || null,
            promotedListing: target?.product_item?.promoted_listing || rt?.product_item?.promoted_listing || null,
            originGroup: target?.origin_group || rt?.origin_group || null,
            loggingId: target?.logging_id || rt?.logging_id || '',
            messagingEnabled: target?.messaging_enabled || rt?.messaging_enabled || false,
            canShare: target?.can_share || rt?.can_share || false,
            shareUri: target?.share_uri || rt?.share_uri || '',
            rebuyOrderReceipt: target?.rebuy_order_receipt || rt?.rebuy_order_receipt || null,
            activeOrder: target?.active_order || rt?.active_order || null,
            orderSummaries: target?.order_summaries || rt?.order_summaries || [],

            storyActors: (target?.story?.actors || rt?.story?.actors)?.map(a => ({ id: a.id, name: a.name })) || [],
            sellerUserProfileId: seller?.marketplace_user_profile?.id || '',
            crossPostSyncMetadata: target?.cross_post_sync_metadata || rt?.cross_post_sync_metadata || null,
            customTitle: target?.custom_title_text?.text || target?.custom_title || rt?.custom_title_text?.text || '',
            hasChildren: target?.has_children || rt?.has_children || false,
            hiddenFromFriends: target?.hidden_from_friends || rt?.hidden_from_friends || "VISIBLE_TO_EVERYONE", // POC had this as string
            canSellerChangeAvailability: target?.can_seller_change_availability || rt?.can_seller_change_availability || false,
            isOnMarketplace: target?.is_on_marketplace || rt?.is_on_marketplace || false,
            listingIsRejected: target?.listing_is_rejected || rt?.listing_is_rejected || false,
            listingPriceWithOffset: target?.listing_price?.amount_with_offset?.toString() || rt?.price?.amount_with_offset?.toString() || '',
            crossPostIds: (target?.cross_post_info?.all_listings || rt?.cross_post_info?.all_listings)?.map(l => l.id) || [],
            productItemId: target?.product_item?.id || rt?.product_item?.id || '',
            defaultVariantListingId: target?.default_variant_listing?.id || rt?.default_variant_listing?.id || '',
            primaryMpEntId: target?.primary_mp_ent?.id || rt?.primary_mp_ent?.id || '',
            energyEfficiencyClassEu: target?.energy_efficiency_class_eu || rt?.energy_efficiency_class_eu || '',
            shippingEligible: target?.c2c_shipping_eligible || rt?.c2c_shipping_eligible || false,
            shouldHidePdpShippingContent: target?.should_hide_pdp_shipping_content || rt?.should_hide_pdp_shipping_content || false,
            shippingProfile: target?.shipping_profile || rt?.shipping_profile || null,
            inventoryCount: target?.inventory_count || rt?.inventory_count || null,
            paymentTimePeriod: target?.payment_time_period || rt?.payment_time_period || null,
            isPending: target?.is_pending || rt?.is_pending || false,
            isDraft: target?.is_draft || rt?.is_draft || false,
            isCheckoutEnabled: target?.is_checkout_enabled || rt?.is_checkout_enabled || false,
            canSellerEdit: target?.can_seller_edit || rt?.can_seller_edit || false,
            realEstateListingAgentId: target?.real_estate_listing_agent?.id || rt?.real_estate_listing_agent?.id || '',
            listedById: target?.listed_by?.id || rt?.listed_by?.id || '',
            marketplaceLeadGenForm: target?.marketplace_lead_gen_form || rt?.marketplace_lead_gen_form || null,

            sellerUserId: seller?.user_id || '',
            c2cOrdersShipped: seller?.marketplace_user_profile?.c2c_orders_shipped || null,
            sellerVerifiedBadge: seller?.marketplace_should_display_verified_badge || false,
            sellerRatingsFiveStarAverage: seller?.marketplace_ratings_stats_by_role?.seller_stats?.five_star_ratings_average || null,
            sellerRatingsTotalCount: seller?.marketplace_ratings_stats_by_role?.seller_stats?.five_star_total_rating_count_by_role || null,
            sellerRatingsArePrivate: seller?.marketplace_ratings_stats_by_role?.seller_ratings_are_private || false,

            viewerInDMA: page?.viewer?.marketplace_actor_with_integrity_status?.marketplace_user_in_dma || false,
            viewerLoanPaymentOptions: page?.viewer?.marketplace_settings?.loan_payment_options || null,

            additionalFeesDescription: target?.additional_fees_description?.text || rt?.additional_fees_description?.text || '',
            unitAreaInfo: target?.unit_area_info || rt?.unit_area_info || null,
            unitRoomInfo: target?.unit_room_info || rt?.unit_room_info || null, // POC had this
            bikeScoreInfo: target?.bike_score_info || rt?.bike_score_info || null,
            transitScoreInfo: target?.transit_score_info || rt?.transit_score_info || null,
            walkScoreInfo: target?.walk_score_info || rt?.walk_score_info || null,
            nearbySchools: target?.nearby_schools || rt?.nearby_schools || [],
            nearbyTransits: target?.nearby_transits || rt?.nearby_transits || [],
        };
        // console.log('[ProductExtractorPOC] Extraction completed from inline JSON.');
        return filterRelevantFields(productDetails);
    } catch (error) {
        console.error('[ProductExtractorPOC] Error processing combined JSON data:', error, error.stack);
        return null;
    }
}

/**
 * Fetch product details using GM_xmlhttpRequest (Adapted from POC's fetchAndExtractWithGM)
 * @param {string} productId - Product ID
 * @param {string} url - URL to get the details
 * @returns {Promise<Object>} Product details
 */
function fetchProductWithGM(productId, url) {
  return new Promise((resolve, reject) => {
    // console.log('[ProductExtractorPOC] Using GM_xmlhttpRequest to fetch HTML for product:', { productId, url });

    if (typeof GM_xmlhttpRequest !== 'function') {
      console.error('[ProductExtractorPOC] GM_xmlhttpRequest not available.');
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
          // console.info('[ProductExtractorPOC] HTML obtained successfully. Status:', response.status);
          // console.log('[ProductExtractorPOC] Full responseText (first 2000 chars):', response.responseText.substring(0,2000));
          
          try { // Open in new tab for inspection (from POC)
            const blob = new Blob([response.responseText], { type: 'text/html' });
            const blobUrl = URL.createObjectURL(blob);
            // window.open(blobUrl, '_blank'); // Commented out for less intrusive behavior
            // console.info('[ProductExtractorPOC] Opened responseText in a new tab for inspection (link logged). URL:', blobUrl);
            // setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
          } catch (e) { /* console.warn('[ProductExtractorPOC] Could not open responseText in a new tab:', e); */ }

          const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
          const productDetails = extractFromInlineJsonPOC(doc, url, productId);

          if (productDetails) {
            resolve(productDetails);
          } else {
            // console.warn('[ProductExtractorPOC] Inline JSON extraction failed. No DOM fallback in POC style.');
            resolve(filterRelevantFields({
                source: 'inline_json_poc_failed',
                productId: productId, id: productId, title: 'Extraction Failed (POC)',
                url: url, extractedFrom: 'extraction-failure-poc'
            }));
          }
        } else {
          console.error(`[ProductExtractorPOC] GM_xmlhttpRequest HTTP Error: ${response.status} for ${url}`);
          reject(new Error(`HTTP Error: ${response.status}`));
        }
      },
      onerror: function (error) {
        console.error('[ProductExtractorPOC] GM_xmlhttpRequest network error for product ' + productId, error);
        reject(error);
      },
      ontimeout: function () {
        console.error('[ProductExtractorPOC] GM_xmlhttpRequest timeout for product ' + productId);
        reject(new Error('Request timeout'));
      }
    });
  });
}

/**
 * Gets details of a product by its ID. This is the main public function.
 * @param {string} productId - Product ID
 * @param {string} [url] - Optional product URL
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId, url = null) {
  if (!productId) {
    console.error('[ProductExtractorPOC] Product ID is required for getProductDetails.');
    throw new Error('Product ID is required');
  }

  if (!url) url = `https://www.facebook.com/marketplace/item/${productId}/`;
  // console.log(`[ProductExtractorPOC] Fetching product details for ID: ${productId} from URL: ${url}`);

  if (productCache[productId]) {
    // console.log(`[ProductExtractorPOC] Product ${productId} found in cache. Returning cached version.`);
    return productCache[productId];
  }

  try {
    const productDetails = await fetchProductWithGM(productId, url);
    productDetails.id = productId; // Ensure id is productId for caching consistency
    productCache[productId] = productDetails;
    // console.log(`[ProductExtractorPOC] Product ${productId} processed and cached.`);
    // console.log("--- EXTRACTED PRODUCT DATA (getProductDetails POC Style) ---");
    // console.log(JSON.stringify(productDetails, null, 2));
    // console.log("--- END PRODUCT DATA ---");
    return productDetails;
  } catch (error) {
    console.error(`[ProductExtractorPOC] Error in getProductDetails for ${productId}:`, error);
    const failureDetails = filterRelevantFields({
        source: 'error_in_getProductDetails_poc',
        productId: productId, id: productId, title: 'Get Details Failed (POC)',
        url: url, extractedFrom: 'error-poc-fetch'
    });
    productCache[productId] = failureDetails;
    return failureDetails; 
  }
}

/**
 * Extract product ID from the current chat by searching for links in the DOM (Kept for utility)
 * @returns {string|null} Product ID or null if not found
 */
function extractProductIdFromCurrentChat() {
  try {
    const productLinks = document.querySelectorAll('a[href*="/marketplace/item/"]');
    if (productLinks.length > 0) return extractProductIdFromUrl(productLinks[0].href);

    const marketplaceRefs = document.querySelectorAll('div[role="row"] div[dir="auto"] a');
    for (const ref of marketplaceRefs) {
      if (ref.href && ref.href.includes('/marketplace/item/')) {
        const pid = extractProductIdFromUrl(ref.href);
        if (pid) return pid;
      }
    }
    // Add other search patterns if needed from original product-extractor.js
    return null;
  } catch (error) {
    console.error('[ProductExtractorPOC] Error extracting product ID from current chat:', error);
    return null;
  }
}

/**
 * Manually inspect a product from cache (Kept for utility)
 */
function inspectProduct(productId) {
  if (!productId) {
    const productLink = document.querySelector('a[href*="/marketplace/item/"]');
    if (productLink) productId = extractProductIdFromUrl(productLink.href);
  }
  if (productId && productCache[productId]) {
    console.log("--- MANUAL PRODUCT INSPECTION (POC Style Cache) ---");
    console.log(JSON.stringify(productCache[productId], null, 2));
    console.log("--- END INSPECTION ---");
    return productCache[productId];
  } else {
    console.error("[ProductExtractorPOC] No product with ID " + productId + " in cache to inspect, or productId is missing.");
    return null;
  }
}

// Placeholder for getProductImagesFromChat if needed later, requires CONFIG
// function getProductImagesFromChat(chatContainer) { /* ... */ }

/**
 * Initializes the Product Extractor module with necessary utilities.
 * @param {Object} utils - Object containing utilities like storageUtils.
 */
function initialize(utils) {
    if (utils && utils.storageUtils) {
        storageUtilsInstance = utils.storageUtils;
        loadCachedProducts(); // Load cache once utils are available
        console.log('[ProductExtractorPOC] Initialized with storageUtils.');
    } else {
        console.warn('[ProductExtractorPOC] Initialization failed: storageUtils not provided.');
    }
}

/**
 * Returns a relevant summary of the product for the assistant, based on the category.
 * @param {Object} productDetails
 * @returns {string}
 */
function getRelevantProductSummary(productDetails) {
  if (!productDetails || typeof productDetails !== 'object') return '';
  // Filter only fields with a value
  const pd = filterRelevantFields(productDetails);
  if (Object.keys(pd).length === 0) return '';

  // Filter for property rentals
  if (
    (pd.categorySlug && pd.categorySlug.includes('property')) ||
    (pd.categoryName && pd.categoryName.toLowerCase().includes('rental'))
  ) {
    const lines = [];
    if (pd.title) lines.push(`Title: ${pd.title}`);
    if (pd.price) lines.push(`Price: ${pd.price}`);
    if (pd.categoryName) lines.push(`Category: ${pd.categoryName}`);
    if (pd.condition) lines.push(`Condition: ${pd.condition}`);
    if (pd.creationTime) lines.push(`Published: ${new Date(pd.creationTime * 1000).toLocaleDateString()}`);
    if (pd.locationText) lines.push(`Area: ${pd.locationText}`);
    if (pd.city || pd.state) lines.push(`Location: ${pd.city || ''}${pd.city && pd.state ? ', ' : ''}${pd.state || ''}`);
    if (pd.unitRoomInfo) lines.push(`Unit Details: ${pd.unitRoomInfo}`);
    if (pd.description) lines.push(`Description: ${pd.description}`);
    if (pd.storyText)    lines.push(`Details: ${pd.storyText}`);
    if (pd.translatedDescription) lines.push(`Translated Description: ${pd.translatedDescription}`);
    if (pd.walkScoreInfo) lines.push(`Walk Score: ${pd.walkScoreInfo?.score || ''} (${pd.walkScoreInfo?.description || ''})`);
    if (pd.transitScoreInfo) lines.push(`Transit Score: ${pd.transitScoreInfo?.score || ''} (${pd.transitScoreInfo?.description || ''})`);
    if (pd.bikeScoreInfo) lines.push(`Bike Score: ${pd.bikeScoreInfo?.score || ''} (${pd.bikeScoreInfo?.description || ''})`);
    if (Array.isArray(pd.nearbySchools) && pd.nearbySchools.length > 0) {
      lines.push('Nearby Schools:');
      pd.nearbySchools.forEach(school => {
        if (school && school.name) {
          lines.push(`  - ${school.name}${school.rating ? ` (${school.rating}/10)` : ''}${school.distance ? `, ${school.distance} away` : ''}`);
        }
      });
    }
    if (pd.sellerName) lines.push(`Seller: ${pd.sellerName}`);
    if (pd.sellerFiveStarAvg !== null) lines.push(`Average Rating: ${pd.sellerFiveStarAvg}`);
    if (pd.sellerFiveStarCount !== null) lines.push(`Total 5-Star Ratings: ${pd.sellerFiveStarCount}`);
    if (pd.sellerVerifiedBadge) lines.push(`Verified Seller: Yes`);
    if (pd.sellerJoinTimestamp) lines.push(`On Facebook Since: ${new Date(pd.sellerJoinTimestamp * 1000).getFullYear()}`);
    if (pd.url) lines.push(`URL: ${pd.url}`);
    return lines.join('\n');
  }

  // Filter for vehicles
  if (
    (pd.categorySlug && pd.categorySlug.includes('vehicles')) ||
    (pd.categoryName && pd.categoryName.toLowerCase().includes('vehicle')) ||
    (pd.pageTypename && pd.pageTypename.toLowerCase().includes('vehicle'))
  ) {
    const lines = [];
    if (pd.title) lines.push(`Title: ${pd.title}`);
    if (pd.price) lines.push(`Price: ${pd.price}`);
    if (pd.condition) lines.push(`Condition: ${pd.condition}`);
    if (pd.creationTime) lines.push(`Published: ${new Date(pd.creationTime * 1000).toLocaleDateString()}`);
    if (pd.locationText) lines.push(`Area: ${pd.locationText}`);
    if (pd.city || pd.state) lines.push(`Location: ${pd.city || ''}${pd.city && pd.state ? ', ' : ''}${pd.state || ''}`);
    if (pd.description) lines.push(`Description: ${pd.description}`);
    if (pd.translatedDescription) lines.push(`Translated Description: ${pd.translatedDescription}`);
    if (pd.mileage) lines.push(`Mileage: ${pd.mileage}`);
    if (pd.transmission) lines.push(`Transmission: ${pd.transmission}`);
    if (pd.exteriorColor) lines.push(`Exterior Color: ${pd.exteriorColor}`);
    if (pd.interiorColor) lines.push(`Interior Color: ${pd.interiorColor}`);
    if (pd.fuelType) lines.push(`Fuel Type: ${pd.fuelType}`);
    if (pd.cityMpg || pd.highwayMpg || pd.combinedMpg) {
      let mpg = [];
      if (pd.cityMpg) mpg.push(`City: ${pd.cityMpg}`);
      if (pd.highwayMpg) mpg.push(`Highway: ${pd.highwayMpg}`);
      if (pd.combinedMpg) mpg.push(`Combined: ${pd.combinedMpg}`);
      lines.push(`MPG: ${mpg.join(' · ')}`);
    }
    if (pd.owners) lines.push(`Owners: ${pd.owners}`);
    if (pd.nhtsaSafetyRating) lines.push(`NHTSA Safety Rating: ${pd.nhtsaSafetyRating}`);
    if (pd.isPaidOff !== undefined) lines.push(`Paid Off: ${pd.isPaidOff ? 'Yes' : 'No'}`);
    if (pd.cleanTitle !== undefined) lines.push(`Clean Title: ${pd.cleanTitle ? 'Yes' : 'No'}`);
    if (pd.hasDamage !== undefined) lines.push(`Significant Damage: ${pd.hasDamage ? 'Yes' : 'No'}`);
    if (pd.sellerName) lines.push(`Seller: ${pd.sellerName}`);
    if (pd.sellerFiveStarAvg !== null) lines.push(`Average Rating: ${pd.sellerFiveStarAvg}`);
    if (pd.sellerFiveStarCount !== null) lines.push(`Total 5-Star Ratings: ${pd.sellerFiveStarCount}`);
    if (pd.sellerVerifiedBadge) lines.push(`Verified Seller: Yes`);
    if (pd.sellerJoinTimestamp) lines.push(`On Facebook Since: ${new Date(pd.sellerJoinTimestamp * 1000).getFullYear()}`);
    if (pd.url) lines.push(`URL: ${pd.url}`);
    return lines.join('\n');
  }

  // Generic filter for other categories
  const genericLines = [];
  if (pd.title) genericLines.push(`Title: ${pd.title}`);
  if (pd.price) genericLines.push(`Price: ${pd.price}`);
  if (pd.categoryName) genericLines.push(`Category: ${pd.categoryName}`);
  // Location: prioritize locationText, then city, then state
  let location = '';
  if (pd.locationText) {
    location = pd.locationText;
  } else if (pd.city && pd.state) {
    location = `${pd.city}, ${pd.state}`;
  } else if (pd.city) {
    location = pd.city;
  } else if (pd.state) {
    location = pd.state;
  }
  if (location) genericLines.push(`Location: ${location}`);
  if (pd.description) genericLines.push(`Description: ${pd.description}`);
  if (pd.translatedDescription) genericLines.push(`Translated Description: ${pd.translatedDescription}`);
  if (pd.sellerName) genericLines.push(`Seller: ${pd.sellerName}`);
  if (pd.sellerFiveStarAvg !== null) genericLines.push(`Average Rating: ${pd.sellerFiveStarAvg}`);
  if (pd.sellerFiveStarCount !== null) genericLines.push(`Total 5-Star Ratings: ${pd.sellerFiveStarCount}`);
  if (pd.sellerVerifiedBadge) lines.push(`Verified Seller: Yes`);
  if (pd.sellerJoinTimestamp) lines.push(`On Facebook Since: ${new Date(pd.sellerJoinTimestamp * 1000).getFullYear()}`);
  if (pd.url) genericLines.push(`URL: ${pd.url}`);
  return genericLines.join('\n');
}

window.productExtractor = {
  initialize,
  getProductDetails,
  extractProductIdFromUrl,
  extractProductIdFromCurrentChat,
  inspectProduct,
  // getProductImagesFromChat, // Uncomment if re-implemented
  filterRelevantFields, // Expose for utility
  getRelevantProductSummary,
};

console.log('[ProductExtractorPOC] Module loaded. Call productExtractor.initialize({storageUtils: yourStorageUtils}) from main script.');