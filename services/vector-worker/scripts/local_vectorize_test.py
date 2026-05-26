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
            eps_bytes, preview_jpg = vectorize_logo(content, settings)
            out_eps = out_dir / f"{path.stem}.eps"
            out_jpg = out_dir / f"{path.stem}_preview.jpg"
            out_eps.write_bytes(eps_bytes)
            out_jpg.write_bytes(preview_jpg)
            print(f"[OK] {path.name} -> {out_eps} | {out_jpg}")
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
