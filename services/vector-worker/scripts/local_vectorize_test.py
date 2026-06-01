from __future__ import annotations

import argparse
from pathlib import Path

from app.config import load_settings
from app.vectorize import VectorizationError, vectorize_logo


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueba local de vectorización (sin DB).")
    parser.add_argument("inputs", nargs="+", help="Rutas de imágenes base (png/jpg/webp).")
    parser.add_argument(
        "--out",
        default="artifacts/local-tests",
        help="Carpeta de salida para EPS/JPG generados.",
    )
    args = parser.parse_args()

    settings = load_settings()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    ok = 0
    fail = 0

    for raw_path in args.inputs:
        path = Path(raw_path)
        if not path.exists():
            print(f"[ERROR] No existe: {path}")
            fail += 1
            continue

        try:
            content = path.read_bytes()
            vector_bytes, preview_jpg, vector_ext, meta = vectorize_logo(content, settings)
            out_vector = out_dir / f"{path.stem}.{vector_ext}"
            out_jpg = out_dir / f"{path.stem}_preview.jpg"
            out_vector.write_bytes(vector_bytes)
            out_jpg.write_bytes(preview_jpg)
            print(
                f"[OK] {path.name} -> {out_vector} | {out_jpg} "
                f"(upscale={meta.get('upscaled')} x{meta.get('upscale_factor')} mkbitmap_s={meta.get('mkbitmap_scale')})"
            )
            ok += 1
        except VectorizationError as exc:
            print(f"[ERROR] {path.name}: {exc}")
            fail += 1
        except Exception as exc:
            print(f"[ERROR] {path.name}: fallo inesperado: {exc}")
            fail += 1

    print(f"\nResultado: {ok} OK / {fail} ERROR")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
