import { useCallback } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 'success' | 'notification' | 'complete';

// Hook para reproducir sonidos
export function useSound() {
  const playSound = useCallback((type: SoundType) => {
    try {
      // Crear un contexto de audio si no existe
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Configuración de sonidos usando Web Audio API
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Configurar según el tipo de sonido
      switch (type) {
        case 'success':
          // Sonido de éxito: tono ascendente agradable
          oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
          
        case 'notification':
          // Sonido de notificación: doble tono
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + 0.2);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;
          
        case 'complete':
          // Sonido de completado: acorde ascendente
          oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.15);
          oscillator.frequency.exponentialRampToValueAtTime(900, audioContext.currentTime + 0.3);
          gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
          break;
      }
    } catch (error) {
      // Silenciosamente fallar si el audio no está disponible
      console.warn('No se pudo reproducir el sonido:', error);
    }
  }, []);

  return { playSound };
}

