export function vectorUrlFromPreview(previewUrl?: string | null): string | undefined {
  if (!previewUrl) return undefined;
  return String(previewUrl).replace(/_preview\.(png|jpg|jpeg)$/i, '.eps');
}
