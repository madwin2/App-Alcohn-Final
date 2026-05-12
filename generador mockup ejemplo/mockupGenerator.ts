import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const OUT_W = 1400;
const OUT_H = 1000;
const LOGO_SCALE = 0.55 * 1.15;

export type MockupPythonMaterial = 'madera' | 'cuero' | 'cuerina' | 'carton';

/** Mapea material del wizard a lo que entiende mockup_generator.py */
export function mapWizardMaterialToMockup(material: string): MockupPythonMaterial {
  const m = (material || 'cuero').toLowerCase();
  if (m === 'madera' || m === 'ceramica' || m === 'alimentos' || m === 'otros') return 'madera';
  if (m === 'carton' || m === 'cartón') return 'carton';
  if (m === 'cuerina') return 'cuerina';
  // cuero, ambos, default
  return 'cuero';
}

function parseLogoToBuffer(logo: string): { buffer: Buffer; ext: string } {
  const trimmed = logo.trim();
  if (trimmed.startsWith('data:')) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(trimmed);
    if (!match) throw new Error('Logo data URL inválido');
    const mime = match[1];
    const b64 = match[2].replace(/\s/g, '');
    const ext = mime.includes('jpeg') || mime.includes('jpg') ? '.jpg' : '.png';
    return { buffer: Buffer.from(b64, 'base64'), ext };
  }
  const b64 = trimmed.replace(/\s/g, '');
  return { buffer: Buffer.from(b64, 'base64'), ext: '.png' };
}

function texturePathForSharp(mat: MockupPythonMaterial): string | null {
  const names =
    mat === 'cuero' || mat === 'cuerina'
      ? ['cuero.jpg', 'cuero.jpeg', 'cuero.png']
      : ['madera.jpg', 'madera.jpeg', 'madera.png'];
  const dirs = [
    path.join(process.cwd(), 'public', 'mockup-textures'),
    path.join(process.cwd(), 'Ejemplo de Mockup', 'textures'),
  ];
  for (const dir of dirs) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function generateWithPython(
  logoBuffer: Buffer,
  ext: string,
  material: MockupPythonMaterial
): Promise<Buffer | null> {
  const script = path.join(process.cwd(), 'Ejemplo de Mockup', 'mockup_generator.py');
  if (!fs.existsSync(script)) return null;

  const tmpIn = path.join(os.tmpdir(), `alcohn_mockup_in_${Date.now()}${ext}`);
  const tmpOut = path.join(os.tmpdir(), `alcohn_mockup_out_${Date.now()}.jpg`);
  try {
    fs.writeFileSync(tmpIn, logoBuffer);

    const argsBase = [script, '--input', tmpIn, '--output', tmpOut, '--material', material];
    const attempts: { cmd: string; args: string[] }[] =
      process.platform === 'win32'
        ? [
            { cmd: 'py', args: ['-3', ...argsBase] },
            { cmd: 'python', args: [...argsBase] },
            { cmd: 'python3', args: [...argsBase] },
          ]
        : [
            { cmd: 'python3', args: [...argsBase] },
            { cmd: 'python', args: [...argsBase] },
          ];

    for (const { cmd, args } of attempts) {
      try {
        await execFileAsync(cmd, args, {
          timeout: 90_000,
          maxBuffer: 20 * 1024 * 1024,
          windowsHide: true,
        });
        if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
          return fs.readFileSync(tmpOut);
        }
      } catch {
        // probar siguiente intérprete
      }
    }
    return null;
  } finally {
    try {
      fs.unlinkSync(tmpIn);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpOut);
    } catch {
      /* ignore */
    }
  }
}

/** Fallback con texturas reales + multiply (sin Python). */
async function generateWithSharp(logoBuffer: Buffer, material: MockupPythonMaterial): Promise<Buffer> {
  const texPath = texturePathForSharp(material);
  const targetLogoW = Math.round(OUT_W * LOGO_SCALE);

  const logoPng = await sharp(logoBuffer)
    .ensureAlpha()
    .resize(targetLogoW, Math.round(OUT_H * LOGO_SCALE), { fit: 'inside' })
    .png()
    .toBuffer();

  const meta = await sharp(logoPng).metadata();
  const lw = meta.width ?? targetLogoW;
  const lh = meta.height ?? targetLogoW;
  const left = Math.round((OUT_W - lw) / 2);
  const top = Math.round((OUT_H - lh) / 2);

  // Capa de “marca”: silueta oscura a partir del logo (mejor para multiply sobre textura)
  const stampLayer = await sharp(logoPng)
    .greyscale()
    .linear(1.35, -(material === 'madera' || material === 'carton' ? 50 : 40))
    .modulate({ saturation: 0, brightness: material === 'madera' || material === 'carton' ? 0.55 : 0.65 })
    .png()
    .toBuffer();

  if (!texPath) {
    const color =
      material === 'madera' || material === 'carton'
        ? { r: 166, g: 128, b: 80 }
        : { r: 139, g: 90, b: 43 };
    return sharp({
      create: { width: OUT_W, height: OUT_H, channels: 3, background: color },
    })
      .composite([{ input: stampLayer, left, top, blend: 'multiply' }])
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const bg = await sharp(texPath)
    .resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .toBuffer();

  return sharp(bg)
    .composite([{ input: stampLayer, left, top, blend: 'multiply' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export type GenerateMockupResult = {
  buffer: Buffer;
  method: 'python' | 'sharp';
};

/**
 * Intenta el generador Python (mockup_generator.py + texturas del repo);
 * si no hay Python o falla, usa Sharp + texturas en public/mockup-textures.
 */
export async function generateRealisticMockup(logo: string, material: string): Promise<GenerateMockupResult> {
  const { buffer, ext } = parseLogoToBuffer(logo);
  const mat = mapWizardMaterialToMockup(material);

  const py = await generateWithPython(buffer, ext, mat);
  if (py) {
    return { buffer: py, method: 'python' };
  }

  const sh = await generateWithSharp(buffer, mat);
  return { buffer: sh, method: 'sharp' };
}
