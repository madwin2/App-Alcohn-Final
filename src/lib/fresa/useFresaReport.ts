import { useEffect, useState } from 'react';
import { chequearSvg, type FresaReport, type FresaTarget } from './chequeoFresa';

/**
 * Chequeo de fresa de un SVG en memoria. Devuelve null mientras analiza.
 * `target` null = todavía no se sabe la medida (no analiza).
 */
export function useFresaReport(svgText: string | null | undefined, target: FresaTarget | null): FresaReport | null {
  const [report, setReport] = useState<FresaReport | null>(null);
  // La clave de texto evita re-analizar cuando el objeto `target` cambia de identidad.
  const targetKey = target ? JSON.stringify(target) : null;
  useEffect(() => {
    setReport(null);
    if (!svgText || !targetKey) return;
    let alive = true;
    void chequearSvg(svgText, JSON.parse(targetKey) as FresaTarget).then((r) => {
      if (alive) setReport(r);
    });
    return () => {
      alive = false;
    };
  }, [svgText, targetKey]);
  return report;
}

const textCache = new Map<string, Promise<string>>();

/** Baja el texto de un SVG guardado (cacheado por URL). */
export function fetchSvgText(url: string): Promise<string> {
  const hit = textCache.get(url);
  if (hit) return hit;
  const p = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`No se pudo bajar el vector (${res.status}).`);
    return res.text();
  });
  textCache.set(url, p);
  p.catch(() => textCache.delete(url));
  if (textCache.size > 300) textCache.delete(textCache.keys().next().value as string);
  return p;
}

/** Olvida el texto cacheado de una URL (por ejemplo, después de reemplazar el vector). */
export function forgetSvgText(url: string): void {
  textCache.delete(url);
}

export function isSvgUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.svg(?:$|[?#])/i.test(url);
}

/** Chequeo de un vector guardado (por URL). Solo SVG; el resto devuelve null. */
export function useFresaReportFromUrl(
  url: string | null | undefined,
  target: FresaTarget | null,
  enabled = true,
): { report: FresaReport | null; svgText: string | null; error: string | null } {
  const [svgText, setSvgText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usable = enabled && isSvgUrl(url);
  useEffect(() => {
    setSvgText(null);
    setError(null);
    if (!usable || !url) return;
    let alive = true;
    fetchSvgText(url)
      .then((t) => alive && setSvgText(t))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'No se pudo bajar el vector.'));
    return () => {
      alive = false;
    };
  }, [url, usable]);
  const report = useFresaReport(usable ? svgText : null, usable ? target : null);
  return { report, svgText, error };
}
