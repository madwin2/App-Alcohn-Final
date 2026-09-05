import JSZip from 'jszip';
import { supabase } from '@/lib/supabase/client';
import {
  canDownloadPackage,
  getBaseFileUrl,
  getGadgetFileUrl,
  getProgramById,
  markProgramPackageReady,
  PROGRAM_GADGET_FILENAME,
  ProgramBaseMachine,
  ProgramServiceError,
} from '@/lib/supabase/services/programs.service';
import { vectorUrlFromPreview } from '@/lib/utils/vectorUrlFromPreview';
import type { Program, ProgramStamp } from '@/lib/types/index';

function slugifyProgramName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'programa';
}

function stampLayer(stamp: ProgramStamp): string {
  return stamp.stampType || 'CLASICO';
}

function toolpathTemplatesFor(stamp: ProgramStamp): string[] {
  const tipo = (stamp.stampType || 'CLASICO').toLowerCase();
  return [`roughing_${tipo}.ToolpathTemplate`, `profile_${tipo}.ToolpathTemplate`];
}

function buildManifestLua(program: Program, vectorFiles: { stamp: ProgramStamp; archivo: string }[]): string {
  const sellosLua = vectorFiles
    .map(({ stamp, archivo }, index) => {
      const templates = toolpathTemplatesFor(stamp)
        .map((t) => `"${t}"`)
        .join(', ');
      return `    {
      orden = ${index + 1},
      sello_id = "${stamp.id}",
      archivo = "${archivo}",
      ancho_mm = ${(stamp.widthMm || 0).toFixed(1)},
      largo_mm = ${(stamp.heightMm || 0).toFixed(1)},
      tipo = "${stamp.stampType}",
      tipo_planchuela = ${stamp.tipoPlanchuela ?? 'nil'},
      layer = "${stampLayer(stamp)}",
      toolpath_templates = { ${templates} },
    }`;
    })
    .join(',\n');

  return `return {
  programa_id = "${program.id}",
  programa_nombre = "${program.name.replace(/"/g, '\\"')}",
  maquina = "${program.machine}",
  sellos = {
${sellosLua}
  },
}
`;
}

async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new ProgramServiceError(`No se pudo descargar archivo (${res.status}): ${url}`);
  return res.arrayBuffer();
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return m ? m[1].toLowerCase() : fallback;
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Genera el paquete ZIP del programa (vectores + manifest + .crv3d base + gadget .lua),
 * lo sube a Storage, marca el programa LISTO y dispara la descarga en el navegador.
 *
 * Nota: por ahora se incluyen los vectores en el formato disponible (EPS/preview).
 * La conversión a DXF hace falta para que el gadget importe sin intervención manual.
 */
export async function generateAndDownloadProgramPackage(programId: string): Promise<Program> {
  const program = await getProgramById(programId);
  if (!program) throw new ProgramServiceError('Programa no encontrado');

  if (!canDownloadPackage(program.machine)) {
    throw new ProgramServiceError(
      'Los programas de máquina ABC no generan paquete: se arman a mano.',
    );
  }

  if (!program.stamps.length) {
    throw new ProgramServiceError('El programa no tiene sellos para empaquetar.');
  }

  const zip = new JSZip();
  const vectorMeta: { stamp: ProgramStamp; archivo: string }[] = [];
  const failures: string[] = [];

  for (let i = 0; i < program.stamps.length; i++) {
    const stamp = program.stamps[i];
    const preview = stamp.vectorPreviewUrl;
    if (!preview) {
      failures.push(`${stamp.designName}: sin archivo de vector`);
      continue;
    }

    const vectorUrl = vectorUrlFromPreview(preview) || preview;
    const ext = extensionFromUrl(vectorUrl, 'eps');
    const orden = String(i + 1).padStart(3, '0');
    const archivo = `vectores/${orden}_${stamp.id}.${ext}`;

    try {
      const bytes = await fetchBinary(vectorUrl);
      zip.file(archivo, bytes);
      vectorMeta.push({ stamp, archivo });
    } catch (e) {
      failures.push(`${stamp.designName}: ${e instanceof Error ? e.message : 'error de descarga'}`);
    }
  }

  if (failures.length && vectorMeta.length === 0) {
    throw new ProgramServiceError(`No se pudo armar el ZIP:\n${failures.join('\n')}`);
  }

  zip.file('manifest.lua', buildManifestLua(program, vectorMeta));

  const baseUrl = await getBaseFileUrl(program.machine);
  if (baseUrl) {
    try {
      const baseBytes = await fetchBinary(baseUrl);
      zip.file('programa.crv3d', baseBytes);
    } catch (e) {
      failures.push(
        `Archivo base .crv3d: ${e instanceof Error ? e.message : 'no se pudo descargar'}`,
      );
    }
  } else {
    zip.file(
      'LEEME.txt',
      'No hay .crv3d base registrado para esta máquina en programa_archivos_base.\n'
        + 'Subí el archivo base desde la UI de Programas para incluirlo en futuros paquetes.\n'
        + 'Por ahora el ZIP trae vectores + manifest.lua + gadget.\n',
    );
  }

  const machine = program.machine as ProgramBaseMachine;
  const gadgetUrl = await getGadgetFileUrl(machine);
  const gadgetName = PROGRAM_GADGET_FILENAME[machine];
  if (gadgetUrl) {
    try {
      const gadgetBytes = await fetchBinary(gadgetUrl);
      zip.file(gadgetName, gadgetBytes);
    } catch (e) {
      failures.push(
        `Gadget ${gadgetName}: ${e instanceof Error ? e.message : 'no se pudo descargar'}`,
      );
    }
  }

  if (failures.length) {
    zip.file('ERRORES.txt', failures.join('\n') + '\n');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `programa-${slugifyProgramName(program.name)}.zip`;
  const storagePath = `${program.id}/${Date.now()}.zip`;

  const { error: uploadError } = await supabase.storage
    .from('programas-zip')
    .upload(storagePath, blob, { contentType: 'application/zip', upsert: true });

  if (uploadError) {
    triggerBrowserDownload(blob, filename);
    throw new ProgramServiceError(
      `El ZIP se descargó localmente pero no se pudo guardar en Storage: ${uploadError.message}`,
    );
  }

  const { data: publicData } = supabase.storage.from('programas-zip').getPublicUrl(storagePath);
  const zipUrl = publicData.publicUrl;

  const updated = await markProgramPackageReady(programId, zipUrl);
  triggerBrowserDownload(blob, filename);
  return updated;
}
