/**
 * Revisión de links programada (hora Argentina), opcional: `ANDREANI_CHECK_LINKS_HOURS="10,14,18"`.
 * Apagada por defecto (Q-AND-005): el túnel de oficina se abre a mano y a veces se cae, así que
 * la revisión corre como primer paso de "Traer etiquetas".
 */

const TZ = 'America/Argentina/Buenos_Aires';

export function parseScheduleHours(raw: string | undefined): number[] {
  const value = (raw ?? '').trim();
  if (!value || /^(off|no|false|ninguna)$/i.test(value)) return [];
  const hours = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return [...new Set(hours)].sort((a, b) => a - b);
}

/** "AAAA-MM-DD HH" (hora Argentina) si `now` cae en una hora programada; si no, null. */
export function scheduleSlot(now: Date, hours: number[]): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  if (!hours.includes(Number(get('hour')))) return null;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}`;
}

export function startCheckLinksSchedule(hours: number[], run: () => Promise<{ message: string }>): void {
  if (!hours.length) {
    console.log('[andreani-worker] revisión de links programada: apagada');
    return;
  }
  let lastSlot: string | null = null;
  const tick = () => {
    const slot = scheduleSlot(new Date(), hours);
    if (!slot || slot === lastSlot) return;
    lastSlot = slot;
    console.log(`[andreani-worker] revisión de links programada (${slot} AR)`);
    void run()
      .then((result) => console.log(`[andreani-worker] check-links programado: ${result.message}`))
      .catch((error) =>
        console.error(
          '[andreani-worker] check-links programado error:',
          error instanceof Error ? error.message : error,
        ),
      );
  };
  setInterval(tick, 60_000).unref();
  console.log(`[andreani-worker] revisión de links programada: ${hours.map((h) => `${h} h`).join(', ')} (AR)`);
}
