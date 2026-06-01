from __future__ import annotations

import base64
import gc
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image

from .config import Settings


class VectorizationError(RuntimeError):
    pass


def _load_to_bgr(input_bytes: bytes) -> np.ndarray:
    from io import BytesIO

    pil = Image.open(BytesIO(input_bytes)).convert("RGBA")
    rgba = np.array(pil)
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    white = np.full_like(rgb, 255.0)
    composed = (rgb * alpha + white * (1.0 - alpha)).astype(np.uint8)
    return cv2.cvtColor(composed, cv2.COLOR_RGB2BGR)


def _border_values(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape
    m = max(2, min(h, w) // 40)
    top = gray[:m, :]
    bottom = gray[h - m :, :]
    left = gray[:, :m]
    right = gray[:, w - m :]
    return np.concatenate([top.ravel(), bottom.ravel(), left.ravel(), right.ravel()])


def _background_stats(bgr: np.ndarray) -> tuple[float, float, float]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    border = _border_values(gray)
    return float(np.median(border)), float(np.std(border)), float(np.mean(border >= 228))


def _normalize_neutral_background(bgr: np.ndarray) -> tuple[np.ndarray, bool]:
    """Convierte fondos grises uniformes a blanco y el trazo a negro."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    bg_level, bg_std, white_ratio = _background_stats(bgr)
    if white_ratio >= 0.82 or bg_std > 28:
        return bgr, False

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat_ratio = float(np.mean(hsv[:, :, 1] > 45))
    if sat_ratio > 0.18:
        return bgr, False

    dark_ref = float(np.percentile(gray, 4))
    margin = max(10.0, min(28.0, (bg_level - dark_ref) * 0.35))
    ink = np.clip((bg_level - gray.astype(np.float32)) / (margin * 2.0), 0.0, 1.0)
    normalized = np.full_like(bgr, 255)
    ink_u8 = (255.0 * (1.0 - ink)).astype(np.uint8)
    normalized[:, :, 0] = ink_u8
    normalized[:, :, 1] = ink_u8
    normalized[:, :, 2] = ink_u8
    return normalized, True


def _opencv_upscale_bgr(bgr: np.ndarray, target_long_side: int, max_megapixels: float) -> tuple[np.ndarray, int]:
    h, w = bgr.shape[:2]
    long_side = max(h, w)
    if long_side >= target_long_side:
        return bgr, 1

    scale = target_long_side / long_side
    max_pixels = int(max_megapixels * 1_000_000)
    while scale > 1.0 and h * w * scale * scale > max_pixels:
        scale -= 0.25
    scale = max(1.0, scale)

    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    upscaled = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    return upscaled, int(round(scale))


def _resize_png_for_api(input_png: Path, max_long_side: int = 1536) -> bytes:
    """Reduce el PNG de entrada antes de OpenAI para bajar uso de RAM."""
    bgr = cv2.imread(str(input_png))
    if bgr is None:
        return input_png.read_bytes()
    h, w = bgr.shape[:2]
    long_side = max(h, w)
    if long_side <= max_long_side:
        del bgr
        return input_png.read_bytes()
    scale = max_long_side / long_side
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    del bgr
    ok, buf = cv2.imencode(".png", resized)
    del resized
    if not ok:
        return input_png.read_bytes()
    return buf.tobytes()


def _sharpen_gray(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (0, 0), 0.9)
    sharp = cv2.addWeighted(gray, 1.35, blurred, -0.35, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)


def _denoise_gray(gray: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(gray, d=5, sigmaColor=35, sigmaSpace=35)


def _prepare_grayscale_ink(bgr: np.ndarray) -> np.ndarray:
    """Gris intermedio para mkbitmap en logos con fondo sucio o baja calidad."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _bg_level, _bg_std, white_ratio = _background_stats(bgr)

    cleaned = gray.astype(np.float32)
    cleaned[cleaned >= 245] = 255.0

    if white_ratio >= 0.82:
        ink = cleaned < 235
        cleaned[ink] = np.clip(cleaned[ink] * 0.72, 0, 235)
    else:
        ink = cleaned < 220
        cleaned[ink] = np.clip(cleaned[ink] * 0.78, 0, 220)

    return cleaned.astype(np.uint8)


def _is_high_contrast_logo(bgr: np.ndarray) -> bool:
    _bg_level, bg_std, white_ratio = _background_stats(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return white_ratio >= 0.78 and bg_std < 24 and lap_var > 60


def _morph_solidify_fg(fg: np.ndarray, h: int, w: int) -> np.ndarray:
    gap = max(5, int(min(h, w) * 0.0028)) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (gap, gap))
    solid = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel, iterations=2)
    dil_k = max(3, gap // 2) | 1
    dil_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dil_k, dil_k))
    return cv2.dilate(solid, dil_kernel, iterations=1)


