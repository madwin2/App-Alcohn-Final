// =============================================
// ALCOHN AGENT — Tool: Generar Mockup
// =============================================
// Genera un mockup realista del sello de bronce
// sobre madera, cuero u otros materiales.
//
// Método principal: mockup_generator.py (Pillow)
//   → Burn effect, perspectiva, DOF, viñeta
//
// Fallback: Sharp (composición básica)
//   → Se usa si Python no está disponible
//
// REQUIERE: Python 3 + pip install Pillow numpy
//           npm install sharp (para fallback)
// =============================================

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PYTHON_SCRIPT = path.join(__dirname, 'mockup_generator.py');

/** Windows: probar `py -3` primero; luego `python` / `python3`. */
const PYTHON_ATTEMPTS =
  process.platform === 'win32'
    ? [
        { cmd: 'py', args: ['-3'] },
        { cmd: 'python', args: [] },
        { cmd: 'python3', args: [] },
      ]
    : [
        { cmd: 'python3', args: [] },
        { cmd: 'python', args: [] },
      ];

// ─── MATERIALES DISPONIBLES ─────────────────

const MATERIALES = {
  cuero:   { label: 'Cuero natural', nota: 'Ideal para marroquinería y talabartería' },
  madera:  { label: 'Madera', nota: 'Ideal para carpintería y productos artesanales' },
  cuerina: { label: 'Cuerina/PU', nota: 'Similar al cuero, buena opción económica' },
  carton:  { label: 'Cartón/papel kraft', nota: 'Para packaging y cajas' }
};

// ─── MÉTODO PRINCIPAL: PYTHON ───────────────

async function generarMockupPython(logoPath, outputPath, material, medida) {
  const argsTail = [
    PYTHON_SCRIPT,
    '--input', logoPath,
    '--output', outputPath,
    '--material', material
  ];
  if (medida) argsTail.push('--medida', medida);

  let lastErr = null;
  for (const { cmd, args: prefix } of PYTHON_ATTEMPTS) {
    const args = [...prefix, ...argsTail];
    try {
      await new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: 45000 }, (error, stdout, stderr) => {
          if (error) {
            console.error('[generarMockup] Python stderr:', stderr);
            reject(new Error(stderr || error.message));
            return;
          }
          if (stdout) console.log('[generarMockup] Python:', stdout.trim());
          resolve();
        });
      });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se encontró intérprete Python');
}

// ─── FALLBACK: SHARP ────────────────────────

