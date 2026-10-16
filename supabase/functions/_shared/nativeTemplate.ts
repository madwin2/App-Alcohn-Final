/** Lectura acotada del archivo nativo v3 exportado por Aspire 10.514. Nunca ejecuta ni modifica su contenido. */
export type NativeTemplatePurpose = 'automatic' | 'fine_full' | 'fine_internal' | 'food_perimeter';
export function isNativeTemplateFilename(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 160 && Array.from(value).every((c) => c.charCodeAt(0) >= 32)
    && /^[^<>:"/\\|?*]+\.ToolpathTemplate$/i.test(value);
}
export interface NativeSelector { automatic: boolean; onlyOnLayers: boolean; open: boolean; closed: boolean; layers: string[];
  toolpathType?: string; startDepthMm?: number; cutDepthMm?: number }
export interface NativeTemplateInspection { selectors: NativeSelector[]; issues: string[]; stage?: number; subOrder?: number }
export function inspectNativeTemplate(bytes: Uint8Array, purpose: NativeTemplatePurpose = 'automatic'): NativeTemplateInspection {
  const issues: string[] = [], selectors: NativeSelector[] = [];
  const fail = (message: string) => ({ selectors, issues: [message] });
  if (bytes.length < 24 || bytes.length > 5 * 1024 * 1024) return fail('Archivo de plantilla vacío o demasiado grande.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = new TextDecoder('latin1').decode(bytes.subarray(0, 80));
  if (view.getUint32(0, true) !== 3 || !ascii.includes('mcTemplateTree')) return fail('Formato de plantilla no reconocido; exportala desde Aspire 10.5.');
  let selector: Record<string, unknown> | undefined;
  let operation: Record<string, unknown> = {};
  let stage: number | undefined;
  const types: string[] = [];
  const finish = () => {
    if (!selector) return;
    const count = selector._vcgfNumLayers;
    const layers = typeof count === 'number' && count >= 0 && count <= 50
      ? Array.from({ length: count }, (_, i) => selector![`_vcgfLayerName${i}`]).filter((v): v is string => typeof v === 'string' && !!v) : [];
    selectors.push({ automatic: selector._vcgfFilterUsed === true, onlyOnLayers: selector._vcgfOnlyOnLayers === true,
      open: selector._vcgfSelectOpen === true, closed: selector._vcgfSelectClosed === true, layers,
      ...(typeof selector.ToolpathType === 'string' ? { toolpathType: selector.ToolpathType } : {}),
      ...(typeof selector._ppdStartDepth === 'number' ? { startDepthMm: selector._ppdStartDepth } : {}),
      ...(typeof selector._ppdCutDepth === 'number' ? { cutDepthMm: selector._ppdCutDepth } : {}) });
    if (selector._vcgfVersion !== 3 || layers.length !== count) issues.push('Selector de vectores incompleto o de versión desconocida.');
  };
  // Cada parámetro usa nombre MFC UTF-16 y tipo explícito. Solo se leen claves conocidas del selector.
  for (let at = 0; at + 8 < bytes.length; at++) {
    if (bytes[at] !== 255 || bytes[at + 1] !== 254 || bytes[at + 2] !== 255) continue;
    const length = bytes[at + 3], end = at + 4 + length * 2;
    if (end + 4 >= bytes.length) continue;
    const key = new TextDecoder('utf-16le').decode(bytes.subarray(at + 4, end));
    if (stage === undefined && /^\d+\s+\S/.test(key)) stage = Number(key.match(/^\d+/)![0]);
    if (!/^(ToolpathType|_ppd(StartDepth|CutDepth)|_vcgf(Version|FilterUsed|OnlyOnLayers|SelectOpen|SelectClosed|NumLayers|LayerName\d+))$/.test(key)) continue;
    const type = view.getUint32(end, true), start = end + 4;
    let value: unknown;
    if (type === 0 && start + 8 <= bytes.length) value = view.getFloat64(start, true);
    else if (type === 1 && start + 4 <= bytes.length) value = view.getInt32(start, true);
    else if (type === 2 && start < bytes.length && bytes[start] <= 1) value = bytes[start] === 1;
    else if (type === 3 && start + 4 <= bytes.length && bytes[start] === 255 && bytes[start + 1] === 254 && bytes[start + 2] === 255) {
      const last = start + 4 + bytes[start + 3] * 2;
      if (last <= bytes.length) value = new TextDecoder('utf-16le').decode(bytes.subarray(start + 4, last));
    }
    if (key === 'ToolpathType') { if (typeof value === 'string') types.push(value); finish(); selector = undefined; operation = { [key]: value }; }
    else if (key.startsWith('_ppd')) operation[key] = value;
    if (key === '_vcgfVersion') { finish(); selector = { ...operation }; }
    if (selector) selector[key] = value;
  }
  finish();
  if (selectors.length === 1 && !selectors[0].toolpathType && types.length === 1) selectors[0].toolpathType = types[0];
  if (purpose === 'food_perimeter') stage = 5; // Corte Forma de la base C, después del repaso (Q-PROG-022).
  if (!selectors.length) issues.push('La plantilla no contiene selectores comprobables.');
  if (selectors.length > 1) issues.push('Exportá una trayectoria por plantilla para comprobar su selección y orden de ejecución.');
  if (stage === undefined || !Number.isInteger(stage) || stage < 0 || stage > 99) issues.push('La trayectoria debe conservar el número de etapa de la base (0 Taladrado, 1 Planeado, etc.).');
  if (purpose === 'automatic') {
    for (const s of selectors) if (!s.automatic || !s.onlyOnLayers || !s.layers.length || !s.open && !s.closed)
      issues.push('Hay trayectorias con selección manual o sin capas automáticas; cargá el perfilado fino en su campo de repaso.');
  } else if (selectors.length !== 1 || selectors[0].automatic
    || selectors[0].toolpathType !== (purpose === 'fine_internal' ? 'Profile Inside' : 'Profile Outside')
    || Math.abs((selectors[0].startDepthMm ?? NaN) - (purpose === 'food_perimeter' ? 3.5 : 0.5)) > 0.001 || !Number.isFinite(selectors[0].startDepthMm)
    || Math.abs((selectors[0].cutDepthMm ?? NaN) - (purpose === 'food_perimeter' ? 5.5 : 0.6)) > 0.001 || !Number.isFinite(selectors[0].cutDepthMm)) {
    issues.push(purpose === 'food_perimeter' ? 'El perímetro requiere el perfilado exterior manual de la base C: inicio 3,5 mm y pasada 5,5 mm.'
      : 'El repaso requiere una única operación manual del tipo indicado, inicio 0,5 mm y pasada 0,6 mm, según la base C confirmada.');
  }
  // La base C comparte etapa 1 entre planeado y cajeado. El selector de
  // Planeado identifica su prioridad; el orden de los archivos no la prueba.
  const subOrder = selectors[0]?.toolpathType === 'Thread' || stage === 1 && !selectors.some((s) => s.layers.includes('Planeado'))
    || purpose === 'fine_internal' || purpose === 'food_perimeter' ? 1 : 0;
  return { selectors, issues: [...new Set(issues)], ...(stage !== undefined ? { stage } : {}), subOrder };
}

/** Q-PROG-022: conserva la receta 3MM y adapta solamente sus capas para Alimento. */
export function foodSelectorLayers(inspection: NativeTemplateInspection): string[] | undefined {
  const layers = inspection.selectors[0]?.layers ?? [];
  const mapped = layers.map((name) => name === 'VECTOR 3MM' ? 'VECTOR ALIMENTO'
    : name === 'Offset exterior vector 3mm' ? 'Offset exterior vector alimento' : name);
  return mapped.some((name, index) => name !== layers[index]) ? mapped : undefined;
}
