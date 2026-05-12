#!/usr/bin/env python3
"""
ALCOHN — Generador de Mockups Realistas
========================================
Genera mockups de sellos de bronce sobre materiales.

Dos modos según material:
  MADERA / CARTÓN → Efecto quemado (burn/brand)
  CUERO / CUERINA → Efecto bajorrelieve (emboss/deboss)

Efectos comunes:
  - Perspectiva sutil
  - Desenfoque de profundidad (DOF) suave
  - Viñeta profesional
  - Color grading cálido

Texturas:
  - Por defecto se usan las de `public/mockup-textures/` del repo (cuero/madera + madera-quemada).
  - Opcional: carpeta `textures/` junto a este script (sobrescribe si existe).

Uso:
  python3 mockup_generator.py --input logo.png --output mockup.jpg --material madera
  python3 mockup_generator.py --input logo.png --output mockup.jpg --material cuero

Requiere:
  pip install Pillow numpy
"""

import argparse
import os
import sys
import math
import random

try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageDraw, ImageOps
    import numpy as np
except ImportError:
    print("Error: Necesitás instalar Pillow y numpy", file=sys.stderr)
    print("  pip install Pillow numpy", file=sys.stderr)
    sys.exit(1)


# ─── CONFIGURACIÓN ──────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 1) Carpeta local opcional: nuevo/textures/
# 2) Texturas del proyecto web (misma fuente que Vite: public/mockup-textures/)
_LOCAL_TEXTURES = os.path.join(SCRIPT_DIR, 'textures')
_REPO_TEXTURES = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', 'public', 'mockup-textures'))
TEXTURES_DIRS = [d for d in (_LOCAL_TEXTURES, _REPO_TEXTURES) if os.path.isdir(d)]

OUTPUT_WIDTH = 1400
OUTPUT_HEIGHT = 1000

LOGO_SCALE = 0.55

# Materiales que usan efecto quemado
BURN_MATERIALS = ('madera', 'carton')
# Materiales que usan efecto bajorrelieve
EMBOSS_MATERIALS = ('cuero', 'cuerina')

# Tintes de quemado para multiply blend (madera/cartón)
# tint: tono principal del quemado (multiply preserva la textura)
# deep_tint: para zonas de mayor intensidad de quemado
# edge_tint: transición suave en bordes del quemado
BURN_COLORS = {
    'madera': {
        'tint': (108, 72, 35),
        'deep_tint': (60, 32, 12),
        'edge_tint': (145, 108, 58),
        'glow': (210, 170, 110),
    },
    'carton': {
        'tint': (125, 88, 45),
        'deep_tint': (75, 45, 18),
        'edge_tint': (160, 125, 70),
        'glow': (215, 180, 125),
    },
}

# Colores base para texturas procedurales
MATERIAL_COLORS = {
    'madera':  (180, 145, 100),
    'cuero':   (150, 95, 50),
    'cuerina': (65, 58, 55),
    'carton':  (195, 170, 135),
}


# ─── TEXTURAS ────────────────────────────────────

def find_texture(material):
    """Busca una textura en textures/ locales o en public/mockup-textures del repo."""
    for root in TEXTURES_DIRS:
        for ext in ['jpg', 'jpeg', 'png', 'webp']:
            p = os.path.join(root, f'{material}.{ext}')
            if os.path.exists(p):
                return p
        for f in os.listdir(root):
            if material in f.lower() and f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                return os.path.join(root, f)
    return None


def generate_procedural_texture(width, height, material):
    """Genera textura procedural como fallback."""
    base = MATERIAL_COLORS.get(material, (180, 145, 100))
    img = np.zeros((height, width, 3), dtype=np.uint8)

    for c in range(3):
        noise = np.random.normal(0, 8, (height, width)).astype(np.int16)
        img[:, :, c] = np.clip(base[c] + noise, 0, 255).astype(np.uint8)

    if material in ('madera', 'carton'):
        # Vetas horizontales
        for y in range(height):
            wave = math.sin(y * 0.02 + random.uniform(0, 6.28)) * 6
            wave += math.sin(y * 0.005) * 12
            for c in range(3):
                img[y, :, c] = np.clip(img[y, :, c].astype(np.int16) + int(wave), 0, 255).astype(np.uint8)
    elif material in ('cuero', 'cuerina'):
        # Grano de cuero: ruido más fino y granular
        fine_noise = np.random.normal(0, 5, (height, width, 3)).astype(np.int16)
        img = np.clip(img.astype(np.int16) + fine_noise, 0, 255).astype(np.uint8)

    pil_img = Image.fromarray(img)
    pil_img = pil_img.filter(ImageFilter.GaussianBlur(radius=0.8))
    return pil_img


