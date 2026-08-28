/**
 * Diagnóstico: ¿los pedidos que pasan a "Despachado" reciben el WhatsApp
 * de seguimiento (y pasan a "Seguimiento Enviado")?
 *
 * Uso: npx tsx src/scripts/diag-despacho-whatsapp.ts
 */
import { getSupabase } from '../supabase.js';

const supabase = getSupabase();

const { data: rows, error } = await supabase
  .from('ordenes')
  .select('id, estado_envio, seguimiento, updated_at, cliente_id, clientes(nombre, apellido, telefono)')
  .in('estado_envio', ['Despachado', 'Seguimiento Enviado'])
  .order('updated_at', { ascending: false })
  .limit(40);

if (error) throw error;

const despachado = (rows ?? []).filter((r) => r.estado_envio === 'Despachado');
const enviado = (rows ?? []).filter((r) => r.estado_envio === 'Seguimiento Enviado');

console.log(`\n=== ESTADOS (últimos 40 por updated_at) ===`);
console.log(`Despachado (WhatsApp NO confirmado): ${despachado.length}`);
console.log(`Seguimiento Enviado (WhatsApp OK):   ${enviado.length}`);

const fmt = (r: Record<string, unknown>) => {
  const c = (r.clientes ?? {}) as Record<string, unknown>;
  const tel = c.telefono ? String(c.telefono) : '(sin tel)';
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ') || '(sin nombre)';
  return `${String(r.id).slice(0, 8)} · ${String(r.seguimiento ?? '(sin seg)')} · ${nombre} · ${tel} · ${String(r.updated_at).slice(0, 19)}`;
};

console.log(`\n--- En "Despachado" (esperando o sin WhatsApp) ---`);
for (const r of despachado) console.log(fmt(r as Record<string, unknown>));

console.log(`\n--- En "Seguimiento Enviado" (ya avisados) ---`);
for (const r of enviado.slice(0, 10)) console.log(fmt(r as Record<string, unknown>));

const { data: logs, error: logErr } = await supabase
  .from('webhook_logs')
  .select('created_at, tipo_actualizacion, numero_telefono, success, status_code, error_message')
  .order('created_at', { ascending: false })
  .limit(15);

console.log(`\n=== webhook_logs (últimos 15) ===`);
if (logErr) {
  console.log(`No se pudo leer webhook_logs: ${logErr.message}`);
} else if (!logs?.length) {
  console.log('(vacío)');
} else {
  for (const l of logs) {
    console.log(
      `${String(l.created_at).slice(0, 19)} · ${l.tipo_actualizacion} · ${l.numero_telefono} · success=${l.success} · code=${l.status_code} ${l.error_message ? `· ${l.error_message}` : ''}`,
    );
  }
}
