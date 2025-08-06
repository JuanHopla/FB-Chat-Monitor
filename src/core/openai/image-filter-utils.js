/**
 * Centralized utilities for processing Facebook images.
 * Uses a Cloudflare Worker to proxy and cache images, applying quality transformations.
 */
class ImageFilterUtils {
  /**
   * Processes a list of Facebook image URLs through a Cloudflare proxy.
   * @param {string[]} imageUrls - The original URLs from cdn.fbsbx.com.
   * @param {string} imageQuality - Image quality: 'high', 'medium', or 'low'.
   * @returns {Promise<string[]>} A list of new, processed URLs.
   */
  static async processImageUrls(imageUrls = [], imageQuality = 'high') {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return [];
    }

    // Get image quality from global configuration (if not specified)
    const configQuality = window.CONFIG?.images?.quality || 'high';
    const quality = imageQuality || configQuality;

    // --- Cloudflare Worker URL ---
    const workerUrl = 'https://fb-image-proxy.juandavid.workers.dev';

    const processedUrls = [];
    for (const originalUrl of imageUrls) {
      logger.debug(`[ImageFilterUtils] Processing URL: ${originalUrl} with quality ${quality}`);
      try {
        // Build the URL with the quality parameter
        const proxyUrl = `${workerUrl}?url=${encodeURIComponent(originalUrl)}&quality=${quality}`;

        // Verify that the URL is accessible
        const response = await fetch(proxyUrl, { method: 'HEAD' });
        if (response.ok) {
          processedUrls.push(proxyUrl);
          logger.debug(`[ImageFilterUtils] Processed URL: ${proxyUrl}`);
        } else {
          logger.warn(`[ImageFilterUtils] Error accessing URL: ${proxyUrl}. Status: ${response.status}`);
          // If it fails, try using the original URL as a fallback
          processedUrls.push(originalUrl);
        }
      } catch (e) {
        logger.error(`[ImageFilterUtils] Error processing URL ${originalUrl}:`, e);
        // In case of an error, use the original URL as a fallback
        processedUrls.push(originalUrl);
      }
    }

    logger.log(`[ImageFilterUtils] Processed ${processedUrls.length}/${imageUrls.length} images (quality: ${quality}).`);
    return processedUrls;
  }
}

window.ImageFilterUtils = ImageFilterUtils;