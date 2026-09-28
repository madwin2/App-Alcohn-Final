# Despliegue y mantenimiento técnico

## Lo que se sabe del código

| Pieza | Cómo se despliega (evidencia) |
|---|---|
| SPA + `/api` | 🔶 **Vercel** (`api/*.js` con `export const config`, commit "trigger Vercel redeploy", `VERCEL_ENV` en `debug-env`). `npm run build` genera `version.json` + `vite build` → `dist/`. |
| Edge Functions | Manual (Supabase CLI o MCP). Restos de despliegue manual en la raíz: `_deploy_*.json`, `_mcp_*`, `_b64_*.txt`, `_chunk_*`, `_programa_sync_*`, `tmp-deploy-content.txt`, `_deploy_programa_sync.py`, `_prep_mcp_deploy.py`. No hay `supabase/config.toml` global ni migraciones versionadas por CLI. |
| Migraciones SQL | Archivos `migration_*.sql` en la raíz, aplicados a mano en el SQL Editor (muchos documentan "✅ ya aplicada"). No hay tabla de control de migraciones del repo. |
| Workers | VPS (Hetzner según READMEs) con PM2 (`ecosystem.config.cjs`) o Docker (`Dockerfile`, `docker-compose.yml`); nginx con `scripts/patch-nginx-webhook.py`. |
| Gadgets Lua | Se suben desde Programas (bucket `programas-base`) y se copian a mano a la carpeta de Gadgets de cada PC. |
| Bot de WhatsApp | Fuera del repo. |

## Variables de entorno

Nombres documentados en `.env.local.example`, `ENV_SETUP.md`, `services/*/.env.example` y en [07-integrations](../07-integrations/README.md). Los valores **no** se documentan.

## Tests y calidad

- `npm test` (Vitest): pruebas de lógica pura en `src/lib/programas/*.test.ts`, `src/lib/vectorizacion/*.test.ts`, `src/lib/abecedario/*.test.ts`, `src/lib/utils/andreaniPhotoLinks.test.ts`.
- `npm run typecheck`, `npm run lint`.
- No hay tests de UI ni de integración con la base.

## Preguntas

[Q-ARQ-001…Q-ARQ-005](../14-open-questions/arquitectura.md).
