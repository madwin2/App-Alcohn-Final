#!/usr/bin/env python3
import json
import urllib.request

url = (
    "https://pymes.andreani.com/api/sucursales/byCoordenadas"
    "?esOrigen=true&tipoDeEnvio=8d323f9e-c3a4-445f-b18f-2976158dc504"
    "&lat=-38.01373&lng=-57.53949"
)

# En el VPS usamos curl con socks; este script recibe JSON por stdin.
data = json.load(open(0))
print("count", len(data))
for x in data:
    nombre = x.get("nombre") or x.get("descripcion") or x.get("razonSocial") or ""
    tipo = x.get("tipo") or ""
    direccion = (x.get("direccion") or "")[:70]
    print(f"{tipo} | {nombre} | {direccion}")

hits = [
    x
    for x in data
    if "kiosko" in json.dumps(x, ensure_ascii=False).lower()
]
print("kiosko_hits", len(hits))
