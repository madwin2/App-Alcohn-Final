#!/usr/bin/env python3
"""
Convierte el Excel MiCorreo (códigos sucursales + provincias) al formato de `public.correo_sucursales`.

Uso típico (genera CSV para importar en Supabase):
  pip install pandas openpyxl
  python scripts/import_correo_sucursales_xlsx.py "codigos_sucursales_y_provincias_MiCorreo (3).xlsx" -o correo_sucursales_nuevo.csv

Luego en Supabase (reemplazo completo del padrón, lo más simple):
  1) SQL Editor → ejecutar:  TRUNCATE public.correo_sucursales RESTART IDENTITY;
     (solo datos de referencia; no debería haber FKs hacia esta tabla.)
  2) Table Editor → correo_sucursales → Insert → Import data from CSV → subir el CSV generado
  3) Mapear columnas: codigo, calle, numero, localidad, provincia, horarios (activa queda default true)

Upsert directo (actualiza por código, inserta nuevas; requiere service role):
  set SUPABASE_URL=...  set SUPABASE_SERVICE_ROLE_KEY=...
  python scripts/import_correo_sucursales_xlsx.py archivo.xlsx --upsert
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path


def strip_accents_upper(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.upper().strip()


def normalize_key(raw: str) -> str:
    k = strip_accents_upper(str(raw))
    k = re.sub(r"\s+", "_", k)
    k = k.replace("CODIGO", "CODIGO").replace("NUMERO", "NUMERO")
    return k


# Encabezados posibles del Excel MiCorreo → nombre columna BD
HEADER_ALIASES: dict[str, str] = {
    "CODIGO": "codigo",
    "CODIGO_SUCURSAL": "codigo",
    "CALLE": "calle",
    "NUMERO": "numero",
    "NRO": "numero",
    "LOCALIDAD": "localidad",
    "CIUDAD": "localidad",
    "PROVINCIA": "provincia",
    "HORARIOS": "horarios",
    "HORARIO": "horarios",
}


def map_columns(df_columns: list[str]) -> dict[str, str]:
    """Devuelve {columna_excel: nombre_bd}."""
    out: dict[str, str] = {}
    for col in df_columns:
        nk = normalize_key(col)
        nk = nk.rstrip("_")
        target = HEADER_ALIASES.get(nk)
        if target:
            out[col] = target
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="Excel MiCorreo → CSV correo_sucursales (Supabase)")
    p.add_argument("xlsx", type=Path, help="Ruta al .xlsx")
    p.add_argument("-o", "--out-csv", type=Path, help="Salida CSV (UTF-8). Si omitís --upsert, conviene pasar -o.")
    p.add_argument("--sheet", type=int, default=0, help="Índice de hoja (0 = primera)")
    p.add_argument(
        "--upsert",
        action="store_true",
        help="Subir a Supabase con upsert (on_conflict=codigo). Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
    )
    args = p.parse_args()

    if not args.xlsx.is_file():
        print(f"No existe el archivo: {args.xlsx}", file=sys.stderr)
        return 1

    try:
        import pandas as pd
    except ImportError:
        print("Instalá dependencias: pip install pandas openpyxl", file=sys.stderr)
        return 1

    df = pd.read_excel(args.xlsx, sheet_name=args.sheet, engine="openpyxl")
    mapping = map_columns(list(df.columns))
    required = {"codigo", "calle", "localidad", "provincia"}
    mapped_targets = set(mapping.values())
    if not required.issubset(mapped_targets):
        print("No se pudieron detectar columnas obligatorias.", file=sys.stderr)
        print(f"  Columnas del Excel: {list(df.columns)}", file=sys.stderr)
        print(f"  Mapeo obtenido: {mapping}", file=sys.stderr)
        print("  Esperado al menos: codigo, calle, localidad, provincia (y opcional numero, horarios).", file=sys.stderr)
        return 1

    inv = {v: k for k, v in mapping.items()}
    n = len(df)
    serie_numero = (
        df[inv["numero"]].astype(str).str.strip() if "numero" in inv else pd.Series([""] * n, index=df.index)
    )
    serie_hor = (
        df[inv["horarios"]].astype(str).str.strip() if "horarios" in inv else pd.Series([""] * n, index=df.index)
    )
    out_df = pd.DataFrame(
        {
            "codigo": df[inv["codigo"]].astype(str).str.strip(),
            "calle": df[inv["calle"]].astype(str).str.strip(),
            "numero": serie_numero,
            "localidad": df[inv["localidad"]].astype(str).str.strip(),
            "provincia": df[inv["provincia"]].astype(str).str.strip(),
            "horarios": serie_hor,
        }
    )
    for col in out_df.columns:
        out_df[col] = out_df[col].replace({"nan": "", "None": "", "<NA>": ""}, regex=False)
    out_df = out_df[out_df["codigo"].str.len() > 0]
    out_df = out_df.drop_duplicates(subset=["codigo"], keep="last")

    records = out_df.to_dict("records")
    for r in records:
        num = (r.get("numero") or "").strip()
        r["numero"] = num if num else None

    if args.upsert:
        import os

        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            print("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.", file=sys.stderr)
            return 1
        try:
            from supabase import create_client
        except ImportError:
            print("Para --upsert: pip install supabase", file=sys.stderr)
            return 1

        client = create_client(url, key)
        batch = 400
        for i in range(0, len(records), batch):
            chunk = records[i : i + batch]
            client.table("correo_sucursales").upsert(chunk, on_conflict="codigo").execute()
        print(f"Upsert OK: {len(records)} filas (conflicto por codigo).")
        return 0

    if not args.out_csv:
        print("Pasá -o archivo.csv o usá --upsert.", file=sys.stderr)
        return 1

    out_df.to_csv(args.out_csv, index=False, encoding="utf-8-sig")
    print(f"CSV generado: {args.out_csv} ({len(out_df)} filas).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
