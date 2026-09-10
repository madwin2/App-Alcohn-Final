# Plan: tabla de Historial de Envíos (reemplaza el buscador de la página Envíos)

Documento de implementación por tareas para Cursor. Sigue la convención de los planes previos del repo
(`PLAN_MEJORAS_ENVIOS_PEDIDOS_PRODUCCION.md`, `PROPUESTA_PAGINA_ENVIOS_CORREO.md`): cada sección cita
archivo/línea real del código actual, propone el cambio y deja "puntos a confirmar" donde hay una decisión
de producto que no es 100% inequívoca en el pedido original.

---

## 0. Resumen de alcance

| # | Cambio |
|---|--------|
| 1 | En `EnviosHeader`, sacar el input "Buscar por cliente o diseño..." y poner en su lugar un botón **"Historial de Envíos"**. |
| 2 | El botón navega a una **página nueva** `/envios/historial` con una tabla de todos los pedidos ya despachados (`estado_envio = 'Seguimiento Enviado'`). |
| 3 | Esa tabla trae: fecha de creación del pedido, cliente, diseño + preview, N° de seguimiento, empresa de envío, fecha de envío de seguimiento, ícono WhatsApp (copia el número), items del pedido. Ordenada por fecha de envío de seguimiento, más reciente primero. Tiene buscador propio (cliente / diseño / WhatsApp). |
| 4 | Click en una fila abre un popup con: dirección de envío (domicilio o sucursal), y el historial completo de fechas del pedido (creado → hecho → foto enviada → transferido → etiqueta → despachado → seguimiento enviado), + cuándo se descargó el PDF. |
| 5 | Click derecho en una fila → opción "Descargar PDF" (solo para pedidos Andreani con etiqueta PDF guardada). |
| 6 | Migración SQL: nueva columna `ordenes.seguimiento_enviado_at` + trigger, para poder ordenar/paginar la tabla de forma barata y exacta. |

---

## 1. Contexto actual (dónde está cada pieza hoy)

| Pieza | Archivo |
|-------|---------|
| Header de Envíos (filtros + buscador + botón Historial actual) | [`src/components/envios/EnviosHeader.tsx`](src/components/envios/EnviosHeader.tsx) |
| Dialog de historial actual (genérico, tipo feed de eventos) | [`src/components/envios/HistorialEnviosDialog.tsx`](src/components/envios/HistorialEnviosDialog.tsx) |
| Servicio de eventos/historial actual | [`src/lib/supabase/services/enviosHistorial.service.ts`](src/lib/supabase/services/enviosHistorial.service.ts) |
| Servicio de historial de estados (fabricación/venta/envío/orden) | [`src/lib/supabase/services/estadoHistorial.service.ts`](src/lib/supabase/services/estadoHistorial.service.ts) |
| Página principal de Envíos | [`src/app/envios/index.tsx`](src/app/envios/index.tsx) (2272 líneas) |
| Panel de etiquetas Andreani (referencia para preview, copiar WhatsApp, descarga de PDF) | [`src/components/envios/AndreaniLabelsPanel.tsx`](src/components/envios/AndreaniLabelsPanel.tsx) |
| Servicio de etiquetas Andreani (descarga de PDF firmado) | [`src/lib/supabase/services/andreaniEtiquetas.service.ts`](src/lib/supabase/services/andreaniEtiquetas.service.ts) |
| Tipos de dominio (`Order`, `OrderItem`, estados) | [`src/lib/types/index.ts`](src/lib/types/index.ts) |
| Tipos de Supabase (columnas reales) | [`src/lib/supabase/types.ts`](src/lib/supabase/types.ts) |
| Rutas de la app | [`src/App.tsx`](src/App.tsx) |
| Migraciones sueltas (convención del repo: archivos `migration_*.sql` en la raíz, no `supabase/migrations/`) | raíz del repo |

Hoy `EnviosHeader` ya tiene un botón **"Historial"** (arriba a la derecha, junto a "Generar CSV") que abre
`HistorialEnviosDialog`: un feed simple de eventos (`csv_generado`, `etiqueta_descargada`, `datos_cargados`,
`estado_envio`) sin preview, sin dirección, sin agrupar por pedido. Es distinto de lo que se pide acá.

