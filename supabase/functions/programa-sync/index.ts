import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-programa-sync-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const LARGO_MAXIMO_MM: Record<string, number> = {
  C: 400,
  G: 250,
  XL: 250,
};

const SYNC_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SyncReport = {
  version?: number;
  gadget_version?: string;
  programa_id?: string;
  token?: string;
  evento_id?: string;
  maquina?: string;
  modo?: string;
  escrito_at?: string;
  sellos_presentes?: string[];
  sellos_importados_ahora?: string[];
  sellos_no_importados?: Array<{ sello_id?: string; motivo?: string; diseno?: string }>;
  sellos_borrados_en_maquina?: Array<{ sello_id?: string; motivo?: string }>;
  sobrantes_no_identificados?: number;
  material_por_planchuela?: Record<string, number>;
  /** Segundos (suma MachiningTime). Se divide por 60 al guardar en maquinado_minutos. */
  maquinado_segundos?: number | null;
  control?: { objetos_en_corte?: number; sellos_tageados?: number };
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const asString = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

const mapStampType = (tipo: string | null | undefined): string => {
  const mapping: Record<string, string> = {
    Clasico: "CLASICO",
    "3mm": "3MM",
    Lacre: "LACRE",
    Alimento: "ALIMENTO",
    ABC: "ABC",
  };
  return tipo ? mapping[tipo] || "CLASICO" : "CLASICO";
};

const vectorUrlFromPreview = (previewUrl: string): string =>
  previewUrl.replace(/_preview\.(png|jpg|jpeg)$/i, ".eps");

const extensionFromUrl = (url: string, fallback: string): string => {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return m ? m[1].toLowerCase() : fallback;
  }
};

const luaEscape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Auth de lectura (listar / paquete): clave de instalación, no el token por programa. */
const assertInstallKey = (req: Request): Response | null => {
  const expected = (Deno.env.get("PROGRAMA_SYNC_KEY") ?? "").trim();
  if (!expected) {
    return jsonResponse(
      { error: "PROGRAMA_SYNC_KEY no configurada en el servidor" },
      500,
    );
  }
  const got = (
    req.headers.get("x-programa-sync-key") ||
    req.headers.get("X-Programa-Sync-Key") ||
    ""
  ).trim();
  if (!got || got !== expected) {
    return jsonResponse({ error: "Clave de instalación inválida" }, 401);
  }
  return null;
};

async function ensureSyncToken(
  supabase: SupabaseClient,
  programId: string,
): Promise<string> {
  const now = new Date();
  const { data: existing } = await supabase
    .from("programa_sync_token")
    .select("token, expires_at")
    .eq("programa_id", programId)
    .maybeSingle();

  if (existing?.token) {
    const exp = new Date(existing.expires_at);
    if (exp > now) return existing.token;
  }

  const token = crypto.randomUUID();
  const expires_at = new Date(now.getTime() + SYNC_TOKEN_TTL_MS).toISOString();
  const { error } = await supabase.from("programa_sync_token").upsert(
    { programa_id: programId, token, expires_at },
    { onConflict: "programa_id" },
  );
  if (error) throw error;
  return token;
}

async function signedVectorUrl(
  supabase: SupabaseClient,
  publicUrl: string,
): Promise<string> {
  const m = publicUrl.match(
    /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/,
  );
  if (!m) return publicUrl;
  const bucket = m[1];
  const path = decodeURIComponent(m[2]);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return publicUrl;
  return data.signedUrl;
}

async function handleListar(
  supabase: SupabaseClient,
  maquina: string,
): Promise<Response> {
  const machine = maquina.toUpperCase();
  if (!["C", "G", "XL"].includes(machine)) {
    return jsonResponse({ error: "maquina inválida (C|G|XL)" }, 400);
  }

  const { data: programas, error } = await supabase
    .from("programa")
    .select("id, nombre, fecha, cantidad_sellos, maquina, estado_programa")
    .eq("maquina", machine)
    .or("estado_programa.is.null,estado_programa.neq.FINALIZADO")
    .not("nombre", "is", null)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("[programa-sync] listar:", error);
    return jsonResponse({ error: "No se pudieron listar programas" }, 500);
  }

  const out = [];
  for (const p of programas ?? []) {
    const nombre = asString(p.nombre);
    if (!nombre) continue;
    let token: string;
    try {
      token = await ensureSyncToken(supabase, p.id);
    } catch (e) {
      console.error("[programa-sync] token listar:", e);
      continue;
    }
    out.push({
      id: p.id,
      nombre,
      fecha: p.fecha ?? null,
      cantidad_sellos: p.cantidad_sellos ?? 0,
      token,
    });
  }

  return jsonResponse({ programas: out });
}

