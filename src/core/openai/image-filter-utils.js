/**
 * Centralized utilities for processing Facebook images
 * Uses a Cloudflare Worker to proxy and cache images, applying quality transformations.
 */
class ImageFilterUtils {
  /**
   * Procesa una lista de URLs de imágenes de Facebook a través de un proxy de Cloudflare.
   * @param {string[]} imageUrls - Las URLs originales de cdn.fbsbx.com.
   * @param {string} imageQuality - Calidad de imagen: 'high', 'medium', o 'low'.
   * @returns {Promise<string[]>} Una lista de nuevas URLs procesadas.
   */
  static async processImageUrls(imageUrls = [], imageQuality = 'high') {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return [];
    }

    // Obtener la calidad de imagen desde la configuración global (si no se especifica)
    const configQuality = window.CONFIG?.images?.quality || 'high';
    const quality = imageQuality || configQuality;

    // --- URL del Worker de Cloudflare ---
    const workerUrl = 'https://fb-image-proxy.juandavid.workers.dev'; 

    const processedUrls = [];
    for (const originalUrl of imageUrls) {
      logger.debug(`[ImageFilterUtils] Procesando URL: ${originalUrl} con calidad ${quality}`);
      try {
        // Construimos la URL con el parámetro de calidad
        const proxyUrl = `${workerUrl}?url=${encodeURIComponent(originalUrl)}&quality=${quality}`;
        
        // Verificar que la URL es accesible
        const response = await fetch(proxyUrl, { method: 'HEAD' });
        if (response.ok) {
          processedUrls.push(proxyUrl);
          logger.debug(`[ImageFilterUtils] URL procesada: ${proxyUrl}`);
        } else {
          logger.warn(`[ImageFilterUtils] Error al acceder a la URL: ${proxyUrl}. Status: ${response.status}`);
          // Si falla, intentar usar la URL original como fallback
          processedUrls.push(originalUrl);
        }
      } catch (e) {
        logger.error(`[ImageFilterUtils] Error procesando la URL ${originalUrl}:`, e);
        // En caso de error, usar la URL original como fallback
        processedUrls.push(originalUrl);
      }
    }

    logger.log(`[ImageFilterUtils] Se procesaron ${processedUrls.length}/${imageUrls.length} imágenes (calidad: ${quality}).`);
    return processedUrls;
  }
}

window.ImageFilterUtils = ImageFilterUtils;