**Puntos a confirmar (bloqueante de diseño, no de código):**

- Se pide reemplazar el buscador de la fila de filtros (`"Buscar por cliente o diseño..."`, `EnviosHeader.tsx:114-122`)
  por el botón nuevo. Ese buscador hoy también filtra las listas activas de la propia página de Envíos
  (`searchQuery` se usa en `index.tsx:462-490` para filtrar `eligibleOrders` y decide `showSearchResults`).
  **Sacarlo implica perder el filtro rápido de la vista operativa.** Recomendación de este plan: sacarlo tal
  como se pidió literalmente (el buscador nuevo vive en la página de Historial). Si en la práctica se extraña
  el filtro rápido, se puede reintroducir después como un ícono de lupa que abre un popover, sin volver a esto.
- El botón "Historial" que ya existe (arriba a la derecha) queda **redundante** con el nuevo botón "Historial
  de Envíos". Recomendación: eliminar el botón viejo y `HistorialEnviosDialog`, y que el nuevo botón (ubicado
  donde estaba el buscador) sea la única entrada al historial, apuntando a la página nueva. Si se prefiere
  conservar el feed de eventos genérico además de la tabla nueva, avisar antes de que Cursor borre el dialog.

Este plan asume las dos recomendaciones anteriores. Los pasos 3.1 y 6 marcan exactamente qué borrar si se
confirma.

---

## 2. Modelo de datos relevante

- `ordenes` (`src/lib/supabase/types.ts:40-106`): `id`, `cliente_id`, `direccion_id`, `empresa_envio`
  (`'Andreani' | 'Correo Argentino' | 'Via Cargo' | ...`), `tipo_envio` (`'Domicilio' | 'Sucursal' | 'Retiro'`),
  `seguimiento` (N° de seguimiento), `estado_envio`, `estado_orden` (**pipeline unificado**: `'Señado' | 'Hecho'
  | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado'`),
  `created_at` (fecha de creación real del pedido).
- `clientes` (`types.ts:5-19`): `nombre`, `apellido`, `telefono`.
- `direcciones` (`types.ts:20-39`): `domicilio`, `localidad`, `provincia`, `codigo_postal`,
  `codigo_sucursal_micorreo`, `nombre`, `apellido`, `telefono`.
- `sellos` (items del pedido, `types.ts:107-...`): `diseno`, `item_type`, `item_config`, `archivo_base`,
  `archivo_vector_preview`, `foto_sello`, `estado_fabricacion`, `estado_venta`.
- `estado_historial` (`migration_estado_historial.sql`): timeline con `orden_id`, `sello_id`, `campo` (
  `'estado_fabricacion' | 'estado_venta' | 'estado_envio' | 'estado_orden'`), `estado_anterior`, `estado_nuevo`,
  `changed_at`. Se llena solo, vía triggers, en cada `UPDATE`/`INSERT` de `sellos` y `ordenes`.
  - **`campo = 'estado_orden'`** es la clave para el popup: es un único timeline por pedido que ya pasa,
    en orden, por exactamente los hitos que pidió el usuario: `Hecho` → `Foto` → `Transferido` → `Hacer
    Etiqueta` → `Etiqueta Lista` → `Despachado` → `Seguimiento Enviado`. No hace falta reconstruirlo a mano
    combinando `estado_fabricacion`/`estado_venta` por ítem.
- `envio_eventos` (`migration_envio_eventos.sql`): `orden_id`, `tipo_evento` (`'csv_generado' |
  'etiqueta_descargada' | 'etiqueta_reimpresa'`), `created_at`, `meta` (incluye `etiqueta_id`). Acá está
  "cuándo se descargó el PDF".
- `envios_andreani_etiquetas` (usada en `andreaniEtiquetas.service.ts:129,367,381,387`): `id`, `orden_id`,
  `tracking`, `pdf_path`. Acá está el PDF descargable por contexto-menú.