async function generarMockupSharp(logoBuffer, material) {
  const sharp = require('sharp');

  const COLORES_MATERIAL = {
    cuero:   { r: 139, g: 90, b: 43 },
    madera:  { r: 166, g: 128, b: 80 },
    cuerina: { r: 60, g: 56, b: 54 },
    carton:  { r: 185, g: 162, b: 129 }
  };

  const color = COLORES_MATERIAL[material] || COLORES_MATERIAL.madera;

  const logo = await sharp(logoBuffer)
    .resize(500, 500, { fit: 'inside' })
    .negate({ alpha: false })
    .modulate({ brightness: 0.7 })
    .toBuffer();

  const fondo = await sharp({
    create: { width: 800, height: 800, channels: 3, background: color }
  }).jpeg().toBuffer();

  const mockup = await sharp(fondo)
    .composite([{ input: logo, gravity: 'center', blend: 'multiply' }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return mockup;
}

// ─── IMPLEMENTACIÓN PRINCIPAL ───────────────

async function generarMockup(input) {
  const { imagen_base64, material, medida, mimetype } = input;

  if (!imagen_base64) {
    return { ok: false, error: 'No se proporcionó imagen del logo para el mockup.' };
  }

  const mat = (material || 'cuero').toLowerCase();
  if (!MATERIALES[mat]) {
    return {
      ok: false,
      error: `Material "${material}" no disponible. Opciones: ${Object.keys(MATERIALES).join(', ')}`
    };
  }

  // Siempre normalizamos a PNG con fondo blanco plano y recortado.
  // Esto evita el bug donde el script Python "quema" la caja entera
  // del PNG (o lee mal alphas raros) y deja un cuadrado sobre la madera.
  const tempInput = path.join(os.tmpdir(), `alcohn_mockup_in_${Date.now()}.png`);
  const tempOutput = path.join(os.tmpdir(), `alcohn_mockup_out_${Date.now()}.jpg`);

  try {
    // Pre-proceso: recortar bordes vacíos + aplanar sobre blanco.
    // Así el script Python recibe siempre "diseño oscuro sobre fondo blanco",
    // sin importar si vino como JPG, PNG-con-alpha o PNG-sin-alpha.
    const sharpLib = require('sharp');
    let logoBuffer = Buffer.from(imagen_base64, 'base64');
    try {
      logoBuffer = await sharpLib(logoBuffer)
        .trim({ threshold: 15 })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png()
        .toBuffer();
    } catch (prepErr) {
      console.warn('[generarMockup] Preproceso del logo falló, usando original:', prepErr.message);
    }
    fs.writeFileSync(tempInput, logoBuffer);

    // Intentar con Python primero
    let usedPython = false;
    if (fs.existsSync(PYTHON_SCRIPT)) {
      try {
        await generarMockupPython(tempInput, tempOutput, mat, medida);
        usedPython = true;
      } catch (pyErr) {
        console.warn('[generarMockup] Python falló, usando fallback Sharp:', pyErr.message);
      }
    }

    // Fallback con Sharp si Python no funcionó.
    // IMPORTANTE: usamos `logoBuffer` (el ya preprocesado: trim + flatten sobre
    // blanco), NO re-decodificamos el base64 original. Antes había un bug
    // donde se hacía `Buffer.from(imagen_base64, 'base64')` de nuevo, lo cual
    // saltaba el preproceso y reintroducía el cuadrado negro sobre la madera
    // que el trim+flatten venía a evitar.
    if (!usedPython) {
      console.log('[generarMockup] Usando fallback Sharp');
      const mockupBuffer = await generarMockupSharp(logoBuffer, mat);
      fs.writeFileSync(tempOutput, mockupBuffer);
    }

    // Leer resultado
    if (!fs.existsSync(tempOutput)) {
      return { ok: false, error: 'El generador no produjo imagen de salida.' };
    }

    const mockupBuffer = fs.readFileSync(tempOutput);
    const mockupBase64 = mockupBuffer.toString('base64');

    return {
      ok: true,
      imagen_base64: mockupBase64,
      mimetype: 'image/jpeg',
      material: MATERIALES[mat].label,
      medida: medida || 'sin especificar',
      metodo: usedPython ? 'python (realista)' : 'sharp (básico)',
      nota: usedPython
        ? `Mockup realista generado sobre ${MATERIALES[mat].label.toLowerCase()} con efecto de marcado a fuego. ${MATERIALES[mat].nota}.`
        : `Mockup básico sobre ${MATERIALES[mat].label.toLowerCase()}. ${MATERIALES[mat].nota}. Para mejor calidad, instalar Python + Pillow.`
    };

  } catch (err) {
    console.error('[generarMockup] Error:', err.message);
    return {
      ok: false,
      error: `No se pudo generar el mockup: ${err.message}`,
      accion: 'Escalá a humano para que envíe el mockup manualmente.'
    };
  } finally {
    try { fs.unlinkSync(tempInput); } catch {}
    try { fs.unlinkSync(tempOutput); } catch {}
  }
}

// ─── DEFINICIÓN PARA CLAUDE ──────────────────

const definicion = {
  name: 'generar_mockup',
  description:
    'Genera un mockup visual realista del sello de bronce marcado a fuego sobre el material que usa el cliente ' +
    '(cuero, madera, cuerina, cartón). Incluye efecto de quemado, perspectiva y desenfoque. ' +
    'Usá esta tool cuando ya tenés el logo listo (original u optimizado) ' +
    'y querés mostrarle al cliente cómo quedaría el sello. Es el GANCHO principal de venta — ' +
    'siempre intentá llegar a este paso. Después de enviar el mockup, avanzá hacia el cierre. ' +
    'IMPORTANTE: NO incluyas imagen_base64 — el sistema la inyecta automáticamente del último logo.',
  input_schema: {
    type: 'object',
    properties: {
      material: {
        type: 'string',
        enum: ['cuero', 'madera', 'cuerina', 'carton'],
        description: 'Material sobre el que mostrar el mockup. Default: cuero.'
      },
      medida: {
        type: 'string',
        description: 'Medida del sello. Ej: "5x3 cm", "4x4 cm".'
      },
      imagen_id: {
        type: 'integer',
        description:
          'ID de la imagen/logo a usar para el mockup (del registro de imágenes). ' +
          'Si no se proporciona, se usa la última imagen generada.'
      }
    },
    required: ['material']
  }
};

module.exports = { generarMockup, definicion };
