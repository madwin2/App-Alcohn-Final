import { canvasToPreviewDataUrl } from './bitmapPreview';
import {
  applyLevels,
  computeContentBBox,
  cropBuffer,
  expandBBox,
  flattenAlphaOnWhite,
  type CropReason,
} from './imagePrep';
import { DEFAULT_PREP_OPTIONS, type PreparedImage, type PrepOptions, type SourceImage } from './types';

function canvasFromBuffer(buffer: { data: Uint8ClampedArray; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el canvas');
  const imageData = ctx.createImageData(buffer.width, buffer.height);
  imageData.data.set(buffer.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function readSourcePixels(src: SourceImage): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo leer la imagen');
  ctx.drawImage(src.bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function prepareImage(src: SourceImage, opts: PrepOptions = DEFAULT_PREP_OPTIONS): PreparedImage {
  const raw = readSourcePixels(src);
  const buffer = { data: new Uint8ClampedArray(raw.data), width: raw.width, height: raw.height };
  const sourceSize = { w: buffer.width, h: buffer.height };

  let cropPx = { x: 0, y: 0, w: buffer.width, h: buffer.height };
  let empty = false;
  let cropReason: CropReason = 'ok';

  if (opts.manualCrop && opts.manualCrop.w > 0 && opts.manualCrop.h > 0) {
    cropPx = {
      x: Math.max(0, Math.round(opts.manualCrop.x)),
      y: Math.max(0, Math.round(opts.manualCrop.y)),
      w: Math.max(1, Math.round(opts.manualCrop.w)),
      h: Math.max(1, Math.round(opts.manualCrop.h)),
    };
    cropReason = 'ok';
  } else if (opts.autoCrop) {
    const bbox = computeContentBBox(buffer);
    if (!bbox) {
      empty = true;
      cropReason = 'vacia';
    } else if (bbox.reason === 'fondo-no-detectado') {
      cropReason = 'fondo-no-detectado';
      cropPx = { x: 0, y: 0, w: buffer.width, h: buffer.height };
    } else if (bbox.reason === 'sin-margen') {
      cropReason = 'sin-margen';
      cropPx = { x: 0, y: 0, w: buffer.width, h: buffer.height };
    } else {
      cropReason = 'ok';
      cropPx = expandBBox(bbox, buffer.width, buffer.height, opts.cropPaddingPct);
    }
  }

  let working = empty ? buffer : cropBuffer(buffer, cropPx);
  flattenAlphaOnWhite(working);
  if (!empty && opts.cleanLevels) {
    applyLevels(working, opts.blackPoint, opts.whitePoint);
  }

  const canvas = canvasFromBuffer(working);
  return {
    id: src.id,
    name: src.name,
    width: working.width,
    height: working.height,
    canvas,
    previewDataUrl: canvasToPreviewDataUrl(canvas),
    empty,
    cropReason,
    cropPx,
    sourceSize,
    selloId: src.selloId,
    orderId: src.orderId,
  };
}
