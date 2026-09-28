# MiCorreo (Correo Argentino)

## Worker productivo: `services/micorreo-worker` (Playwright)

| | |
|---|---|
| Para qué | Automatizar la **carga masiva** de envíos en el portal MiCorreo con un CSV y **pagar** la etiqueta. |
| Quién lo usa | Envíos (subida en segundo plano al guardar datos de envío). |
| Entrada | `POST /upload` `{ orderId, csvContent, filename, payAfterUpload }` con `Authorization: Bearer <WORKER_API_KEY>`. La app llama a `/api/micorreo-upload` (Vercel), que agrega la key (`MICORREO_WORKER_URL`, `MICORREO_WORKER_API_KEY`). |
| Salida | `status` `ok` (200) / `data_error` (422) / `system_error` (503), mensaje del portal, detalles de pago (`paymentStatus`, `paymentPending`, `paymentMessage`). |
| Autenticación con el portal | Usuario/contraseña de la cuenta MiCorreo de Alcohn (`MICORREO_USER`, `MICORREO_PASSWORD`), login con reintentos. Selectores configurables por env. |
| Efectos | Crea el envío en MiCorreo y lo paga con la cuenta de Alcohn. En Alcohn AI: `estado_envio`, `etiqueta_*`, `error_etiqueta_mensaje`. |
| Errores | Clasificación por texto del portal (`classify-result.ts`, `portal-messages.ts`, `docs/errores-micorreo.md`). Artifacts (screenshot/HTML) en disco del worker. |
| Reintentos | No automáticos: el usuario reintenta guardando de nuevo. |
| Despliegue | 🔶 VPS con PM2 junto al bot, nginx `webhook.alcohncnc.com/micorreo/` (README). |

❓ El worker **no** devuelve el número de seguimiento ni el PDF: se obtienen luego del portal → [Q-COR-003](../14-open-questions/envios.md#q-cor-003).

## Formato CSV

`src/lib/utils/correoArgentinoCsv.ts`: 21 columnas de la plantilla "Masiva" (tipo de producto, medidas, peso, valor, provincia, sucursal **o** localidad+calle+altura+piso+dpto+CP, nombre, email, teléfonos, número de orden [vacío]). Separador `;`. Normaliza acentos y caracteres.

<a id="api-oficial-fase-1"></a>

## API oficial (fase 1)
`services/micorreo-api-worker`: CLI local contra la **API MiCorreo** (token JWT, `customerId`, sucursales, cotización, `shipping/import`). **No conectada a la app.** `shipping/import` crea envíos reales sin posibilidad de cancelar: protegido por `MICORREO_ALLOW_IMPORT=true` + `--confirmar`. Plan: `PLAN_INTEGRACION_MICORREO_API_FASE_1.md`; referencia de API: `apiMiCorreo.md`, `apiPaqAr-v2 (1).md` (raíz). 🔶 Reemplazaría al worker de Playwright en el futuro. ❓ [Q-COR-005](../14-open-questions/envios.md#q-cor-005).