No existe hoy una columna que diga directamente "cuándo se marcó Seguimiento Enviado" — hay que derivarla de
`estado_historial` o (mejor, ver paso 3) agregar una columna dedicada.

---

## 3. Migración SQL: `ordenes.seguimiento_enviado_at`

Ordenar/paginar la tabla de historial por "fecha de envío de seguimiento" contra `estado_historial` (join +
agregación por pedido) es caro y no pagina bien. Como `estado_envio` ya tiene un trigger que registra cada
transición, conviene agregar una columna materializada en `ordenes` que se completa sola.

Crear **`migration_ordenes_seguimiento_enviado_at.sql`** en la raíz del repo (misma convención que los demás
`migration_*.sql`):

```sql
-- Columna materializada con la fecha en que el pedido pasó a "Seguimiento Enviado".
-- Se completa sola vía trigger BEFORE UPDATE sobre ordenes.estado_envio.
-- Sirve para ordenar/paginar la tabla de Historial de Envíos sin agregaciones sobre estado_historial.

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS seguimiento_enviado_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ordenes_seguimiento_enviado_at
  ON public.ordenes (seguimiento_enviado_at DESC)
  WHERE seguimiento_enviado_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_ordenes_stamp_seguimiento_enviado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_envio = 'Seguimiento Enviado'
     AND (TG_OP = 'INSERT' OR OLD.estado_envio IS DISTINCT FROM NEW.estado_envio) THEN
    NEW.seguimiento_enviado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ordenes_stamp_seguimiento_enviado ON public.ordenes;
CREATE TRIGGER trigger_ordenes_stamp_seguimiento_enviado
  BEFORE INSERT OR UPDATE OF estado_envio
  ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ordenes_stamp_seguimiento_enviado();

-- Backfill: pedidos que ya están en Seguimiento Enviado pero no tienen la marca.
-- Usa la fecha real del cambio de estado si existe en estado_historial; si no, updated_at como fallback.
UPDATE public.ordenes o
SET seguimiento_enviado_at = COALESCE(
  (
    SELECT eh.changed_at
    FROM public.estado_historial eh
    WHERE eh.orden_id = o.id
      AND eh.campo = 'estado_envio'
      AND eh.estado_nuevo = 'Seguimiento Enviado'
    ORDER BY eh.changed_at DESC
    LIMIT 1
  ),
  o.updated_at
)
WHERE o.estado_envio = 'Seguimiento Enviado'
  AND o.seguimiento_enviado_at IS NULL;
```

No hace falta tocar RLS: `ordenes` ya es legible por el equipo autenticado.

Después de aplicar la migración, agregar la columna a `src/lib/supabase/types.ts` (interfaz `ordenes.Row`,
junto a `estado_envio`, línea `types.ts:63`):

```ts
seguimiento_enviado_at?: string | null;
```

Y opcionalmente a `Order` en `src/lib/types/index.ts` si se quiere exponer vía el mapper general (no es
obligatorio: la página de historial va a hacer su propia query, no pasa por `mapOrdenToOrder`).

---

## 4. Capa de datos: nuevo servicio

Crear **`src/lib/supabase/services/enviosHistorialTabla.service.ts`** (nombre separado del
`enviosHistorial.service.ts` existente para no romper sus consumidores actuales — `insertEnvioEventos`,
`insertEnvioEventoForOrden`, `getDownloadedAndreaniEtiquetaIds` siguen usándose desde `AndreaniLabelsPanel.tsx`
y `index.tsx`).

### 4.1 Tipo de fila de la tabla

```ts
export interface EnvioHistorialRow {
  ordenId: string;
  createdAt: string | null;              // ordenes.created_at
  customerName: string;                  // clientes.nombre + apellido
  customerPhone: string | null;          // clientes.telefono (o direcciones.telefono si falta)
  designLabel: string;                   // getOrderItemDisplayName del item representativo
  previewUrl: string | null;             // files del item representativo
  previewMockupSolicitudId: string | null;
  trackingNumber: string | null;         // ordenes.seguimiento
  carrier: 'ANDREANI' | 'CORREO_ARGENTINO' | 'VIA_CARGO' | 'OTRO' | 'RETIRO_EN_PERSONA' | null;
  seguimientoEnviadoAt: string | null;   // ordenes.seguimiento_enviado_at
  itemsSummary: string;                  // "2× Sello Clásico, 1× Base remachadora"
  itemCount: number;
  andreaniPdfPath: string | null;        // envios_andreani_etiquetas.pdf_path, si existe
  andreaniEtiquetaId: string | null;
}
```

