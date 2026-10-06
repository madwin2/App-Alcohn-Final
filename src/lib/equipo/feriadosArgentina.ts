/**
 * Fuente pública de feriados nacionales (ArgentinaDatos).
 * Verificado 2026-10-02: GET https://api.argentinadatos.com/v1/feriados/{año}
 * Respuesta: [{ fecha, tipo, nombre }], CORS Access-Control-Allow-Origin: *.
 */

export type FeriadoApiItem = {
  fecha: string;
  tipo: string;
  nombre: string;
};

const BASE = 'https://api.argentinadatos.com/v1/feriados';

export async function fetchFeriadosNacionalesApi(anio: number): Promise<FeriadoApiItem[]> {
  const res = await fetch(`${BASE}/${anio}`);
  if (!res.ok) {
    throw new Error(`No se pudieron traer los feriados de ${anio} (${res.status})`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('La API de feriados devolvió un formato inesperado');
  }
  return data
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const fecha = typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : '';
      const nombre = typeof r.nombre === 'string' ? r.nombre.trim() : '';
      const tipo = typeof r.tipo === 'string' ? r.tipo : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !nombre) return null;
      return { fecha, tipo, nombre };
    })
    .filter((x): x is FeriadoApiItem => x != null);
}
