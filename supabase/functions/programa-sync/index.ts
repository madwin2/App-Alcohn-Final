import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as CFB from "npm:cfb@1.2.2";
import { unzipSync } from "npm:fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-programa-sync-key, x-programa-id, x-programa-token, x-filename",
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

type UploadRequest = {
  accion?: string;
  programa_id?: string;
  token?: string;
  filename?: string;
  path?: string;
  /** Tamaño en bytes (hint del gadget). Si es grande, no bajamos el archivo a la edge. */
  size?: number;
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

async function assertProgramToken(
  supabase: SupabaseClient,
  programId: string,
  token: string,
): Promise<Response | null> {
  if (!programId || !token) {
    return jsonResponse({ error: "Faltan programa_id o token" }, 400);
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

  return null;
}

const safeAspireFilename = (name: string): string => {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
  const lower = cleaned.toLowerCase();
  if (
    lower.endsWith(".crv3d") ||
    lower.endsWith(".crv") ||
    lower.endsWith(".zip")
  ) {
    return cleaned.slice(0, 160);
  }
  return `${(cleaned || "programa").slice(0, 140)}.crv3d`;
};

const OLE2_MAGIC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b]); // PK

const isZipBytes = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];

/** Si llegó un .zip (gadget comprime .crv3d grandes), extrae el .crv3d. */
function resolveCrv3dBytes(
  bytes: Uint8Array,
  filename: string,
): { bytes: Uint8Array; filename: string } {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".zip") && !isZipBytes(bytes)) {
    return { bytes, filename };
  }
  try {
    const files = unzipSync(bytes);
    for (const [name, data] of Object.entries(files)) {
      if (
        name.toLowerCase().endsWith(".crv3d") &&
        data &&
        data.byteLength > 100
      ) {
        const base =
          name.split(/[/\\]/).pop() ||
          filename.replace(/\.zip$/i, ".crv3d") ||
          "programa.crv3d";
        return { bytes: data, filename: safeAspireFilename(base) };
      }
    }
  } catch (e) {
    console.warn("[programa-sync] unzip falló:", e);
  }
  throw new Error("ZIP sin .crv3d válido");
}

function extractPreviewGif(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8) return null;
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== OLE2_MAGIC[i]) return null;
  }

  try {
    const cfb = CFB.parse(bytes);
    const candidates = [
      "PreviewData/Preview2D_GIF",
      "/PreviewData/Preview2D_GIF",
      "Root Entry/PreviewData/Preview2D_GIF",
      "PreviewData\\Preview2D_GIF",
      "\\PreviewData\\Preview2D_GIF",
    ];
    for (const candidate of candidates) {
      const entry = CFB.find(cfb, candidate);
      if (!entry?.content || !(entry.size > 0)) continue;
      const content = entry.content;
      if (content instanceof Uint8Array) return content;
      if (Array.isArray(content)) return new Uint8Array(content as number[]);
      if (content instanceof ArrayBuffer) return new Uint8Array(content);
    }
  } catch (e) {
    console.warn("[programa-sync] no se pudo extraer preview:", e);
  }
  return null;
}

async function handlePedirUpload(
  supabase: SupabaseClient,
  payload: UploadRequest,
): Promise<Response> {
  const programId = asString(payload.programa_id);
  const token = asString(payload.token);
  const authErr = await assertProgramToken(supabase, programId, token);
  if (authErr) return authErr;

  const { data: programa, error: progErr } = await supabase
    .from("programa")
    .select("id, nombre")
    .eq("id", programId)
    .maybeSingle();

  if (progErr || !programa) {
    return jsonResponse({ error: "Programa no encontrado" }, 404);
  }

  const filename = safeAspireFilename(
    asString(payload.filename) || `${asString(programa.nombre) || "programa"}.crv3d`,
  );
  const path = `${programId}/${Date.now()}-${filename}`;

  const { data, error } = await supabase.storage
    .from("programas-aspire")
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data?.signedUrl) {
    console.error("[programa-sync] createSignedUploadUrl:", error);
    return jsonResponse({ error: "No se pudo preparar la subida" }, 500);
  }

  return jsonResponse({
    ok: true,
    path: data.path || path,
    signedUrl: data.signedUrl,
    token: data.token ?? null,
    filename,
  });
}

