/**
 * Centralized utilities for processing Facebook images
 * Uses a Cloudflare Worker to proxy and cache images, avoiding FB's blocking.
 */
class ImageFilterUtils {
  /**
   * Procesa una lista de URLs de imágenes de Facebook a través de un proxy de Cloudflare.
   * @param {string[]} imageUrls - Las URLs originales de cdn.fbsbx.com.
   * @returns {Promise<string[]>} Una lista de nuevas URLs procesadas a través del proxy.
   */
  static async processImageUrls(imageUrls = []) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return [];
    }

    // --- ¡IMPORTANTE! Pega aquí la URL de tu Worker que copiaste en el paso 3 ---
    const workerUrl = 'https://fb-image-proxy.juandavid.workers.dev'; 
    // -------------------------------------------------------------------------

    const processedUrls = [];
    for (const originalUrl of imageUrls) {
      // --- INICIO DE LA CORRECCIÓN ---
      logger.debug(`[ImageFilterUtils] Intentando procesar URL: ${originalUrl}`);
      // --- FIN DE LA CORRECCIÓN ---
      try {
        // Construimos la nueva URL que apunta a nuestro worker,
        // pasándole la URL original como un parámetro.
        const proxyUrl = `${workerUrl}?url=${encodeURIComponent(originalUrl)}`;
        
        // Verificamos si la imagen es accesible a través del worker.
        // Usamos 'HEAD' para una comprobación rápida sin descargar el cuerpo.
        const response = await fetch(proxyUrl, { method: 'HEAD' });

        if (response.ok) {
          // --- INICIO DE LA CORRECCIÓN ---
          logger.debug(`[ImageFilterUtils] ÉXITO: URL procesada -> ${proxyUrl}`);
          // --- FIN DE LA CORRECCIÓN ---
          // Si la imagen es accesible, añadimos la URL del proxy a nuestra lista.
          processedUrls.push(proxyUrl);
        } else {
          logger.warn(`[ImageFilterUtils] La imagen ${originalUrl} no pudo ser procesada por el worker. Status: ${response.status}`);
        }
      } catch (e) {
        logger.error(`[ImageFilterUtils] Error procesando la URL ${originalUrl}:`, e);
      }
    }

    logger.log(`[ImageFilterUtils] Se procesaron ${processedUrls.length}/${imageUrls.length} imágenes a través del proxy de Cloudflare.`);
    return processedUrls;
  }
}

window.ImageFilterUtils = ImageFilterUtils;