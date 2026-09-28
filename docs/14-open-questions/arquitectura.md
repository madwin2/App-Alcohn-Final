# Preguntas abiertas — Arquitectura e infraestructura

### Q-ARQ-001
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué corre exactamente en el VPS (bot, micorreo-worker, andreani-worker, vector-worker, nginx), quién lo administra y hay backups/monitoreo?
- **Impacto**: alto.
- Respuesta: En el VPS (hetzner) corren todas las cosas por fuera de la app, bot, workers, nginx. Lo administro yo y no hay backups ni monitoreo.

### Q-ARQ-002
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El frontend y `/api` están en Vercel? ¿Qué variables están configuradas en producción (sin valores)?
- **Impacto**: medio.
- Respuesta: Si, tenemos todo configurado en vercel. Variables: cloudconvert, supabase, openai api key, innovation bucket, mi correo worker, vector worker, andreani worker, vectorizer, meta.

### Q-ARQ-003
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se aplican las migraciones y se despliegan las edge functions? ¿Se quiere adoptar Supabase CLI con migraciones versionadas?
- **Impacto**: medio.
- Respuesta: lo hago con cursor, nose.

### Q-ARQ-004
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Hay un entorno de staging o todo se prueba en producción?
- **Evidencia**: scripts con `--dry-run`, worker MiCorreo con artefactos, planes que dicen "staging primero".
- **Impacto**: alto (riesgo de cambios).
- Respuesta: hago las cosas con cursor, algunos cambios los probamos en local y depsues lo subimos a github y otro directo se cambian y suben a github. Nose.

### Q-ARQ-005
- **Estado**: pendiente (aclarada abajo)
- **Pregunta**: ¿Se van a limpiar los archivos temporales de despliegue y los CSV/PDF con datos de clientes que hay en la raíz del repo (no versionados)?
- **Impacto**: medio (privacidad).
- Respuesta: no se a que se refiere.
- **Aclaración**: en la carpeta del proyecto (en esta PC, no en GitHub) hay archivos sueltos que quedaron de despliegues hechos con IA (`_deploy_*.json`, `_b64_*.txt`, `_chunk_*`, `_mcp_*`, `tmp-*`…) y archivos con **datos de clientes** (por ejemplo `supabase_update.csv`, `ventas-2026-04-27 - Hoja 1.csv`, `import-*.txt`, PDFs de etiquetas como `CORREO 12 5 2.pdf`, `etiquetas-con-previews-*.pdf`, carpetas `Clientes Viejos/` y `Fotos Usuarios/`). La pregunta es si se pueden borrar o mover fuera del proyecto. No se subieron a GitHub, pero cualquier herramienta que lea la carpeta los ve.