async function handleConfirmarUpload(
  supabase: SupabaseClient,
  payload: UploadRequest,
): Promise<Response> {
  const programId = asString(payload.programa_id);
  const token = asString(payload.token);
  const storagePath = asString(payload.path);
  const filename = safeAspireFilename(asString(payload.filename) || "programa.crv3d");
  const sizeHint = Number(payload.size);
  const knownSize = Number.isFinite(sizeHint) && sizeHint > 0 ? sizeHint : 0;

  const authErr = await assertProgramToken(supabase, programId, token);
  if (authErr) return authErr;

  if (!storagePath || !storagePath.startsWith(`${programId}/`)) {
    return jsonResponse({ error: "path inválido" }, 400);
  }

  const { data: programa, error: progErr } = await supabase
    .from("programa")
    .select("id, nombre, archivo_aspire_url, preview_url, estado_programa")
    .eq("id", programId)
    .maybeSingle();

  if (progErr || !programa) {
    return jsonResponse({ error: "Programa no encontrado" }, 404);
  }

  // Tope para bajar+parsear en la edge (WORKER_RESOURCE_LIMIT con .crv3d/zip grandes).
  // Por encima: solo linkeamos el archivo ya subido; el preview queda para después.
  const PREVIEW_MAX_BYTES = 18 * 1024 * 1024;

  const displayName = filename;
  const finalPath = storagePath;
  const { data: publicData } = supabase.storage
    .from("programas-aspire")
    .getPublicUrl(finalPath);
  const archivoUrl = publicData.publicUrl;
  const now = new Date().toISOString();

  let previewUrl: string | null =
    (programa as { preview_url?: string | null }).preview_url ?? null;
  let previewOk = false;
  let previewSkipped = knownSize > PREVIEW_MAX_BYTES ||
    filename.toLowerCase().endsWith(".zip");

  if (!previewSkipped) {
    try {
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("programas-aspire")
        .download(storagePath);

      if (dlErr || !fileBlob) {
        console.warn("[programa-sync] download aspire (preview):", dlErr);
      } else {
        const uploadedBytes = new Uint8Array(await fileBlob.arrayBuffer());
        // Zip o archivo grande: no descomprimir ni parsear OLE en la edge.
        if (
          uploadedBytes.byteLength > PREVIEW_MAX_BYTES ||
          isZipBytes(uploadedBytes)
        ) {
          previewSkipped = true;
        } else {
          const resolved = resolveCrv3dBytes(uploadedBytes, filename);
          const previewGif = extractPreviewGif(resolved.bytes);
          if (previewGif && previewGif.length > 0) {
            const previewPath = `${programId}/${Date.now()}-preview.gif`;
            const previewCopy = new Uint8Array(previewGif.byteLength);
            previewCopy.set(previewGif);
            const { error: previewUpErr } = await supabase.storage
              .from("programas-preview")
              .upload(previewPath, previewCopy, {
                contentType: "image/gif",
                upsert: true,
              });
            if (!previewUpErr) {
              const { data: previewPublic } = supabase.storage
                .from("programas-preview")
                .getPublicUrl(previewPath);
              const oldPreview = previewUrl;
              previewUrl = previewPublic.publicUrl;
              previewOk = true;
              if (oldPreview) {
                try {
                  const m = oldPreview.match(/programas-preview\/(.+)$/);
                  if (m?.[1]) {
                    await supabase.storage
                      .from("programas-preview")
                      .remove([decodeURIComponent(m[1])]);
                  }
                } catch {
                  /* best effort */
                }
              }
            } else {
              console.warn("[programa-sync] preview upload:", previewUpErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[programa-sync] preview omitido:", e);
      previewSkipped = true;
    }
  }

  const oldAspire = (programa as { archivo_aspire_url?: string | null }).archivo_aspire_url;
  if (oldAspire) {
    try {
      const m = oldAspire.match(/programas-aspire\/(.+)$/);
      if (m?.[1]) {
        const oldPath = decodeURIComponent(m[1]);
        if (oldPath !== finalPath && oldPath !== storagePath) {
          await supabase.storage.from("programas-aspire").remove([oldPath]);
        }
      }
    } catch {
      /* best effort */
    }
  }

  const currentEstado = asString(
    (programa as { estado_programa?: string | null }).estado_programa,
  );
  const programPatch: Record<string, unknown> = {
    archivo_aspire_url: archivoUrl,
    archivo_aspire_nombre: displayName,
    archivo_aspire_subido_at: now,
    preview_url: previewUrl,
    // El .crv3d del gadget es la fuente de verdad: ya no "falta regenerar".
    dirty: false,
    updated_at: now,
  };
  if (!currentEstado || currentEstado === "BORRADOR") {
    programPatch.estado_programa = "LISTO";
  }

  const { error: updErr } = await supabase
    .from("programa")
    .update(programPatch)
    .eq("id", programId);

  if (updErr) {
    console.error("[programa-sync] update archivo aspire:", updErr);
    return jsonResponse({ error: "No se pudo guardar el archivo en el programa" }, 500);
  }

  await supabase.from("programa_eventos").insert({
    programa_id: programId,
    tipo: "ASPIRE_SUBIDO",
    detalle: {
      origen: "GADGET",
      archivo: displayName,
      path: finalPath,
      preview: previewOk,
      preview_skipped: previewSkipped,
      size: knownSize || null,
    },
    usuario_email: null,
  });

  return jsonResponse({
    ok: true,
    archivo_aspire_url: archivoUrl,
    preview_url: previewUrl,
    preview: previewOk,
    preview_skipped: previewSkipped,
  });
}

async function handleSubirArchivo(
  supabase: SupabaseClient,
  req: Request,
): Promise<Response> {
  const programId = asString(
    req.headers.get("x-programa-id") || req.headers.get("X-Programa-Id"),
  );
  const token = asString(
    req.headers.get("x-programa-token") || req.headers.get("X-Programa-Token"),
  );
  const filename = safeAspireFilename(
    asString(req.headers.get("x-filename") || req.headers.get("X-Filename")) ||
      "programa.crv3d",
  );

  const authErr = await assertProgramToken(supabase, programId, token);
  if (authErr) return authErr;

  const { data: programa, error: progErr } = await supabase
    .from("programa")
    .select("id, nombre, archivo_aspire_url, preview_url")
    .eq("id", programId)
    .maybeSingle();

  if (progErr || !programa) {
    return jsonResponse({ error: "Programa no encontrado" }, 404);
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength < 100) {
    return jsonResponse({ error: "Archivo vacío o demasiado chico" }, 400);
  }
  // Límite práctico de Edge Functions (~body size).
  if (bytes.byteLength > 45 * 1024 * 1024) {
    return jsonResponse({
      error: "Archivo demasiado grande para subir por la app (>45MB)",
    }, 413);
  }

  const storagePath = `${programId}/${Date.now()}-${filename}`;
  const { error: upErr } = await supabase.storage
    .from("programas-aspire")
    .upload(storagePath, bytes, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (upErr) {
    console.error("[programa-sync] service upload:", upErr);
    return jsonResponse({ error: `No se pudo guardar en storage: ${upErr.message}` }, 500);
  }

  // Reusa la confirmación (preview + columnas programa).
  return handleConfirmarUpload(supabase, {
    accion: "confirmar-upload",
    programa_id: programId,
    token,
    path: storagePath,
    filename,
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
    const postAccion = accion;
    // Subida binaria del .crv3d (headers + body raw). No es JSON.
    if (postAccion === "subir-archivo") {
      return handleSubirArchivo(supabase, req);
    }

    // Mutaciones JSON: token por programa en el body (sin install key).
    let payload: SyncReport & UploadRequest;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "JSON inválido" }, 400);
    }

    const jsonAccion = postAccion || asString(payload.accion);
    if (jsonAccion === "pedir-upload") {
      return handlePedirUpload(supabase, payload);
    }
    if (jsonAccion === "confirmar-upload") {
      return handleConfirmarUpload(supabase, payload);
    }

    return handlePostReport(supabase, payload);
  }

  return jsonResponse({ error: "Método no permitido" }, 405);
});