### 4.2 `fetchEnviosHistorial(options)`

```ts
export async function fetchEnviosHistorial(options: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: EnvioHistorialRow[]; hasMore: boolean }>
```

- `from('ordenes').select(...)` con `.eq('estado_envio', 'Seguimiento Enviado')`.
- Select anidado: `clientes(nombre, apellido, telefono)`, `direcciones(telefono)`,
  `sellos(diseno, item_type, item_config, archivo_base, archivo_vector_preview, foto_sello,
  mockup_solicitud_id)`, y `envios_andreani_etiquetas(id, pdf_path)` (solo va a haber fila si
  `empresa_envio = 'Andreani'`; Supabase devuelve `[]` si no hay).
- Orden: `.order('seguimiento_enviado_at', { ascending: false, nullsFirst: false })`.
- Paginación: `.range(offset, offset + limit - 1)`.
- Búsqueda (`search`): si el string parece un teléfono (regex `/^\+?\d[\d\s-]*$/` con longitud ≥ 6), filtrar
  por `direcciones.telefono`/`clientes.telefono` con `.ilike`. Si no, aplicar `.or(...)` sobre
  `clientes.nombre`, `clientes.apellido` y `sellos.diseno` — igual que ya hace `catalogAddressOptions`/
  `stripAccents` en el resto del archivo de Envíos para tildes. Nota: Postgrest no permite `.ilike` con
  `stripAccents` de forma nativa; si el volumen de filas es manejable (miles, no cientos de miles), lo más
  simple y menos riesgoso es traer una página más grande (p. ej. 300) sin filtro y filtrar en cliente con
  `stripAccents`, igual que hace hoy `index.tsx:462` (`const q = stripAccents(searchQuery.trim().toLowerCase())`).
  Mantener el mismo criterio evita duplicar dos formas de normalizar texto.
- Armar `designLabel`/`previewUrl` con la misma lógica que `getRepresentativeItem` + `getOrderItemDisplayName`
  de `index.tsx:92-95` y `index.tsx:1429` (encontrar el primer ítem con `archivo_base`/`archivo_vector_preview`,
  si no hay ninguno usar el primero).
- Armar `itemsSummary` agrupando por `getOrderItemDisplayName`: `"2× Sello Clásico, 1× Base remachadora"`.

### 4.3 `fetchEnvioHistorialDetail(ordenId)`

Para el popup, sin necesidad de traer todo de nuevo:

```ts
export interface EnvioHistorialDetail {
  shippingType: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
  address: {
    domicilio: string | null;
    localidad: string | null;
    provincia: string | null;
    codigoPostal: string | null;
    sucursalCodigo: string | null;
  } | null;
  timeline: Array<{ estadoAnterior: string | null; estadoNuevo: string | null; changedAt: string }>;
  pdfDownloads: Array<{ tipoEvento: 'etiqueta_descargada' | 'etiqueta_reimpresa'; createdAt: string }>;
}

export async function fetchEnvioHistorialDetail(ordenId: string): Promise<EnvioHistorialDetail>
```

- Dirección: `ordenes.direccion_id` → `direcciones` (si `tipo_envio = 'Retiro'`, `address` puede ser `null`).
- Timeline: `estado_historial` con `.eq('orden_id', ordenId).eq('campo', 'estado_orden').order('changed_at',
  { ascending: true })` — esto da, en orden, exactamente: pedido creado (fila con `estado_anterior IS NULL`,
  `estado_nuevo = 'Señado'`) → Hecho → Foto → Transferido → Hacer Etiqueta → Etiqueta Lista → Despachado →
  Seguimiento Enviado. Reutiliza `getEstadoHistorialByOrdenId` de `estadoHistorial.service.ts:35` pasando
  `{ campo: 'estado_orden' }`, no hace falta reescribir la query.
