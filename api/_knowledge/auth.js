/**
 * Autenticación para /api/knowledge.
 * Verifica el JWT de Supabase y que el usuario esté APROBADO.
 * Rechaza la cuenta FBTEST.
 */

const FB_TEST_EMAIL = 'fbtest@alcohn.app';

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ ok: true, user: { id: string, email: string } } | { ok: false, status: number, error: string }>}
 */
export async function requireApprovedUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, error: 'Sesión requerida' };
  }
  const token = match[1].trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Sesión requerida' };
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 503, error: 'Autenticación no configurada en el servidor' };
  }

  let userRes;
  try {
    userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
  } catch {
    return { ok: false, status: 503, error: 'No se pudo verificar la sesión' };
  }

  if (!userRes.ok) {
    return { ok: false, status: 401, error: 'Sesión inválida o vencida' };
  }

  const user = await userRes.json();
  const userId = user?.id;
  const email = String(user?.email || '').trim().toLowerCase();
  if (!userId || !email) {
    return { ok: false, status: 401, error: 'Sesión inválida' };
  }

  if (email === FB_TEST_EMAIL) {
    return { ok: false, status: 403, error: 'Esta cuenta no tiene acceso al Centro Alcohn' };
  }

  let approvalRes;
  try {
    const url = `${supabaseUrl}/rest/v1/solicitudes_registro?user_id=eq.${encodeURIComponent(userId)}&select=estado&limit=1`;
    approvalRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        Prefer: 'count=exact',
      },
    });
  } catch {
    return { ok: false, status: 503, error: 'No se pudo verificar la autorización' };
  }

  if (!approvalRes.ok) {
    return { ok: false, status: 403, error: 'No autorizado' };
  }

  const rows = await approvalRes.json();
  const estado = Array.isArray(rows) ? rows[0]?.estado : null;
  if (estado !== 'APROBADO') {
    return { ok: false, status: 403, error: 'Cuenta no aprobada' };
  }

  return { ok: true, user: { id: userId, email } };
}