async function handlePaquete(
  supabase: SupabaseClient,
  programId: string,
): Promise<Response> {
  if (!programId) {
    return jsonResponse({ error: "Falta programa_id" }, 400);
  }

  const { data: programa, error: progErr } = await supabase
    .from("programa")
    .select("id, nombre, maquina, fecha, cantidad_sellos, estado_programa")
    .eq("id", programId)
    .maybeSingle();

  if (progErr || !programa) {
    return jsonResponse({ error: "Programa no encontrado" }, 404);
  }
  if (asString(programa.estado_programa) === "FINALIZADO") {
    return jsonResponse({ error: "Programa finalizado" }, 400);
  }

  const { data: sellos, error: sellosErr } = await supabase
    .from("sellos")
    .select(
      "id, diseno, tipo, tipo_planchuela, ancho_real, largo_real, ancho_fabricacion_mm, largo_fabricacion_mm, archivo_vector_preview, created_at",
    )
    .eq("programa_id", programId)
    .order("created_at", { ascending: true });

  if (sellosErr) {
    console.error("[programa-sync] paquete sellos:", sellosErr);
    return jsonResponse({ error: "No se pudieron leer los sellos" }, 500);
  }

  const token = await ensureSyncToken(supabase, programId);
  const maquina = asString(programa.maquina) || "C";
  const largoMax = LARGO_MAXIMO_MM[maquina] ?? null;

  const sellosJson: Array<Record<string, unknown>> = [];
  const vectores: Array<{ archivo: string; url: string }> = [];
  const sellosLua: string[] = [];

  let orden = 0;
  for (const s of sellos ?? []) {
    const preview = asString(s.archivo_vector_preview);
    if (!preview) continue;
    orden += 1;
    const vectorUrl = vectorUrlFromPreview(preview);
    const ext = extensionFromUrl(vectorUrl, "eps");
    const archivo = `vectores/${String(orden).padStart(3, "0")}_${s.id}.${ext}`;
    // Bucket `vector` es público: URL pública directa (sin firmar).
    // signedVectorUrl queda disponible por si algún bucket deja de ser público.

    const anchoFab = s.ancho_fabricacion_mm != null ? Number(s.ancho_fabricacion_mm) : null;
    const largoFab = s.largo_fabricacion_mm != null ? Number(s.largo_fabricacion_mm) : null;
    const anchoCm = s.ancho_real != null ? Number(s.ancho_real) : null;
    const largoCm = s.largo_real != null ? Number(s.largo_real) : null;
    const anchoMm = anchoFab ?? (anchoCm != null ? anchoCm * 10 : 50);
    const largoMm = largoFab ?? (largoCm != null ? largoCm * 10 : 30);
    const tipo = mapStampType(s.tipo);
    const diseno = asString(s.diseno) || "Sin diseño";
    const tipoPlanchuela = s.tipo_planchuela ?? null;
    const templates = [
      `roughing_${tipo.toLowerCase()}.ToolpathTemplate`,
      `profile_${tipo.toLowerCase()}.ToolpathTemplate`,
    ];

    sellosJson.push({
      orden,
      sello_id: s.id,
      diseno,
      archivo,
      ancho_mm: Number(anchoMm.toFixed(1)),
      largo_mm: Number(largoMm.toFixed(1)),
      tipo,
      tipo_planchuela: tipoPlanchuela,
      layer: tipo,
      toolpath_templates: templates,
      url: vectorUrl,
    });
    vectores.push({ archivo, url: vectorUrl });

    const templatesLua = templates.map((t) => `"${t}"`).join(", ");
    sellosLua.push(`    {
      orden = ${orden},
      sello_id = "${s.id}",
      diseno = "${luaEscape(diseno)}",
      archivo = "${archivo}",
      ancho_mm = ${anchoMm.toFixed(1)},
      largo_mm = ${largoMm.toFixed(1)},
      tipo = "${tipo}",
      tipo_planchuela = ${tipoPlanchuela ?? "nil"},
      layer = "${tipo}",
      toolpath_templates = { ${templatesLua} },
    }`);
  }

  const nombre = asString(programa.nombre) || programId;
  const manifest = {
    programa_id: programId,
    token,
    programa_nombre: nombre,
    maquina,
    largo_maximo_mm: largoMax,
    sellos: sellosJson,
  };

  const manifest_lua = `return {
  programa_id = "${programId}",
  token = "${token}",
  programa_nombre = "${luaEscape(nombre)}",
  maquina = "${maquina}",
  largo_maximo_mm = ${largoMax ?? "nil"},
  sellos = {
${sellosLua.join(",\n")}
  },
}
`;

  return jsonResponse({ manifest, manifest_lua, vectores });
}

