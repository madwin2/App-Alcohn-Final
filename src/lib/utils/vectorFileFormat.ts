/** Extensión con punto, en minúsculas (ej. `.svg`). Vacío si no hay. */
export function getFileExtension(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return `.${name.slice(dot + 1).toLowerCase()}`;
}

export function isSvgFileName(fileName: string): boolean {
  return getFileExtension(fileName) === '.svg';
}

/** Etiqueta legible del formato (SVG, EPS, PDF, AI, PNG, …). */
export function vectorFormatLabel(fileName: string): string {
  const ext = getFileExtension(fileName).replace(/^\./, '');
  if (!ext) return 'desconocido';
  return ext.toUpperCase();
}
