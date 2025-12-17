# Configuración de variables de entorno (Vite)

Este proyecto usa variables de entorno **en el frontend**, por eso deben comenzar con `VITE_`.

## Crear tu `.env` (local)

Creá un archivo `.env` en la raíz del proyecto con:

VITE_SUPABASE_URL=TU_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY

## Dónde obtener los valores

- `VITE_SUPABASE_URL`: Supabase → Project Settings → API → **Project URL**
- `VITE_SUPABASE_ANON_KEY`: Supabase → Project Settings → API → **anon public key**

> Nota: `.env` ya está ignorado por git en `.gitignore`.