async function syncEventoAlreadyProcessed(
  supabase: SupabaseClient,
  programId: string,
  eventoId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("programa_eventos")
    .select("id")
    .eq("programa_id", programId)
    .eq("tipo", "SINCRONIZADO")
    .eq("detalle->>evento_id", eventoId)
    .maybeSingle();

  if (error) {
    console.error("[programa-sync] idempotencia:", error);
    return false;
  }
  return Boolean(data?.id);
}

async function releaseStampBorradoEnMaquina(
  supabase: SupabaseClient,
  programId: string,
  selloId: string,
  motivo: string,
): Promise<boolean> {
  const { data: sello, error } = await supabase
    .from("sellos")
    .select("id, programa_id, estado_fabricacion_previo")
    .eq("id", selloId)
    .maybeSingle();

  if (error || !sello || sello.programa_id !== programId) {
    console.warn("[programa-sync] sello borrado ignorado", { selloId, programId, error });
    return false;
  }

  const nextState = (sello as { estado_fabricacion_previo?: string | null })
    .estado_fabricacion_previo || "Sin Hacer";

  const { error: updErr } = await supabase
    .from("sellos")
    .update({
      programa_id: null,
      estado_fabricacion_previo: null,
      estado_fabricacion: nextState,
      estado_aspire: null,
      maquina: null,
      motivo_salida_programa: motivo || "SIN_MATERIAL",
      updated_at: new Date().toISOString(),
    })
    .eq("id", selloId);

  if (updErr) {
    console.error("[programa-sync] liberar sello:", updErr);
    return false;
  }

  await supabase.from("programa_eventos").insert({
    programa_id: programId,
    tipo: "SELLO_BORRADO_EN_MAQUINA",
    detalle: { sello_id: selloId, motivo: motivo || "SIN_MATERIAL" },
    usuario_email: null,
  });

  return true;
}

