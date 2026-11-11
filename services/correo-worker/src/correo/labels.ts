import { loadConfig } from '../config.js';
import { correoRequest, parseJsonBody } from '../http-client.js';
import type { LabelFormat, LabelItemResult } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(rec: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function normalizeLabelItem(raw: unknown, fallbackTn: string): LabelItemResult {
  const rec = asRecord(raw) ?? {};
  const trackingNumber = pickString(rec, ['trackingNumber', 'tracking_number']) || fallbackTn;
  const fileBase64 = pickString(rec, ['fileBase64', 'file_base64', 'filebase64']);
  const fileName = pickString(rec, ['fileName', 'filename', 'file_name']);
  const result = pickString(rec, ['result', 'status']) || (fileBase64 ? 'OK' : 'ERROR');
  const ok = /^ok$/i.test(result.trim()) || result.trim().toUpperCase().startsWith('OK');
  return { trackingNumber, fileBase64, fileName, result, ok };
}

export async function getLabels(
  trackingNumbers: string[],
  labelFormat?: LabelFormat,
): Promise<LabelItemResult[]> {
  const config = loadConfig();
  const format = labelFormat ?? (config.labelFormat as LabelFormat);
  const body = trackingNumbers.map((tn) => ({
    sellerId: config.agreement,
    trackingNumber: tn,
  }));

  const query = format ? { labelFormat: format } : undefined;

  const response = await correoRequest({
    method: 'POST',
    path: '/v1/labels',
    query,
    body,
    dumpName: 'labels',
  });

  const parsed = parseJsonBody<unknown>(response.rawBody, '/v1/labels');
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

  return trackingNumbers.map((tn, index) => normalizeLabelItem(list[index], tn));
}
