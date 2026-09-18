import type { User } from '@supabase/supabase-js';

/** Cuenta de revisión de Meta / Facebook: solo puede usar WhatsApp. */
export const FB_TEST_USERNAME = 'FBTEST';
export const FB_TEST_EMAIL = 'fbtest@alcohn.app';
export const FB_TEST_ALLOWED_PATH = '/whatsapp';

const DEFAULT_POST_LOGIN_PATH = '/pedidos';

export function isFbTestIdentifier(value: string): boolean {
  return value.trim().toUpperCase() === FB_TEST_USERNAME;
}

export function resolveLoginEmail(identifier: string): string {
  return isFbTestIdentifier(identifier) ? FB_TEST_EMAIL : identifier.trim();
}

export function isFbTestUser(user?: Pick<User, 'email'> | { email?: string | null } | null): boolean {
  return (user?.email ?? '').trim().toLowerCase() === FB_TEST_EMAIL.toLowerCase();
}

export function getPostLoginPath(user?: Pick<User, 'email'> | { email?: string | null } | null): string {
  return isFbTestUser(user) ? FB_TEST_ALLOWED_PATH : DEFAULT_POST_LOGIN_PATH;
}

export function isPathAllowedForUser(
  user: Pick<User, 'email'> | { email?: string | null } | null | undefined,
  pathname: string,
): boolean {
  if (!isFbTestUser(user)) return true;
  return pathname === FB_TEST_ALLOWED_PATH || pathname.startsWith(`${FB_TEST_ALLOWED_PATH}/`);
}