async function refreshProgramStampCount(
  supabase: SupabaseClient,
  programId: string,
): Promise<void> {
  const { count, error } = await supabase
    .from("sellos")
    .select("id", { count: "exact", head: true })
    .eq("programa_id", programId);

  if (error) {
    console.error("[programa-sync] contar sellos:", error);
    return;
  }

  await supabase
    .from("programa")
    .update({
      cantidad_sellos: count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", programId);
}

async function recordSelloNoImportado(
  supabase: SupabaseClient,
  programId: string,
  programName: string,
  item: { sello_id?: string; motivo?: string; diseno?: string },
): Promise<void> {
  const selloId = asString(item.sello_id);
  if (!selloId) return;

  const diseno = asString(item.diseno) || selloId;
  const motivo = asString(item.motivo) || "No importado";

  await supabase
    .from("sellos")
    .update({
      no_importado_motivo: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", selloId);

  await supabase.from("programa_eventos").insert({
    programa_id: programId,
    tipo: "SELLO_NO_IMPORTADO",
    detalle: { sello_id: selloId, diseno, motivo },
    usuario_email: null,
  });

  await supabase.rpc("emitir_notificacion", {
    p_tipo: "p7_sello_no_importado",
    p_area: "produccion",
    p_autor_id: null,
    p_autor_nombre: null,
    p_titulo: `No entró al Aspire: ${diseno} — ${programName}`,
    p_cuerpo: motivo,
    p_entidad_tipo: "programa",
    p_entidad_id: programId,
    p_link_path: "/programas",
    p_severidad: "warning",
    p_dedup_key: `sello_no_importado:${programId}:${selloId}`,
    p_metadata: {
      diseno,
      motivo,
      selloId,
      programName,
    },
    p_user_ids: null,
  });
}

async function clearNoImportadoMotivo(
  supabase: SupabaseClient,
  selloIds: string[],
): Promise<void> {
  const ids = selloIds.map((id) => asString(id)).filter(Boolean);
  if (!ids.length) return;
  const { error } = await supabase
    .from("sellos")
    .update({
      no_importado_motivo: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) {
    console.error("[programa-sync] clear no_importado_motivo:", error);
  }
}

async function handlePostReport(
  supabase: SupabaseClient,
  payload: SyncReport,
): Promise<Response> {
  const programId = asString(payload.programa_id);
  const token = asString(payload.token);
  const eventoId = asString(payload.evento_id);

  if (!programId || !token || !eventoId) {
    return jsonResponse({ error: "Faltan programa_id, token o evento_id" }, 400);
  }

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("programa_sync_token")
    .select("programa_id, token, expires_at")
    .eq("programa_id", programId)
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return jsonResponse({ error: "Token inválido" }, 401);
  }

  const expiresAt = new Date(tokenRow.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return jsonResponse({ error: "Token vencido" }, 401);
  }

  const { data: programa, error: progErr } = await supabase
    .from("programa")
    .select("id, nombre")
    .eq("id", programId)
    .maybeSingle();

  if (progErr || !programa) {
    return jsonResponse({ error: "Programa no encontrado" }, 404);
  }

  if (await syncEventoAlreadyProcessed(supabase, programId, eventoId)) {
    return jsonResponse({ ok: true, duplicate: true });
  }

  const now = new Date().toISOString();
  let maquinadoMinutos: number | null = null;
  if (payload.maquinado_segundos !== null && payload.maquinado_segundos !== undefined) {
    const raw = Number(payload.maquinado_segundos);
    if (Number.isFinite(raw)) {
      maquinadoMinutos = Math.round((raw / 60) * 100) / 100;
    }
  }

  const { error: syncUpdErr } = await supabase
    .from("programa")
    .update({
      sync_at: now,
      sync_origen: "GADGET",
      sync_payload: payload,
      maquinado_minutos: maquinadoMinutos,
      material_real_por_planchuela: payload.material_por_planchuela ?? null,
      updated_at: now,
    })
    .eq("id", programId);

  if (syncUpdErr) {
    console.error("[programa-sync] update programa:", syncUpdErr);
    return jsonResponse({ error: "No se pudo guardar la sincronización" }, 500);
  }

  await supabase.from("programa_eventos").insert({
    programa_id: programId,
    tipo: "SINCRONIZADO",
    detalle: {
      evento_id: eventoId,
      origen: "GADGET",
      modo: payload.modo ?? null,
      maquina: payload.maquina ?? null,
      control: payload.control ?? null,
    },
    usuario_email: null,
  });

  let released = 0;
  for (const row of payload.sellos_borrados_en_maquina ?? []) {
    const selloId = asString(row.sello_id);
    if (!selloId) continue;
    const motivo = asString(row.motivo) || "SIN_MATERIAL";
    const ok = await releaseStampBorradoEnMaquina(supabase, programId, selloId, motivo);
    if (ok) released += 1;
  }
  if (released > 0) {
    await refreshProgramStampCount(supabase, programId);
  }

  const programName = asString(programa.nombre) || programId;
  for (const item of payload.sellos_no_importados ?? []) {
    await recordSelloNoImportado(supabase, programId, programName, item);
  }

  await clearNoImportadoMotivo(
    supabase,
    (payload.sellos_importados_ahora ?? []).map((id) => asString(id)),
  );

  return jsonResponse({
    ok: true,
    sellos_liberados: released,
    sellos_no_importados: (payload.sellos_no_importados ?? []).length,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Configuración del servidor incompleta" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const accion = asString(url.searchParams.get("accion"));

  if (req.method === "GET") {
    const authErr = assertInstallKey(req);
    if (authErr) return authErr;

    if (accion === "listar") {
      return handleListar(supabase, asString(url.searchParams.get("maquina")));
    }
    if (accion === "paquete") {
      return handlePaquete(supabase, asString(url.searchParams.get("programa_id")));
    }
    return jsonResponse({ error: "accion desconocida (listar|paquete)" }, 400);
  }

  if (req.method === "POST") {
    // Mutaciones: token por programa en el body (sin install key).
    let payload: SyncReport;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "JSON inválido" }, 400);
    }
    return handlePostReport(supabase, payload);
  }

  return jsonResponse({ error: "Método no permitido" }, 405);
});
