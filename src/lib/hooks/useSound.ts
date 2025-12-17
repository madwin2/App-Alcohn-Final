import { useCallback } from 'react';

// Tipos de sonidos disponibles
export type SoundType = 'success' | 'notification' | 'complete' | 'transfer';

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
          
        case 'transfer':
          // Sonido satisfactorio de transferencia/dinero: acorde rico y ascendente
          // Crear múltiples osciladores para un sonido más rico
          const osc1 = audioContext.createOscillator();
          const osc2 = audioContext.createOscillator();
          const osc3 = audioContext.createOscillator();
          const gain1 = audioContext.createGain();
          const gain2 = audioContext.createGain();
          const gain3 = audioContext.createGain();
          
          // Acorde mayor (Do-Mi-Sol) para sonido satisfactorio
          osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // Do5
          osc2.frequency.setValueAtTime(659.25, audioContext.currentTime); // Mi5
          osc3.frequency.setValueAtTime(783.99, audioContext.currentTime); // Sol5
          
          // Rampa ascendente para efecto "cha-ching"
          osc1.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.2);
          osc2.frequency.exponentialRampToValueAtTime(783.99, audioContext.currentTime + 0.2);
          osc3.frequency.exponentialRampToValueAtTime(987.77, audioContext.currentTime + 0.2);
          
          // Ganancia con fade out suave
          gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
          gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          gain2.gain.setValueAtTime(0.15, audioContext.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          gain3.gain.setValueAtTime(0.1, audioContext.currentTime);
          gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          
          osc1.connect(gain1);
          osc2.connect(gain2);
          osc3.connect(gain3);
          gain1.connect(audioContext.destination);
          gain2.connect(audioContext.destination);
          gain3.connect(audioContext.destination);
          
          osc1.start(audioContext.currentTime);
          osc1.stop(audioContext.currentTime + 0.4);
          osc2.start(audioContext.currentTime);
          osc2.stop(audioContext.currentTime + 0.4);
          osc3.start(audioContext.currentTime);
          osc3.stop(audioContext.currentTime + 0.4);
          break;
      }
    } catch (error) {
      // Silenciosamente fallar si el audio no está disponible
      console.warn('No se pudo reproducir el sonido:', error);
    }
  }, []);

  return { playSound };
}

