from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .config import Settings


class VectorizationError(RuntimeError):
    pass


def _load_to_bgr(input_bytes: bytes) -> np.ndarray:
    # Carga robusta en memoria
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


def _normalize_to_black_foreground(binary_img: np.ndarray) -> np.ndarray:
    """Devuelve máscara con foreground negro (0) y fondo blanco (255)."""
    if binary_img.ndim != 2:
        raise ValueError("Se esperaba imagen binaria 2D")

    bw = np.where(binary_img > 127, 255, 0).astype(np.uint8)
    border = _border_values(bw)
    border_black_ratio = float(np.mean(border == 0))
    fg_ratio = float(np.mean(bw == 0))

    # Si el borde quedó negro, normalmente se invirtió (fondo detectado como logo).
    if border_black_ratio > 0.3 or fg_ratio > 0.7:
        bw = 255 - bw
    return bw


def _polish_mask(mask: np.ndarray) -> np.ndarray:
    kernel = np.ones((2, 2), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    return mask


def _candidate_from_otsu(gray: np.ndarray) -> np.ndarray:
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return _polish_mask(_normalize_to_black_foreground(th))


def _analyze_simple_bw_eligibility(bgr: np.ndarray) -> tuple[bool, str, np.ndarray]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    border = _border_values(gray)
    white_bg_ratio = float(np.mean(border >= 236))
    if white_bg_ratio < 0.9:
        return False, "Fondo no parece blanco uniforme.", np.zeros_like(gray, dtype=np.uint8)

    # Si hay mucho color saturado no es un caso simple B/N.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat_ratio = float(np.mean(hsv[:, :, 1] > 45))
    if sat_ratio > 0.18:
        return False, "Imagen con demasiado color/saturación para modo simple.", np.zeros_like(gray, dtype=np.uint8)

    bw = _candidate_from_otsu(gray)
    fg = (bw == 0).astype(np.uint8)
    fg_ratio = float(np.mean(fg))
    if fg_ratio < 0.015 or fg_ratio > 0.55:
        return False, "Proporción de trazo fuera de rango para logo simple.", bw

    n_labels, _labels, stats, _centroids = cv2.connectedComponentsWithStats(fg, connectivity=8)
    component_count = max(0, n_labels - 1)
    if component_count > 260:
        return False, "Demasiado ruido/componentes para vectorizar automático.", bw

    if component_count > 0:
        largest = int(stats[1:, cv2.CC_STAT_AREA].max())
        fg_pixels = max(1, int(np.sum(fg)))
        largest_ratio = float(largest / fg_pixels)
        if largest_ratio < 0.08:
            return False, "No se detecta una forma principal suficientemente clara.", bw

    return True, "ok", bw


def _write_preprocessed_files(input_bytes: bytes, tmp_dir: Path) -> tuple[Path, Path]:
    source_bw_png = tmp_dir / "source_bw.png"
    bw_pbm = tmp_dir / "source_bw.pbm"

    bgr = _load_to_bgr(input_bytes)
    ok, reason, bw = _analyze_simple_bw_eligibility(bgr)
    if not ok:
        raise VectorizationError(f"Logo no apto para vectorización automática: {reason}")

    cv2.imwrite(str(source_bw_png), bw)
    cv2.imwrite(str(bw_pbm), bw)
    return source_bw_png, bw_pbm


def _run_potrace_eps(settings: Settings, pbm_path: Path, output_eps: Path) -> bool:
    potrace_bin = shutil.which(settings.potrace_bin)
    if not potrace_bin:
        return False
    cmd = [
        potrace_bin,
        str(pbm_path),
        "-b",
        "eps",
        "--tight",
        "-t",
        "4",
        "-a",
        "1",
        "-O",
        "0.2",
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


def vectorize_logo(input_bytes: bytes, settings: Settings) -> tuple[bytes, bytes]:
    with tempfile.TemporaryDirectory(prefix="vector-worker-") as tmp:
        tmp_dir = Path(tmp)
        source_bw_png, bw_pbm = _write_preprocessed_files(input_bytes, tmp_dir)
        output_eps = tmp_dir / "result.eps"
        preview_jpg = tmp_dir / "result_preview.jpg"

        errors: list[str] = []
        try:
            if _run_potrace_eps(settings, bw_pbm, output_eps):
                return output_eps.read_bytes(), _build_preview_jpg(source_bw_png, preview_jpg)
        except Exception as exc:
            errors.append(f"potrace: {exc}")

        message = "No se pudo vectorizar: falta potrace o el trazado EPS falló."
        if errors:
            message = f"{message} Detalles: {' | '.join(errors)}"
        raise VectorizationError(message)