- PDF: `envio_eventos` con `.eq('orden_id', ordenId).in('tipo_evento', ['etiqueta_descargada',
  'etiqueta_reimpresa']).order('created_at', { ascending: false })`.

### 4.4 Descarga de PDF (context menu)

Reusar tal cual `downloadAndreaniEtiquetaPdf` de `andreaniEtiquetas.service.ts:221` y
`insertEnvioEventoForOrden` de `enviosHistorial.service.ts:56` (el mismo par de llamadas que ya hace
`AndreaniLabelsPanel.tsx:463-493` en `handleDownload`):

```ts
await downloadAndreaniEtiquetaPdf(row.andreaniPdfPath, { tracking: row.trackingNumber ?? undefined, order });
await insertEnvioEventoForOrden(row.ordenId, 'etiqueta_descargada', { etiqueta_id: row.andreaniEtiquetaId });
```

`order` (tipo `Order` completo) no está disponible en la fila liviana de historial — para el enriquecido del
PDF (nombre/dirección en el footer de la etiqueta) alcanza con pasar `null` si no se puede armar barato, o
resolverlo perezosamente con una query puntual a `ordenes`/`sellos` solo al hacer click en "Descargar PDF" (no
hace falta cargarlo para las 50-100 filas de la tabla).

---

## 5. Ruta nueva

En `src/App.tsx:33`, agregar dentro del mismo grupo que `/envios` (comparte `OrdersScopeLayout`, aunque la
página nueva no dependa de `useOrders`, así conserva el mismo layout/autenticación):

```tsx
<Route path="/envios" element={<EnviosPage />} />
<Route path="/envios/historial" element={<EnviosHistorialPage />} />
```

Importar arriba: `import EnviosHistorialPage from './app/envios/historial/index'`.

Crear el archivo en **`src/app/envios/historial/index.tsx`** (mismo patrón carpeta+`index.tsx` que el resto
de `src/app/*`).

---

## 6. Cambios de UI

### 6.1 `EnviosHeader.tsx`

- Quitar `searchQuery` / `onSearchQueryChange` de las props y el `<Input>` con la lupa (`EnviosHeader.tsx:114-122`).
- Quitar el botón "Historial" existente (`EnviosHeader.tsx:61-64`, `History` icon) — **si se confirma el punto
  2 del apartado 1**.
- En el lugar donde estaba el input (dentro del mismo `div.flex.flex-wrap.items-center.gap-3`, línea ~89),
  poner el botón nuevo:

```tsx
<Button type="button" variant="outline" onClick={onOpenHistorial}>
  <History className="mr-1.5 h-4 w-4" />
  Historial de Envíos
</Button>
```

  Puede reusarse la prop `onOpenHistorial` ya existente, cambiando su implementación en `index.tsx` de
  `setHistorialOpen(true)` a una navegación (`navigate('/envios/historial')`), en vez de agregar una prop
  nueva.

### 6.2 `src/app/envios/index.tsx`

- Importar `useNavigate` de `react-router-dom`.
- Línea `1661`: `onOpenHistorial={() => setHistorialOpen(true)}` → `onOpenHistorial={() => navigate('/envios/historial')}`.
- Borrar el estado `historialOpen` (línea `259`) y el render de `<HistorialEnviosDialog ... />` (línea `1872`)
  si se confirma retirar el dialog viejo.
- Borrar `searchQuery`/`setSearchQuery` (línea `258`) y su uso en el `useMemo` de filtrado (líneas `462-490`)
  **solo si se confirma** sacar también el filtro rápido de la vista operativa (ver "Puntos a confirmar").
  Si se prefiere conservarlo pero sin el input visual, dejarlo así — la recomendación de este plan es sacarlo
  del todo para no dejar código muerto.
- El import de `HistorialEnviosDialog` (línea `27`) se borra si se borra el dialog.

### 6.3 Nueva página `src/app/envios/historial/index.tsx`

Estructura sugerida (reusar `AppMain`, `Toaster`, `useToast` igual que `src/app/envios/index.tsx:239-243`):

