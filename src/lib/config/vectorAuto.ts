/** Vectorización automática (worker + OpenAI). Desactivada hasta que el pipeline esté listo. */
export function isVectorAutoEnabled(): boolean {
  const raw = import.meta.env.VITE_VECTOR_AUTO_ENABLED;
  return raw === 'true' || raw === '1';
}

export function vectorizationStateAfterBaseUpload(): 'BASE' | 'EN_PROCESO' {
  return isVectorAutoEnabled() ? 'EN_PROCESO' : 'BASE';
}
