/**
 * AudioAssociation - Detecta y asocia audios en el DOM y gestiona la transcripción centralizada.
 */
class AudioAssociation {
  constructor() {
    this.AUDIO_SELECTOR = 'audio[src]';
    this.MESSAGE_ROW_SELECTOR = 'div[role="row"]';
    this.processedAudios = new Set();
    this.observer = null;
  }

  // Escanea el DOM y asocia audios a mensajes
  scanAndAssociateAudios() {
    const audioElements = document.querySelectorAll(this.AUDIO_SELECTOR);
    audioElements.forEach(audioEl => {
      const audioUrl = audioEl.src;
      if (!audioUrl || this.processedAudios.has(audioUrl)) return;

      const row = audioEl.closest(this.MESSAGE_ROW_SELECTOR);
      if (!row) return;
      const messageId = row.dataset.messageId || null;

      this.getAudioBlob(audioUrl).then(audioBlob => {
        this.processedAudios.add(audioUrl);
        this.transcribeAndAttach(audioUrl, messageId, audioBlob);
      }).catch(() => {
        this.processedAudios.add(audioUrl);
      });
    });
  }

  // Obtiene el blob del audio
  async getAudioBlob(audioUrl) {
    if (audioUrl.startsWith('blob:')) {
      const audioEl = document.querySelector(`${this.AUDIO_SELECTOR}[src="${audioUrl}"]`);
      if (audioEl && audioEl.srcObject) {
        return audioEl.srcObject;
      }
    }
    const resp = await fetch(audioUrl);
    if (!resp.ok) throw new Error('No se pudo obtener el audio');
    return await resp.blob();
  }

  // Llama a la API de transcripción y actualiza el chatHistory
  async transcribeAndAttach(audioUrl, messageId, audioBlob) {
    if (!window.apiClient || typeof window.apiClient.transcribeAudio !== 'function') return;
    if (!audioBlob) return;

    try {
      const transcription = await window.apiClient.transcribeAudio(audioBlob);

      if (window.chatManager && window.chatManager.chatHistory) {
        for (const [chatId, chatData] of window.chatManager.chatHistory.entries()) {
          const msg = chatData.messages.find(m =>
            (m.id && m.id === messageId) ||
            (m.content && m.content.audioUrl === audioUrl)
          );
          if (msg && msg.content) {
            msg.content.transcribedAudio = transcription;
            if (msg.content.text) {
              msg.content.text += `\n[Audio Transcription: ${transcription}]`;
            } else {
              msg.content.text = `[Audio Transcription: ${transcription}]`;
            }
          }
        }
      }
    } catch (e) {
      // Silenciar errores de transcripción
    }
  }

  // Inicializa el observer para detectar nuevos audios dinámicamente
  init() {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      this.scanAndAssociateAudios();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.scanAndAssociateAudios();
  }
}

// Instancia global
window.audioTranscriber = new AudioAssociation();