def prepare_background(material, texture_path=None):
    """Prepara el fondo del mockup."""
    if texture_path and os.path.exists(texture_path):
        bg = Image.open(texture_path).convert('RGB')
    else:
        auto = find_texture(material)
        if auto:
            bg = Image.open(auto).convert('RGB')
        else:
            return generate_procedural_texture(OUTPUT_WIDTH, OUTPUT_HEIGHT, material)

    # Redimensionar cubriendo todo el canvas
    bg_ratio = bg.width / bg.height
    target_ratio = OUTPUT_WIDTH / OUTPUT_HEIGHT
    if bg_ratio > target_ratio:
        new_h = OUTPUT_HEIGHT
        new_w = int(new_h * bg_ratio)
    else:
        new_w = OUTPUT_WIDTH
        new_h = int(new_w / bg_ratio)
    bg = bg.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - OUTPUT_WIDTH) // 2
    top = (new_h - OUTPUT_HEIGHT) // 2
    bg = bg.crop((left, top, left + OUTPUT_WIDTH, top + OUTPUT_HEIGHT))
    return bg


def prepare_logo(logo_path, target_width):
    """
    Carga y redimensiona el logo respetando ambos ejes.
    Si el logo es muy alto (ratio w/h < 1), escalar por ancho lo hace más alto
    que el fondo → posición centrada queda negativa y region termina siendo un
    stripe mínimo (ah=4) que rompe el broadcasting. Limitamos también por alto.
    """
    logo = Image.open(logo_path).convert('RGBA')
    ratio = logo.width / logo.height

    new_w = target_width
    new_h = int(new_w / ratio)

    # Cap por altura: no permitimos que el logo exceda el 85% del fondo en alto.
    max_h = int(OUTPUT_HEIGHT * 0.85)
    if new_h > max_h:
        new_h = max_h
        new_w = int(new_h * ratio)

    logo = logo.resize((new_w, new_h), Image.LANCZOS)
    return logo


def create_mask(logo):
    """
    Crea máscara nítida del logo.
    Blanco = zona del diseño, Negro = fondo.

    Aplica un umbral para que píxeles near-white del fondo NO se
    interpreten como diseño. Esto evita que la caja entera del PNG
    quede "quemada" como un cuadrado sobre la madera.
    """
    if logo.mode == 'RGBA':
        r, g, b, a = logo.split()
        gray = Image.merge('RGB', (r, g, b)).convert('L')
        gray = ImageOps.invert(gray)
        gray_np = np.array(gray).astype(np.float32)
        a_np = np.array(a).astype(np.float32) / 255.0
        gray_np = gray_np * a_np
    else:
        gray = logo.convert('L')
        gray = ImageOps.invert(gray)
        gray_np = np.array(gray).astype(np.float32)

    # Umbral suave: pixeles con inversión < 60 (≈ original > 195, casi blanco)
    # van a 0 (sin quema); > 200 (original < 55, negro pleno) quedan al máximo.
    # En el medio, interpolación lineal. Así se conservan los trazos del logo
    # y se eliminan los halos grises del fondo.
    gray_np = np.clip((gray_np - 60.0) * (255.0 / 140.0), 0.0, 255.0)

    return Image.fromarray(gray_np.astype(np.uint8))


# ─── EFECTO QUEMADO (MADERA / CARTÓN) ───────────

# Nombres de archivo esperados para textura quemada
BURN_TEXTURE_NAMES = {
    'madera': ['madera quemada', 'madera_quemada', 'burned_wood', 'wood_burn'],
    'carton': ['carton quemado', 'carton_quemado', 'burned_cardboard'],
}


