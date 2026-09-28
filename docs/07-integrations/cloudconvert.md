# CloudConvert

| | |
|---|---|
| Para qué | Generar un **PNG de vista previa** cuando se sube un vector **EPS** (el navegador no puede mostrar EPS). |
| Dónde | `uploadVectorFileWithPreview` en `src/lib/supabase/services/storage.service.ts` (Pedidos, Producción, alta de pedido). |
| Mecanismo | Llamada directa **desde el navegador** a `api.cloudconvert.com/v2/jobs` con `VITE_CLOUDCONVERT_API_KEY`, sondeo del job, subida del PNG como `<archivo>_preview.png` al bucket `vector`. |
| Si falla o no hay key | Se guarda el EPS sin preview ("EPS guardado sin preview"). |
| Riesgo | Toda variable `VITE_*` queda **incluida en el bundle público**: si está configurada, la API key de CloudConvert es visible para cualquiera que abra la app ([AUD-SEC-005](../audits/seguridad.md#aud-sec-005)). |
| Relación | El sufijo `_preview.png` es lo que `vectorUrlFromPreview` convierte de vuelta a `.eps` para descargar o empaquetar. |
