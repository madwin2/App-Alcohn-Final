# Auditoría — Observaciones de arquitectura

<a id="aud-arq-001"></a>

### AUD-ARQ-001 · Sin backend propio: la lógica de negocio vive en el navegador
Los servicios TS hacen múltiples escrituras no transaccionales (p. ej. `createOrder`: cliente → orden → sello → archivos → update). Un fallo intermedio deja datos a medias. Las reglas críticas que sí son atómicas están en RPCs/triggers.

<a id="aud-arq-002"></a>

### AUD-ARQ-002 · Doble motor de efectos: TS + triggers
Algunas reglas existen en ambos lados (prioridad al rehacer, consumo de stock, `Seguimiento Enviado` en edge y cron). Cambiar una regla exige revisar ambos.

<a id="aud-arq-003"></a>

### AUD-ARQ-003 · Tipos generados desactualizados
`src/lib/supabase/types.ts` no refleja columnas nuevas; abundan `as any`. Riesgo de errores silenciosos de nombres.

<a id="aud-arq-004"></a>

### AUD-ARQ-004 · Migraciones manuales sin versionado
`migration_*.sql` en la raíz aplicados a mano; funciones redefinidas varias veces; no hay forma automática de saber qué está aplicado.

<a id="aud-arq-005"></a>

### AUD-ARQ-005 · Despliegue de edge functions manual
Restos de despliegues vía MCP en la raíz; sin CI/CD.

<a id="aud-arq-006"></a>

### AUD-ARQ-006 · Rendimiento de Producción
`getProductionItems` carga todos los sellos; `updateProductionItem` los vuelve a cargar en cada guardado.

<a id="aud-arq-007"></a>

### AUD-ARQ-007 · Archivos gigantes
Ver AUD-INC-025. `app/envios/index.tsx` concentra UI, validación, parseo, CSV y colas.

<a id="aud-arq-008"></a>

### AUD-ARQ-008 · Datos hardcodeados
Emails de usuarios (Sidebar, RLS de precios), nombres de personas (`userImages.ts`), metas de venta, URL del proyecto/anon key/IP del bot en SQL y edge, largos máximos en la edge.

<a id="aud-arq-009"></a>

### AUD-ARQ-009 · Dependencia de infraestructura informal
El worker de Andreani depende de un túnel desde una PC de oficina; los workers corren en un VPS sin documentación de monitoreo.

<a id="aud-arq-010"></a>

### AUD-ARQ-010 · Integración con la tienda web sin contrato versionado
Ambos sistemas escriben las mismas tablas; los acuerdos están en Markdown.

<a id="aud-arq-011"></a>

### AUD-ARQ-011 · Buen aislamiento de lógica pura
Positivo: `src/lib/programas`, `src/lib/vectorizacion`, `src/lib/abecedario` tienen funciones puras con tests (material, elegibilidad, ciclo de vida, parser `.crv3d`, empaquetado de hojas, split de SVG). Es el lugar correcto para agregar reglas nuevas.