def _load_burn_texture(material, width, height):
    """Carga la textura de material quemado y la redimensiona (cover crop)."""
    if not TEXTURES_DIRS:
        return None
    names = BURN_TEXTURE_NAMES.get(material, BURN_TEXTURE_NAMES['madera'])
    for root in TEXTURES_DIRS:
        for f in os.listdir(root):
            fname_lower = os.path.splitext(f)[0].lower()
            if not any(n in fname_lower for n in names):
                continue
            path = os.path.join(root, f)
            tex = Image.open(path).convert('RGB')
            tex_r = tex.width / tex.height
            tgt_r = width / height
            if tex_r > tgt_r:
                new_h = height
                new_w = int(new_h * tex_r)
            else:
                new_w = width
                new_h = int(new_w / tgt_r)
            tex = tex.resize((new_w, new_h), Image.LANCZOS)
            left = (new_w - width) // 2
            top = (new_h - height) // 2
            return tex.crop((left, top, left + width, top + height))
    return None


def apply_burn_effect(background, logo, material, position):
    """
    Pirografía realista. Si existe textura de madera quemada, la usa como
    capa de color via multiply (preserva la veta original + agrega detalle
    real de carbonización). Fallback a tintes matemáticos si no hay textura.
    Incluye glow cálido, imperfecciones por trama y profundidad 3D.
    """
    bg = background.copy()
    bg_np = np.array(bg).astype(np.float32)
    colors = BURN_COLORS.get(material, BURN_COLORS['madera'])
    x, y = position
    logo_w, logo_h = logo.size

    # ─── MÁSCARA PRINCIPAL ───
    main_mask = create_mask(logo)
    mask_np_raw = np.array(main_mask).astype(np.float32) / 255.0

    edge_zone = (mask_np_raw > 0.05) & (mask_np_raw < 0.95)
    micro_noise = np.random.normal(0, 0.08, mask_np_raw.shape).astype(np.float32)
    mask_np_raw = np.where(edge_zone,
                           np.clip(mask_np_raw + micro_noise, 0, 1),
                           mask_np_raw)
    main_mask = Image.fromarray((mask_np_raw * 255).astype(np.uint8))
    main_mask = main_mask.filter(ImageFilter.GaussianBlur(radius=0.7))
    main_np = np.array(main_mask).astype(np.float32) / 255.0

    # ─── MÁSCARA DE BORDES CHAMUSCADOS ───
    edge_mask = create_mask(logo)
    edge_mask = edge_mask.filter(ImageFilter.MaxFilter(size=5))
    edge_mask = edge_mask.filter(ImageFilter.GaussianBlur(radius=3.5))
    edge_np = np.array(edge_mask).astype(np.float32) / 255.0
    edge_only = np.clip(edge_np - main_np * 0.75, 0, 1)

    # ─── MÁSCARA DE GLOW (irregular) ───
    glow_mask = create_mask(logo)
    glow_mask = glow_mask.filter(ImageFilter.MaxFilter(size=11))
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(radius=16.0))
    glow_np = np.array(glow_mask).astype(np.float32) / 255.0
    # Ruido de baja frecuencia para que el glow varíe en distancia/intensidad
    glow_noise = np.random.normal(1.0, 0.35, (logo_h, logo_w)).astype(np.float32)
    glow_noise = np.array(
        Image.fromarray((np.clip(glow_noise, 0, 2) * 127).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(radius=18.0))
    ).astype(np.float32) / 127.0
    glow_np = glow_np * glow_noise
    glow_only = np.clip(glow_np - main_np * 0.80 - edge_only * 0.35, 0, 1)

    # ─── RECORTAR REGIÓN ───
    region = bg_np[y:y+logo_h, x:x+logo_w]
    ah, aw = region.shape[:2]
    if ah != logo_h or aw != logo_w:
        main_np = main_np[:ah, :aw]
        edge_only = edge_only[:ah, :aw]
        glow_only = glow_only[:ah, :aw]

    # ─── IMPERFECCIONES POR TRAMA DE MADERA ───
    wood_lum = np.mean(region, axis=2) / 255.0
    wood_lum_blurred = np.array(
        Image.fromarray((wood_lum * 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(radius=1.5))
    ).astype(np.float32) / 255.0
    grain_range = wood_lum_blurred.max() - wood_lum_blurred.min() + 1e-6
    grain_mod = 0.85 + (wood_lum_blurred - wood_lum_blurred.min()) / grain_range * 0.30
    main_np_mod = np.clip(main_np * grain_mod, 0, 1)

    # ─── GLOW CÁLIDO ───
    glow_color = np.array(colors['glow'], dtype=np.float32)
    glow_strength = 0.28
    for c in range(3):
        glow_blend = (region[:, :, c] * glow_color[c]) / 255.0
        region[:, :, c] = region[:, :, c] * (1 - glow_only * glow_strength) + \
            glow_blend * (glow_only * glow_strength)

    # ─── QUEMADO: TEXTURA REAL O FALLBACK MATEMÁTICO ───
    burn_tex = _load_burn_texture(material, logo_w, logo_h)

    if burn_tex is not None:
        burn_tex_np = np.array(burn_tex).astype(np.float32)[:ah, :aw]

        # La textura quemada es muy oscura (~35 promedio). La aclaramos para que
        # funcione como capa multiply sin aplastar todo a negro.
        # Factor variable: zonas densas de la máscara → menos aclarado (más oscuro)
        lighten_base = 2.4
        lighten_deep = 1.6
        depth_factor = np.clip(main_np_mod * 1.3, 0, 1)
        lighten_map = lighten_base - (lighten_base - lighten_deep) * depth_factor
        lighten_3d = lighten_map[:, :, np.newaxis]
        burn_tex_lit = np.clip(burn_tex_np * lighten_3d, 0, 255)

        # Multiply: preserva veta original + agrega color/detalle real de carbonización
        burn_result = (region * burn_tex_lit) / 255.0

        mask_3d = main_np_mod[:, :, np.newaxis]
        region[:] = region * (1 - mask_3d) + burn_result * mask_3d
        print("[mockup] Usando textura real de madera quemada")
    else:
        # Fallback: multiply con tintes matemáticos
        tint = np.array(colors['tint'], dtype=np.float32)
        deep_tint = np.array(colors['deep_tint'], dtype=np.float32)

        primary_burn = np.zeros_like(region)
        deep_burn = np.zeros_like(region)
        for c in range(3):
            primary_burn[:, :, c] = (region[:, :, c] * tint[c]) / 255.0
            deep_burn[:, :, c] = (region[:, :, c] * deep_tint[c]) / 255.0

        depth_factor = np.clip(main_np_mod * 1.3, 0, 1)[:, :, np.newaxis]
        burn_result = primary_burn * (1 - depth_factor * 0.45) + deep_burn * (depth_factor * 0.45)

        mask_3d = main_np_mod[:, :, np.newaxis]
        region[:] = region * (1 - mask_3d) + burn_result * mask_3d
        print("[mockup] Fallback: tintes matemáticos (sin textura quemada)")

    # ─── TRANSICIÓN DE BORDES ───
    edge_tint = np.array(colors['edge_tint'], dtype=np.float32)
    edge_burn = np.zeros_like(region)
    for c in range(3):
        edge_burn[:, :, c] = (region[:, :, c] * edge_tint[c]) / 255.0
    edge_3d = edge_only[:, :, np.newaxis]
    region[:] = region * (1 - edge_3d * 0.35) + edge_burn * (edge_3d * 0.35)

    # ─── BISELADO / BAJORRELIEVE ───
    # Iluminación desde arriba-izquierda: sombra abajo-derecha, highlight arriba-izquierda
    bevel_off = 3
    if bevel_off < ah and bevel_off < aw:
        # Sombra interior (borde inferior-derecho del grabado)
        s_mask = np.zeros_like(main_np)
        s_mask[bevel_off:, bevel_off:] = main_np[:-bevel_off, :-bevel_off]
        inner_s = np.clip(s_mask - main_np * 0.4, 0, 1) * main_np
        inner_s_img = Image.fromarray((inner_s * 255).astype(np.uint8))
        inner_s_img = inner_s_img.filter(ImageFilter.GaussianBlur(radius=1.8))
        inner_s = np.array(inner_s_img).astype(np.float32) / 255.0
        if inner_s.shape[0] != ah or inner_s.shape[1] != aw:
            inner_s = inner_s[:ah, :aw]

        # Highlight interior (borde superior-izquierdo del grabado)
        h_mask = np.zeros_like(main_np)
        h_mask[:-bevel_off, :-bevel_off] = main_np[bevel_off:, bevel_off:]
        inner_h = np.clip(h_mask - main_np * 0.4, 0, 1) * main_np
        inner_h_img = Image.fromarray((inner_h * 255).astype(np.uint8))
        inner_h_img = inner_h_img.filter(ImageFilter.GaussianBlur(radius=1.5))
        inner_h = np.array(inner_h_img).astype(np.float32) / 255.0
        if inner_h.shape[0] != ah or inner_h.shape[1] != aw:
            inner_h = inner_h[:ah, :aw]

        # Contorno exterior hundido (borde fino alrededor del grabado)
        outer_edge = create_mask(logo)
        outer_dilated = outer_edge.filter(ImageFilter.MaxFilter(size=3))
        outer_dilated_np = np.array(outer_dilated).astype(np.float32) / 255.0
        # IMPORTANTE: outer_dilated_np viene del logo completo (logo_h × logo_w).
        # Si region fue recortada (logo cae cerca/fuera del borde del fondo),
        # main_np ya está en (ah, aw) y la resta rompía el broadcasting.
        # Alineamos SIEMPRE antes de la operación.
        if outer_dilated_np.shape[0] != ah or outer_dilated_np.shape[1] != aw:
            outer_dilated_np = outer_dilated_np[:ah, :aw]
        outline = np.clip(outer_dilated_np - main_np, 0, 1)
        outline_img = Image.fromarray((outline * 255).astype(np.uint8))
        outline_img = outline_img.filter(ImageFilter.GaussianBlur(radius=0.8))
        outline = np.array(outline_img).astype(np.float32) / 255.0
        if outline.shape[0] != ah or outline.shape[1] != aw:
            outline = outline[:ah, :aw]

        for c in range(3):
            region[:, :, c] = region[:, :, c] * (1 - inner_s * 0.38)
            region[:, :, c] = region[:, :, c] + (255 - region[:, :, c]) * inner_h * 0.22
            region[:, :, c] = region[:, :, c] * (1 - outline * 0.28)

    # ─── RUIDO DE CARBONIZACIÓN ───
    noise = np.random.normal(0, 2.5, region.shape).astype(np.float32)
    noise_mask = np.stack([main_np] * 3, axis=-1)
    region[:] = region + noise * noise_mask

    bg_np[y:y+logo_h, x:x+logo_w] = np.clip(region, 0, 255)
    return Image.fromarray(bg_np.astype(np.uint8))


# ─── EFECTO BAJORRELIEVE (CUERO / CUERINA) ──────

def apply_emboss_effect(background, logo, material, position):
    """
    Bajorrelieve realista por bisel direccional.
    Sin contornos explícitos: la profundidad surge de la sombra y la luz
    en los bordes del diseño, como en cuero prensado real.
    """
    bg = background.copy()
    bg_np = np.array(bg).astype(np.float32)
    x, y = position
    logo_w, logo_h = logo.size

    # ─── MÁSCARA PRINCIPAL ───
    mask = create_mask(logo)
    mask_pil = mask.filter(ImageFilter.GaussianBlur(radius=0.5))
    mask_np = np.array(mask_pil).astype(np.float32) / 255.0

    # ─── MAPA DE ALTURA → BISEL REDONDEADO ───
    # Blur más amplio para transición gradual + smoothstep para perfil curvo
    height_map_pil = mask.filter(ImageFilter.GaussianBlur(radius=3.0))
    height_np = np.array(height_map_pil).astype(np.float32) / 255.0

    # Smoothstep: convierte la rampa lineal en curva S (bisel redondeado/bombeado)
    # f(x) = 3x² - 2x³ → paredes curvas en vez de rectas
    height_np = height_np * height_np * (3.0 - 2.0 * height_np)

    # Labio externo: el cuero se "infla" justo afuera del grabado
    # Se crea con la diferencia entre la máscara dilatada y la original
    rim_pil = mask.filter(ImageFilter.MaxFilter(size=7))
    rim_pil = rim_pil.filter(ImageFilter.GaussianBlur(radius=4.0))
    rim_np = np.array(rim_pil).astype(np.float32) / 255.0
    rim_bump = np.clip(rim_np - mask_np * 0.85, 0, 1)
    rim_bump_smooth = np.array(
        Image.fromarray((rim_bump * 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(radius=2.0))
    ).astype(np.float32) / 255.0
    # El rim eleva ligeramente el height map afuera → crea el "inflado"
    height_np = height_np - rim_bump_smooth * 0.15

    # Gradiente del height map → dirección de la pendiente
    grad_y = np.zeros_like(height_np)
    grad_x = np.zeros_like(height_np)
    grad_y[1:-1, :] = (height_np[2:, :] - height_np[:-2, :]) / 2.0
    grad_x[:, 1:-1] = (height_np[:, 2:] - height_np[:, :-2]) / 2.0

    # Iluminación desde arriba-izquierda
    light_x, light_y = -0.7, -0.7
    dot_product = grad_x * light_x + grad_y * light_y

    shadow_map = np.clip(-dot_product * 14.0, 0, 1)
    highlight_map = np.clip(dot_product * 7.0, 0, 1)

    # Suavizar
    shadow_pil = Image.fromarray((shadow_map * 255).astype(np.uint8))
    shadow_pil = shadow_pil.filter(ImageFilter.GaussianBlur(radius=1.0))
    shadow_map = np.array(shadow_pil).astype(np.float32) / 255.0

    highlight_pil = Image.fromarray((highlight_map * 255).astype(np.uint8))
    highlight_pil = highlight_pil.filter(ImageFilter.GaussianBlur(radius=0.8))
    highlight_map = np.array(highlight_pil).astype(np.float32) / 255.0

    # ─── APLICAR AL FONDO ───
    region = bg_np[y:y+logo_h, x:x+logo_w]
    ah, aw = region.shape[:2]
    if ah != logo_h or aw != logo_w:
        mask_np = mask_np[:ah, :aw]
        shadow_map = shadow_map[:ah, :aw]
        highlight_map = highlight_map[:ah, :aw]

    # 1. Compresión sutil de textura (el cuero prensado alisa el grano)
    region_blurred = np.array(
        Image.fromarray(np.clip(region, 0, 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(radius=0.8))
    ).astype(np.float32)
    mask_3d = mask_np[:, :, np.newaxis]
    region[:] = region * (1 - mask_3d * 0.25) + region_blurred * (mask_3d * 0.25)

    # Sombras hacia marrón oscuro cálido en vez de negro puro
    shadow_tint = np.array([65, 38, 18], dtype=np.float32)

    # 2. Oscurecimiento de la zona prensada
    for c in range(3):
        region[:, :, c] = region[:, :, c] * (1 - mask_np * 0.32)

    # 3. Sombra del bisel → mezcla entre oscurecer y tinte marrón
    for c in range(3):
        darkened = region[:, :, c] * (1 - shadow_map * 0.65)
        tinted = region[:, :, c] * (1 - shadow_map * 0.50) + shadow_tint[c] * (shadow_map * 0.50)
        region[:, :, c] = darkened * 0.5 + tinted * 0.5

    # 4. Highlight del bisel (borde que mira hacia la luz → claro)
    for c in range(3):
        region[:, :, c] = region[:, :, c] + (255 - region[:, :, c]) * highlight_map * 0.22

    # 5. Drop shadow externo suave (sombra difusa alrededor del deboss)
    drop_mask = mask.filter(ImageFilter.GaussianBlur(radius=5.0))
    drop_np = np.array(drop_mask).astype(np.float32) / 255.0
    # drop_np viene del logo completo; mask_np ya está recortado a (ah, aw) si
    # region fue cropeado. Alineamos antes de la resta para evitar el
    # "operands could not be broadcast together" que rompe todo el mockup.
    if drop_np.shape[0] != ah or drop_np.shape[1] != aw:
        drop_np = drop_np[:ah, :aw]
    drop_only = np.clip(drop_np - mask_np * 0.8, 0, 1)
    for c in range(3):
        region[:, :, c] = region[:, :, c] * (1 - drop_only * 0.12)

    bg_np[y:y+logo_h, x:x+logo_w] = np.clip(region, 0, 255)
    return Image.fromarray(bg_np.astype(np.uint8))


# ─── EFECTOS GLOBALES ────────────────────────────

def apply_perspective(img, strength=0.04):
    """Perspectiva sutil como foto en ángulo."""
    w, h = img.size
    ox = int(w * strength)
    oy = int(h * strength * 0.5)

    dst = [
        (ox, oy),
        (w - int(ox * 0.3), 0),
        (w - int(ox * 0.1), h - int(oy * 0.3)),
        (int(ox * 0.5), h - oy)
    ]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    coeffs = _perspective_coeffs(dst, src)

    # Color de relleno basado en esquina de la imagen
    fill = tuple(np.array(img).astype(np.uint8)[h//2, 10, :3].tolist())

    return img.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=fill)


def _perspective_coeffs(source, target):
    matrix = []
    for s, t in zip(source, target):
        matrix.append([t[0], t[1], 1, 0, 0, 0, -s[0]*t[0], -s[0]*t[1]])
        matrix.append([0, 0, 0, t[0], t[1], 1, -s[1]*t[0], -s[1]*t[1]])
    A = np.matrix(matrix, dtype=np.float64)
    B = np.array([s for pair in source for s in pair]).reshape(8)
    res = np.dot(np.linalg.inv(A.T * A) * A.T, B)
    return np.array(res).reshape(8).tolist()


def apply_depth_of_field(img, blur_strength=2.5):
    """DOF suave — solo los bordes se desenfocan ligeramente."""
    w, h = img.size
    cx, cy = w // 2, h // 2

    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt(((X - cx) / (w * 0.65)) ** 2 + ((Y - cy) / (h * 0.65)) ** 2)
    dist = np.clip(dist, 0, 1)
    blur_map = dist ** 2.5  # Más concentrado en los bordes

    img_np = np.array(img).astype(np.float32)
    blurred = np.array(img.filter(ImageFilter.GaussianBlur(radius=blur_strength))).astype(np.float32)

    result = img_np * (1 - blur_map[:, :, np.newaxis]) + blurred * blur_map[:, :, np.newaxis]
    return Image.fromarray(np.clip(result, 0, 255).astype(np.uint8))


def apply_vignette(img, strength=0.3):
    """Viñeta sutil en los bordes."""
    w, h = img.size
    img_np = np.array(img).astype(np.float32)
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt(((X - w/2) / (w * 0.55)) ** 2 + ((Y - h/2) / (h * 0.55)) ** 2)
    vignette = 1.0 - np.clip(dist ** 2 * strength, 0, strength)
    for c in range(3):
        img_np[:, :, c] = img_np[:, :, c] * vignette
    return Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))


def apply_color_grade(img, warmth=1.06):
    """Color grading cálido sutil."""
    img_np = np.array(img).astype(np.float32)
    img_np[:, :, 0] = np.clip(img_np[:, :, 0] * warmth, 0, 255)
    img_np[:, :, 1] = np.clip(img_np[:, :, 1] * (warmth * 0.98), 0, 255)
    img_np[:, :, 2] = np.clip(img_np[:, :, 2] * 0.93, 0, 255)
    result = Image.fromarray(img_np.astype(np.uint8))
    result = ImageEnhance.Contrast(result).enhance(1.06)
    return result


# ─── FUNCIÓN PRINCIPAL ───────────────────────────

def generate_mockup(
    logo_path, output_path,
    material='madera', texture_path=None,
    medida=None, perspective=True, dof=True, vignette=True
):
    print(f"[mockup] Material: {material}, logo: {logo_path}")

    # 1. Fondo
    bg = prepare_background(material, texture_path)
    print(f"[mockup] Fondo: {bg.size[0]}x{bg.size[1]}")

    # 2. Logo
    target_w = int(OUTPUT_WIDTH * LOGO_SCALE)
    logo = prepare_logo(logo_path, target_w)
    print(f"[mockup] Logo: {logo.size[0]}x{logo.size[1]}")

    # 3. Posición centrada
    px = (bg.size[0] - logo.size[0]) // 2
    py = (bg.size[1] - logo.size[1]) // 2

    # 4. Aplicar efecto según material
    if material in EMBOSS_MATERIALS:
        result = apply_emboss_effect(bg, logo, material, (px, py))
        print("[mockup] Efecto bajorrelieve aplicado")
    else:
        result = apply_burn_effect(bg, logo, material, (px, py))
        print("[mockup] Efecto quemado aplicado")

    # 5. Perspectiva
    if perspective:
        result = apply_perspective(result, strength=0.035)
        print("[mockup] Perspectiva aplicada")

    # 6. DOF suave
    if dof:
        result = apply_depth_of_field(result, blur_strength=1.8)
        print("[mockup] DOF aplicado")

    # 7. Viñeta
    if vignette:
        result = apply_vignette(result, strength=0.25)
        print("[mockup] Viñeta aplicada")

    # 8. Color grading
    result = apply_color_grade(result)
    print("[mockup] Color grading aplicado")

    # 9. Guardar
    result.save(output_path, 'JPEG', quality=92)
    print(f"[mockup] Guardado: {output_path}")
    return output_path


# ─── CLI ─────────────────────────────────────────

def _seed_from_inputs(logo_path: str, material: str, medida: str | None) -> int:
    """
    Deriva una semilla determinística a partir del contenido del logo + material
    + medida. Antes el script usaba `random` y `numpy.random` sin seed, así que
    dos llamadas con el mismo logo producían mockups visualmente distintos
    (ruido de carbonización, posiciones de imperfecciones). El cliente lo nota
    y le da sensación de "esto es generado, no es la pieza real".

    Con seed:
      - Mismo logo + mismo material + misma medida → mismo mockup, siempre.
      - Logos distintos → mockups distintos (cada uno con su propio "ruido").
    """
    import hashlib
    h = hashlib.sha1()
    try:
        with open(logo_path, 'rb') as f:
            h.update(f.read())
    except Exception:
        h.update(logo_path.encode('utf-8', errors='ignore'))
    h.update(b'|')
    h.update((material or '').encode('utf-8'))
    h.update(b'|')
    h.update((medida or '').encode('utf-8'))
    # Tomamos los primeros 8 bytes como entero — suficiente para sembrar.
    return int.from_bytes(h.digest()[:8], 'big')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generador de mockups Alcohn')
    parser.add_argument('--input', '-i', required=True)
    parser.add_argument('--output', '-o', required=True)
    parser.add_argument('--material', '-m', default='madera',
                       choices=['madera', 'cuero', 'cuerina', 'carton'])
    parser.add_argument('--texture', '-t', default=None)
    parser.add_argument('--medida', default=None)
    parser.add_argument('--no-perspective', action='store_true')
    parser.add_argument('--no-dof', action='store_true')
    parser.add_argument('--no-vignette', action='store_true')
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: No se encontró: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Sembrar RNG ANTES de generar — todo el ruido procedural queda determinístico
    # respecto al input. random.seed cubre los `random.uniform`/`random.choice`,
    # numpy.random.seed cubre los `np.random.normal` del ruido de carbonización.
    _seed = _seed_from_inputs(args.input, args.material, args.medida) & 0xFFFFFFFF
    random.seed(_seed)
    np.random.seed(_seed)

    generate_mockup(
        logo_path=args.input,
        output_path=args.output,
        material=args.material,
        texture_path=args.texture,
        medida=args.medida,
        perspective=not args.no_perspective,
        dof=not args.no_dof,
        vignette=not args.no_vignette
    )