```tsx
export default function EnviosHistorialPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<EnvioHistorialRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [selectedOrdenId, setSelectedOrdenId] = useState<string | null>(null);

  // cargar página 1 al montar y al cambiar `search` (debounced ~300ms)
  // "Cargar más" incrementa offset y hace append

  return (
    <AppMain>
      <div className="border-b bg-background p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/envios')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Historial de Envíos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pedidos ya despachados, ordenados por fecha de envío de seguimiento.
            </p>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Buscar por cliente, diseño o WhatsApp..." className="pl-8" />
        </div>
      </div>
      <EnviosHistorialTable
        rows={rows}
        loading={loading}
        onRowClick={(row) => setSelectedOrdenId(row.ordenId)}
        onDownloadPdf={handleDownloadPdf}
      />
      {hasMore ? <Button onClick={loadMore}>Cargar más</Button> : null}
      <EnviosHistorialDetailDialog
        ordenId={selectedOrdenId}
        open={Boolean(selectedOrdenId)}
        onOpenChange={(open) => !open && setSelectedOrdenId(null)}
      />
      <Toaster />
    </AppMain>
  );
}
```

### 6.4 `src/components/envios/EnviosHistorialTable.tsx` (nuevo)

Tabla con columnas, en este orden, siguiendo el mismo patrón visual de `renderOrderRow` en
`index.tsx:1401-1550` (reusar componentes, no reinventar estilos):

| Columna | Fuente | Referencia de implementación |
|---|---|---|
| Fecha de creación | `formatDate(row.createdAt)` | `format.ts:21`, usado en `index.tsx:1447` |
| Cliente | `row.customerName` | — |
| Diseño | `row.designLabel` | `getOrderItemDisplayName`, `index.tsx:1429` |
| Preview | `<StorageUrlImage>` + click abre zoom con `resolveStorageDisplayUrl` | `index.tsx:1513-1544` (copiar patrón tal cual, con `previewImageUrl` state local a la tabla o al padre) |
| N° de seguimiento | `row.trackingNumber` | — |
| Empresa | chip con `getShippingLabel`/`getShippingChipVisual` | `format.ts:270,333`, ya importados en `index.tsx:31` |
| Fecha de envío de seguimiento | `formatDateTime(row.seguimientoEnviadoAt)` | `format.ts:31` |
| WhatsApp | ícono blanco + copia al portapapeles | `WhatsappLogo` + botón, patrón exacto en `index.tsx:1475-1507` |
| Items del pedido | `row.itemsSummary` | — |

- Envolver cada `<tr>` en `<ContextMenu><ContextMenuTrigger asChild>...</ContextMenuTrigger><ContextMenuContent>`
  igual que `index.tsx:1435-1436` (el componente ya está en `@/components/ui/context-menu` y ya se usa en esta
  página, no hay que instalarlo).
- `<ContextMenuItem>` "Descargar PDF" solo si `row.andreaniPdfPath` existe; si no, no mostrar el ítem (o
  mostrarlo deshabilitado con tooltip "Sin PDF guardado" — decisión menor, cualquiera de las dos es razonable).
- Click en la fila (no en el ícono de WhatsApp ni en el preview, que ya usan `e.stopPropagation()`) llama a
  `onRowClick(row)`.
- El ícono de WhatsApp: importar el mismo SVG que hoy vive inline en `index.tsx:167-173` (`WhatsappLogo`).
  Recomendado (no obligatorio) extraerlo a `src/components/shared/WhatsappLogo.tsx` para no duplicar el path
  SVG en dos archivos; si se extrae, actualizar `index.tsx` para importarlo en vez de definirlo localmente.
  Botón de copiar: mismo patrón `navigator.clipboard.writeText(...)` con toast de éxito/error de
  `index.tsx:1481-1498`, usando `row.customerPhone` (ya normalizado con `normalizePhoneDigits` al armar la fila
  en el servicio, igual que hace `index.tsx:1418`).

### 6.5 `src/components/envios/EnviosHistorialDetailDialog.tsx` (nuevo)

