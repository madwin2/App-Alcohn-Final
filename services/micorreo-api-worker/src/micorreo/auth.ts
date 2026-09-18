import { fetchNewToken, getTokenInfo, maskToken } from '../token-store.js';
import type { TokenResult } from '../types.js';

export async function getAuthToken(force = false): Promise<TokenResult> {
  return getTokenInfo(force);
}

export async function refreshAuthToken(): Promise<TokenResult> {
  return fetchNewToken();
}

export { maskToken };