def _hard_binarize_bgr(bgr: np.ndarray) -> np.ndarray:
    """Binarización dura + relleno sólido (evita wireframes de mkbitmap en logos limpios)."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = np.where(gray >= 248, 255, gray).astype(np.uint8)
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bw = _normalize_to_black_foreground(bw)
    h, w = bw.shape[:2]
    fg = (bw == 0).astype(np.uint8)
    fg = _morph_solidify_fg(fg, h, w)
    return np.where(fg > 0, 0, 255).astype(np.uint8)


def _ai_bgr_on_white(bgr: np.ndarray) -> np.ndarray:
    """OpenAI a veces devuelve fondo gris/oscuro: dejar trazo negro sobre blanco puro."""
    _bg_level, _bg_std, white_ratio = _background_stats(bgr)
    if white_ratio < 0.35:
        return 255 - bgr
    return bgr


def _bitmap_from_ai_enhanced(
    bgr: np.ndarray,
    target_long_side: int,
    max_megapixels: float,
) -> tuple[np.ndarray, int]:
    """
    La IA ya entrega imagen nítida: binarizar primero (umbral fijo) y agrandar el bitmap
    con nearest-neighbor para no crear halos grises que Potrace convierte en ruido.
    """
    bgr = _ai_bgr_on_white(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    bw = _normalize_to_black_foreground(bw)

    h, w = bw.shape[:2]
    long_side = max(h, w)
    if long_side >= target_long_side:
        return bw, 1

    scale = target_long_side / long_side
    max_pixels = int(max_megapixels * 1_000_000)
    while scale > 1.0 and h * w * scale * scale > max_pixels:
        scale -= 0.25
    scale = max(1.0, scale)

    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    upscaled = cv2.resize(bw, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
    return upscaled, int(round(scale))


def _bitmap_from_bgr(
    working_bgr: np.ndarray,
    tmp_dir: Path,
    settings: Settings,
    *,
    low_quality: bool,
) -> tuple[np.ndarray, str, int]:
    h, w = working_bgr.shape[:2]
    use_hard = _is_high_contrast_logo(working_bgr)
    if use_hard:
        bw = _hard_binarize_bgr(working_bgr)
        return bw, "hard_otsu", 1

    gray = _prepare_grayscale_ink(working_bgr)
    gray = _denoise_gray(gray)
    gray = _sharpen_gray(gray)

    mk_scale = _compute_mkbitmap_scale(h, w, settings)
    if mk_scale > 1 and max(h, w) * mk_scale > settings.vector_target_long_side * 1.15:
        mk_scale = max(1, int(settings.vector_target_long_side / max(h, w)))

    input_pgm = tmp_dir / "input.pgm"
    raw_pbm = tmp_dir / "mkbitmap_out.pbm"
    cv2.imwrite(str(input_pgm), gray)
    _run_mkbitmap(settings, input_pgm, raw_pbm, scale=mk_scale, low_quality=low_quality)

    bw = cv2.imread(str(raw_pbm), cv2.IMREAD_GRAYSCALE)
    if bw is None:
        raise VectorizationError("No se pudo leer la salida de mkbitmap.")

    bw = _normalize_to_black_foreground(bw)
    fg_ratio = float(np.mean(bw == 0))
    if fg_ratio < 0.02:
        bw = _hard_binarize_bgr(working_bgr)
        return bw, "hard_otsu_fallback", mk_scale

    return bw, "mkbitmap", mk_scale


def _needs_ai_enhance(bgr: np.ndarray) -> bool:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    long_side = max(bgr.shape[:2])
    _bg_level, bg_std, white_ratio = _background_stats(bgr)
    return lap_var < 180.0 or long_side < 1100 or white_ratio < 0.75 or bg_std > 18


def _run_openai_enhance(settings: Settings, input_png: Path, output_png: Path) -> None:
    if not settings.openai_api_key:
        raise VectorizationError("OPENAI_API_KEY no configurada.")

    image_bytes = _resize_png_for_api(input_png)
    prompt = (
        "Convert this logo image into a production-ready stamp source while preserving the exact original "
        "design concept and proportions. Do NOT alter, redraw, reinterpret, add, remove, or stylize any element. "
        "Output only one centered logo on pure white (#FFFFFF) background. "
        "Monochrome solid black filled shapes (not outlines or hollow strokes), high contrast, crisp smooth edges. "
        "No distress, grunge, noise, halftone, shadows, gradients, textures, or extra decorations."
    )
    models = [
        settings.ai_enhance_model,
        "gpt-image-1.5",
        "gpt-image-1",
    ]
    seen: set[str] = set()
    errors: list[str] = []

    for model in models:
        if not model or model in seen:
            continue
        seen.add(model)
        try:
            _openai_edit_multipart(
                api_key=settings.openai_api_key,
                model=model,
                image_bytes=image_bytes,
                prompt=prompt,
                output_png=output_png,
            )
            return
        except Exception as exc:
            errors.append(f"{model}-multipart: {exc}")
            try:
                image_b64 = base64.b64encode(image_bytes).decode("ascii")
                data_url = f"data:image/png;base64,{image_b64}"
                del image_b64
                _openai_edit_json(
                    api_key=settings.openai_api_key,
                    model=model,
                    data_url=data_url,
                    prompt=prompt,
                    output_png=output_png,
                )
                return
            except Exception as exc2:
                errors.append(f"{model}: {exc2}")

    raise VectorizationError("OpenAI image edit falló: " + " | ".join(errors[-3:]))


def _write_openai_image(payload: dict, output_png: Path) -> None:
    first = (payload.get("data") or [{}])[0]
    if first.get("b64_json"):
        output_png.write_bytes(base64.b64decode(first["b64_json"]))
    elif first.get("url"):
        img_response = requests.get(first["url"], timeout=60)
        img_response.raise_for_status()
        output_png.write_bytes(img_response.content)
    else:
        raise VectorizationError("OpenAI no devolvió imagen optimizada.")
    if not output_png.exists() or output_png.stat().st_size == 0:
        raise VectorizationError("OpenAI no generó imagen de salida.")


def _openai_edit_json(
    *,
    api_key: str,
    model: str,
    data_url: str,
    prompt: str,
    output_png: Path,
) -> None:
    body = {
        "model": model,
        "images": [{"image_url": data_url}],
        "prompt": prompt,
        "background": "transparent",
        "output_format": "png",
        "quality": "high",
        "size": "1024x1024",
        "input_fidelity": "high",
        "moderation": "low",
        "n": 1,
    }
    response = requests.post(
        "https://api.openai.com/v1/images/edits",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=120,
    )
    if not response.ok:
        detail = response.text[:300]
        raise VectorizationError(f"HTTP {response.status_code}: {detail}")
    _write_openai_image(response.json(), output_png)


def _openai_edit_multipart(
    *,
    api_key: str,
    model: str,
    image_bytes: bytes,
    prompt: str,
    output_png: Path,
) -> None:
    for field_name in ("image[]", "image"):
        response = requests.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "model": model,
                "prompt": prompt,
                "background": "transparent",
                "output_format": "png",
                "quality": "high",
                "size": "1024x1024",
                "input_fidelity": "high",
                "moderation": "low",
                "n": "1",
            },
            files={field_name: ("logo.png", image_bytes, "image/png")},
            timeout=120,
        )
        if response.ok:
            _write_openai_image(response.json(), output_png)
            return
    raise VectorizationError("multipart edit failed")


def _resolve_bin(name: str, configured: str) -> str | None:
    configured = configured.strip()
    if configured and Path(configured).exists():
        return configured
    return shutil.which(configured or name)


def _looks_low_quality(bgr: np.ndarray) -> bool:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    long_side = max(bgr.shape[:2])
    return lap_var < 120.0 or long_side < 900


def _compute_upscale_factor(h: int, w: int, settings: Settings) -> int:
    long_side = max(h, w)
    configured = max(2, min(4, int(settings.upscale_factor)))
    if long_side >= 1200:
        return 1
    if long_side >= 650:
        return min(2, configured)
    return configured


def _compute_mkbitmap_scale(h: int, w: int, settings: Settings) -> int:
    long_side = max(h, w)
    if long_side >= settings.vector_target_long_side:
        return 1

    scale = int(np.ceil(settings.vector_target_long_side / long_side))
    scale = min(scale, int(settings.vector_max_upscale))

    max_pixels = settings.vector_max_megapixels * 1_000_000
    while scale > 1 and h * w * scale * scale > max_pixels:
        scale -= 1

    return max(1, scale)


def _solidify_bitmap(bw: np.ndarray) -> np.ndarray:
    h, w = bw.shape[:2]
    fg = (bw == 0).astype(np.uint8)
    solid = _morph_solidify_fg(fg, h, w)
    return np.where(solid > 0, 0, 255).astype(np.uint8)


def _normalize_to_black_foreground(binary_img: np.ndarray) -> np.ndarray:
    if binary_img.ndim != 2:
        raise ValueError("Se esperaba imagen binaria 2D")

    bw = np.where(binary_img > 127, 255, 0).astype(np.uint8)
    border = _border_values(bw)
    border_black_ratio = float(np.mean(border == 0))
    fg_ratio = float(np.mean(bw == 0))

    if border_black_ratio > 0.3 or fg_ratio > 0.7:
        bw = 255 - bw
    return bw


def _min_speckle_area(h: int, w: int) -> int:
    scaled = int(max(h, w) * 0.0012)
    return int(np.clip(scaled, 12, 80))


def _remove_speckles(bw: np.ndarray, min_area: int) -> np.ndarray:
    fg = (bw == 0).astype(np.uint8)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    cleaned = np.full_like(bw, 255)
    for label in range(1, n_labels):
        if int(stats[label, cv2.CC_STAT_AREA]) >= min_area:
            cleaned[labels == label] = 0
    return cleaned


def _mask_noise_metrics(bw: np.ndarray) -> tuple[float, float, int]:
    fg = (bw == 0).astype(np.uint8)
    n_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(fg, connectivity=8)
    component_count = max(0, n_labels - 1)
    if component_count == 0:
        return 1.0, 0.0, 0

    areas = stats[1:, cv2.CC_STAT_AREA]
    tiny_ratio = float(np.mean(areas < 24))
    return tiny_ratio, float(np.mean(fg)), component_count


def _max_components_for_image(h: int, w: int) -> int:
    base = 420
    area_factor = (h * w) / 500_000
    return min(max(int(base + area_factor * 220), 420), 1800)


def _validate_eligibility(bgr: np.ndarray) -> None:
    _bg_level, bg_std, white_bg_ratio = _background_stats(bgr)
    if white_bg_ratio < 0.82 and bg_std > 28:
        raise VectorizationError("Logo no apto para vectorización automática: Fondo no parece blanco uniforme.")

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat_ratio = float(np.mean(hsv[:, :, 1] > 45))
    if sat_ratio > 0.22:
        raise VectorizationError("Logo no apto para vectorización automática: Imagen con demasiado color/saturación.")


def _validate_bitmap(bw: np.ndarray, *, ai_pipeline: bool = False) -> None:
    fg_ratio = float(np.mean(bw == 0))
    max_fg = 0.72 if ai_pipeline else 0.62
    if fg_ratio < 0.008 or fg_ratio > max_fg:
        raise VectorizationError("Logo no apto para vectorización automática: Proporción de trazo fuera de rango.")

    h, w = bw.shape[:2]
    max_components = _max_components_for_image(h, w)
    tiny_ratio, _, component_count = _mask_noise_metrics(bw)
    if component_count == 0 or component_count > max_components:
        raise VectorizationError("Logo no apto para vectorización automática: Demasiado ruido/componentes.")
    tiny_limit = 0.88 if ai_pipeline else 0.62
    if tiny_ratio > tiny_limit:
        raise VectorizationError("Logo no apto para vectorización automática: Demasiado ruido en la máscara binaria.")


def _run_upscayl(
    settings: Settings,
    input_png: Path,
    output_png: Path,
    *,
    low_quality: bool,
    scale: int,
) -> None:
    upscayl_bin = _resolve_bin("upscayl-bin", settings.upscayl_bin)
    if not upscayl_bin:
        raise VectorizationError("upscayl-bin no está instalado.")

    upscayl_dir = Path(upscayl_bin).resolve().parent
    model = settings.upscale_model
    if low_quality and settings.upscale_model_low_quality:
        model = settings.upscale_model_low_quality

    cmd = [
        upscayl_bin,
        "-i",
        str(input_png),
        "-o",
        str(output_png),
        "-m",
        str(upscayl_dir / "models"),
        "-n",
        model,
        "-s",
        str(scale),
        "-f",
        "png",
        "-t",
        str(settings.upscale_tile_size),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=str(upscayl_dir))
    if not output_png.exists() or output_png.stat().st_size == 0:
        raise VectorizationError("Upscayl no generó imagen de salida.")


def _run_mkbitmap(
    settings: Settings,
    input_pgm: Path,
    output_pbm: Path,
    *,
    scale: int,
    low_quality: bool,
) -> None:
    mkbitmap_bin = _resolve_bin("mkbitmap", settings.mkbitmap_bin)
    if not mkbitmap_bin:
        raise VectorizationError("mkbitmap no está instalado.")

    filter_radius = "4" if low_quality else "3"
    threshold = "0.46" if low_quality else "0.48"

    cmd = [
        mkbitmap_bin,
        "-f",
        filter_radius,
        "-s",
        str(scale),
        "-3",
        "-t",
        threshold,
        "-o",
        str(output_pbm),
        str(input_pgm),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    if not output_pbm.exists() or output_pbm.stat().st_size == 0:
        raise VectorizationError("mkbitmap no generó bitmap de salida.")


def _prepare_bitmap_ai_minimal(
    working_bgr: np.ndarray,
    settings: Settings,
    *,
    bg_normalized: bool,
) -> tuple[np.ndarray, dict[str, object]]:
    """Pipeline IA: binarizar → agrandar bitmap (nearest) → Potrace. Sin mkbitmap ni morfología."""
    bw, cv_scale = _bitmap_from_ai_enhanced(
        working_bgr,
        settings.vector_ai_target_long_side,
        settings.vector_max_megapixels,
    )
    del working_bgr
    gc.collect()

    fg_ratio = float(np.mean(bw == 0))
    if fg_ratio < 0.003:
        raise VectorizationError("La imagen mejorada por IA no tiene trazo detectable.")

    meta: dict[str, object] = {
        "pipeline": "ai_minimal",
        "upscaled": cv_scale > 1,
        "upscale_factor": cv_scale,
        "opencv_upscale": cv_scale,
        "mkbitmap_scale": 1,
        "binarize": "ai_nearest",
        "background_normalized": bg_normalized,
        "ai_enhanced": True,
    }
    return bw, meta


def _prepare_bitmap_classic(
    input_bytes: bytes,
    tmp_dir: Path,
    settings: Settings,
    *,
    bg_normalized: bool,
) -> tuple[np.ndarray, dict[str, object]]:
    """Pipeline completo para bitmaps sucios o sin mejora IA."""
    bgr = _load_to_bgr(input_bytes)
    low_quality = _looks_low_quality(bgr)

    input_png = tmp_dir / "input.png"
    upscaled_png = tmp_dir / "upscaled.png"
    cv2.imwrite(str(input_png), bgr)

    meta: dict[str, object] = {
        "pipeline": "classic",
        "upscaled": False,
        "upscale_factor": 1,
        "opencv_upscale": 1,
        "mkbitmap_scale": 1,
        "binarize": "unknown",
        "background_normalized": bg_normalized,
        "ai_enhanced": False,
    }

    working_bgr = bgr
    del bgr

    working_bgr, cv_scale = _opencv_upscale_bgr(
        working_bgr,
        settings.vector_target_long_side,
        settings.vector_max_megapixels,
    )
    meta["opencv_upscale"] = cv_scale
    cv2.imwrite(str(input_png), working_bgr)

    upscale_factor = _compute_upscale_factor(*working_bgr.shape[:2], settings)
    if settings.upscale_enabled and upscale_factor > 1:
        try:
            _run_upscayl(
                settings,
                input_png,
                upscaled_png,
                low_quality=low_quality,
                scale=upscale_factor,
            )
            meta["upscaled"] = True
            meta["upscale_factor"] = upscale_factor
        except Exception as exc:
            meta["upscale_error"] = str(exc)[:240]
            if settings.upscale_required:
                raise VectorizationError(f"Falló el upscale con Upscayl: {exc}") from exc
            cv2.imwrite(str(upscaled_png), working_bgr)
    else:
        cv2.imwrite(str(upscaled_png), working_bgr)

    working_bgr = cv2.imread(str(upscaled_png))
    if working_bgr is None:
        raise VectorizationError("No se pudo leer la imagen preparada para mkbitmap.")
    gc.collect()

    bw, binarize_mode, mk_scale = _bitmap_from_bgr(
        working_bgr,
        tmp_dir,
        settings,
        low_quality=low_quality,
    )
    del working_bgr
    meta["binarize"] = binarize_mode
    meta["mkbitmap_scale"] = mk_scale

    if binarize_mode != "hard_otsu":
        bw = _solidify_bitmap(bw)
    bh, bw_w = bw.shape[:2]
    bw = _remove_speckles(bw, _min_speckle_area(bh, bw_w))
    _validate_bitmap(bw)
    return bw, meta


def _prepare_bitmap(
    input_bytes: bytes,
    tmp_dir: Path,
    settings: Settings,
) -> tuple[np.ndarray, dict[str, object]]:
    bgr = _load_to_bgr(input_bytes)
    bgr, bg_normalized = _normalize_neutral_background(bgr)
    _validate_eligibility(bgr)

    input_png = tmp_dir / "input.png"
    ai_png = tmp_dir / "ai_enhanced.png"
    cv2.imwrite(str(input_png), bgr)

    if settings.ai_enhance_enabled and settings.openai_api_key:
        meta_err: dict[str, object] = {}
        enhanced = None
        try:
            _run_openai_enhance(settings, input_png, ai_png)
            enhanced = cv2.imread(str(ai_png))
        except Exception as exc:
            meta_err = {"ai_enhance_error": str(exc)[:240]}
        finally:
            gc.collect()

        if enhanced is not None:
            return _prepare_bitmap_ai_minimal(
                enhanced,
                settings,
                bg_normalized=bg_normalized,
            )

        classic_bw, classic_meta = _prepare_bitmap_classic(
            input_bytes,
            tmp_dir,
            settings,
            bg_normalized=bg_normalized,
        )
        classic_meta.update(meta_err)
        return classic_bw, classic_meta

    return _prepare_bitmap_classic(
        input_bytes,
        tmp_dir,
        settings,
        bg_normalized=bg_normalized,
    )


def _write_preprocessed_files(
    input_bytes: bytes,
    tmp_dir: Path,
    settings: Settings,
) -> tuple[Path, Path, dict[str, object]]:
    source_bw_png = tmp_dir / "source_bw.png"
    bw_pbm = tmp_dir / "source_bw.pbm"

    bw, meta = _prepare_bitmap(input_bytes, tmp_dir, settings)
    cv2.imwrite(str(source_bw_png), bw)
    cv2.imwrite(str(bw_pbm), bw)
    return source_bw_png, bw_pbm, meta


def _potrace_params(mask_shape: tuple[int, int], *, ai_minimal: bool = False) -> dict[str, str]:
    long_side = max(mask_shape)

    if ai_minimal:
        if long_side >= 3000:
            turd, opt, alpha = "2", "0.2", "0.85"
        elif long_side >= 2000:
            turd, opt, alpha = "2", "0.22", "0.9"
        else:
            turd, opt, alpha = "3", "0.24", "0.95"
    elif long_side >= 3200:
        turd, opt, alpha = "4", "0.32", "1.05"
    elif long_side >= 2000:
        turd, opt, alpha = "4", "0.3", "1.05"
    else:
        turd, opt, alpha = "5", "0.28", "1.0"

    return {"turd": turd, "opt": opt, "alpha": alpha}


def _run_potrace_eps(
    settings: Settings,
    pbm_path: Path,
    output_eps: Path,
    *,
    ai_minimal: bool = False,
) -> bool:
    potrace_bin = _resolve_bin("potrace", settings.potrace_bin)
    if not potrace_bin:
        return False

    mask = cv2.imread(str(pbm_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return False

    params = _potrace_params(mask.shape[:2], ai_minimal=ai_minimal)
    cmd = [
        potrace_bin,
        str(pbm_path),
        "-b",
        "eps",
        "--tight",
        "-t",
        params["turd"],
        "-a",
        params["alpha"],
        "-O",
        params["opt"],
        "-u",
        "10",
        "-o",
        str(output_eps),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return output_eps.exists() and output_eps.stat().st_size > 0


def _build_preview_jpg(mask_path: Path, jpg_path: Path) -> bytes:
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise VectorizationError("No se pudo crear preview JPG (máscara inválida).")
    bgr = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    ok = cv2.imwrite(str(jpg_path), bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise VectorizationError("No se pudo escribir preview JPG.")
    return jpg_path.read_bytes()


def vectorize_logo(input_bytes: bytes, settings: Settings) -> tuple[bytes, bytes, str, dict[str, object]]:
    """Devuelve (vector_bytes, preview_jpg_bytes, ext, meta)."""
    with tempfile.TemporaryDirectory(prefix="vector-worker-") as tmp:
        tmp_dir = Path(tmp)
        source_bw_png, bw_pbm, meta = _write_preprocessed_files(input_bytes, tmp_dir, settings)
        output_eps = tmp_dir / "result.eps"
        preview_jpg = tmp_dir / "result_preview.jpg"
        preview_bytes = _build_preview_jpg(source_bw_png, preview_jpg)

        try:
            ai_minimal = meta.get("pipeline") == "ai_minimal"
            if _run_potrace_eps(settings, bw_pbm, output_eps, ai_minimal=ai_minimal):
                return output_eps.read_bytes(), preview_bytes, "eps", meta
        except Exception as exc:
            raise VectorizationError(f"No se pudo vectorizar con Potrace: {exc}") from exc

        raise VectorizationError("No se pudo vectorizar: falta potrace o el trazado EPS falló.")
