/** Parámetros de Vectorizer.AI para logos negros sobre fondo blanco (sin fondo en la salida).
 *  Debe coincidir con api/_vectorizerPreset.js — el servidor es la autoridad.
 */
export const ALCOHN_PRESET: Record<string, string> = {
  'input.max_pixels': '3145828',
  'processing.max_colors': '2',
  'processing.palette': '#000000; #FFFFFF -> #00000000 ~ 0.12;',
  'processing.shapes.min_area_px': '3',
  'output.draw_style': 'fill_shapes',
  'output.shape_stacking': 'cutouts',
  'output.group_by': 'none',
  'output.gap_filler.enabled': 'false',
  'output.curves.allowed.quadratic_bezier': 'true',
  'output.curves.allowed.cubic_bezier': 'true',
  'output.curves.allowed.circular_arc': 'true',
  'output.curves.allowed.elliptical_arc': 'true',
  'output.curves.line_fit_tolerance': '0.05',
  'output.file_format': 'svg',
  'output.svg.version': 'svg_1_1',
  'output.svg.fixed_size': 'false',
  'policy.retention_days': '0',
};

export const ALLOWED_OVERRIDES = [
  'processing.palette',
  'processing.shapes.min_area_px',
  'output.curves.line_fit_tolerance',
] as const;

export type VectorizeMode = 'production' | 'preview' | 'test';
