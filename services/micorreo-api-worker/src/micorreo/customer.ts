import { loadConfig } from '../config.js';
import { apiRequest, parseJsonBody } from '../http-client.js';
import type { CustomerResult } from '../types.js';

export async function validateCustomer(email?: string, password?: string): Promise<CustomerResult> {
  const config = loadConfig();
  const usedEmail = (email ?? config.accountEmail).trim();
  const usedPassword = password ?? config.accountPassword;
  if (!usedEmail || !usedPassword) {
    throw new Error(
      'Faltan MICORREO_ACCOUNT_EMAIL y MICORREO_ACCOUNT_PASSWORD (cuenta MiCorreo, no las de API).',
    );
  }

  const response = await apiRequest({
    method: 'POST',
    path: '/users/validate',
    body: { email: usedEmail, password: usedPassword },
    dumpName: 'users-validate',
  });

  const parsed = parseJsonBody<Record<string, unknown>>(response.rawBody, '/users/validate') ?? {};
  const customerId = typeof parsed.customerId === 'string' ? parsed.customerId.trim() : '';
  if (!customerId) {
    throw new Error('La API no devolvió customerId en /users/validate.');
  }
  return {
    customerId,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
  };
}

export async function resolveCustomerId(): Promise<string> {
  const config = loadConfig();
  if (config.customerId) return config.customerId;
  const result = await validateCustomer();
  return result.customerId;
}