`Dialog` (mismo componente `@/components/ui/dialog` que usa `HistorialEnviosDialog.tsx`), que al abrirse
(`useEffect` sobre `ordenId`) llama a `fetchEnvioHistorialDetail(ordenId)` y muestra:

1. **Dirección de envío**: si `shippingType === 'Sucursal'`, mostrar la sucursal (`address.domicilio` es el
   nombre/dirección de la sucursal, igual que hace `formatShippingDestination` en `index.tsx:111-124` — se
   puede reusar esa función tal cual importándola o copiando su lógica mínima). Si `'Domicilio'`, mostrar
   domicilio + localidad + provincia + CP. Si `'Retiro'`, mostrar "Retiro en persona".
2. **Timeline de estados**: lista vertical simple con `estadoAnterior → estadoNuevo` y `formatDateTime(changedAt)`
   por cada fila de `detail.timeline`, en el mismo estilo que la lista de `HistorialEnviosDialog.tsx:177-196`.
3. **Descargas de PDF**: si `detail.pdfDownloads.length`, listar cada una con su fecha; si no hay ninguna
   (Correo Argentino/Via Cargo no tienen PDF propio en este flujo), no mostrar la sección.

---

## 7. Checklist de pruebas manuales (antes de dar por cerrado)

1. `/envios` → el buscador viejo ya no está; el botón "Historial de Envíos" está donde estaba el buscador.
2. Click en el botón navega a `/envios/historial` y vuelve con el botón de "atrás".
3. La tabla de historial solo trae pedidos con `estado_envio = 'Seguimiento Enviado'`, ordenados por fecha de
   envío de seguimiento descendente (el más reciente arriba).
4. Buscar por nombre de cliente, por nombre de diseño y por número de WhatsApp devuelve resultados correctos
   (probar con y sin tildes).
5. El ícono de WhatsApp copia el número y muestra el toast; si no hay teléfono, el botón está deshabilitado.
6. Click en la fila abre el popup con la dirección correcta (probar un pedido a domicilio y uno a sucursal) y
   el timeline completo (`Hecho`, `Foto`, `Transferido`, etapas de etiqueta, `Seguimiento Enviado`).
7. Click derecho en un pedido Andreani con etiqueta descargable muestra "Descargar PDF"; al usarlo, se
   descarga el PDF y queda registrado el evento (`envio_eventos.tipo_evento = 'etiqueta_descargada'` o
   `'etiqueta_reimpresa'` si ya se había descargado antes).
8. Click derecho en un pedido de Correo Argentino / Via Cargo no muestra la opción (o la muestra deshabilitada,
   según lo que se haya decidido en 6.4).
9. Confirmar que la migración de `seguimiento_enviado_at` corrió el backfill: pedidos históricos que ya estaban
   en "Seguimiento Enviado" antes de la migración también aparecen y con una fecha razonable (no `null`).

---

## 8. Orden sugerido de implementación

1. Migración SQL (sección 3) + actualizar `src/lib/supabase/types.ts`.
2. Servicio nuevo (sección 4).
3. Ruta + página vacía (sección 5 y 6.3 sin tabla todavía, solo para probar la navegación).
4. `EnviosHistorialTable` (6.4) conectada a la página.
5. Cambios en `EnviosHeader` + `index.tsx` (6.1, 6.2) — dejar esto para el final así el flujo viejo sigue
   funcionando mientras se prueba la tabla nueva en `/envios/historial` de forma aislada.
6. `EnviosHistorialDetailDialog` (6.5) y el context-menu de descarga de PDF (4.4).
7. Borrar `HistorialEnviosDialog.tsx` y las referencias a `insertEnvioEventos`... **ojo**: no borrar
   `enviosHistorial.service.ts` completo — `insertEnvioEventos`/`insertEnvioEventoForOrden`/
   `getDownloadedAndreaniEtiquetaIds` siguen en uso por `AndreaniLabelsPanel.tsx` y `index.tsx`. Solo borrar
   `fetchEnviosHistorialTimeline` si ya no la usa nadie después de quitar `HistorialEnviosDialog.tsx`.
