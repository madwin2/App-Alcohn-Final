# Plan: flujo de "Rehacer" con motivo, cobro adicional e historial

Documento de implementación por tareas para Cursor. Mismo formato que los planes previos del repo: cada
sección cita archivo/línea real, propone el cambio, y deja "puntos a confirmar" donde la decisión es de
producto y no 100% inequívoca.

---

## 0. Resumen de alcance

| # | Cambio |
|---|--------|
| 1 | Elegir "Rehacer" en Fabricación (Pedidos o Producción) ya no guarda directo: abre un popup obligatorio que pide **motivo** + **descripción**, y —si corresponde— un **cobro adicional**. |
| 2 | El popup **detecta solo** en qué situación está el/los ítem(s) (venta y envío ya cargados) — el usuario no tiene que clasificar manualmente entre los 4 casos que describiste. |
| 3 | Al confirmar, un único RPC en la base aplica los resets correctos según el contexto (foto/venta si correspondía, envío si el pedido ya había salido) **y deja todo registrado** — nada se pierde, se archiva. |
| 4 | Funciona igual si se rehace **un solo ítem de un pedido con varios** o **el pedido entero**. |
| 5 | El historial de envío (a quién se le mandó, con qué transportista, qué seguimiento) **no se borra**: queda preservado tanto en `estado_historial` (ya es append-only) como en una copia explícita dentro del propio evento de rehacer, para poder mostrarlo sin tener que ir a buscarlo. |
| 6 | Si hubo cobro adicional, aparece como un indicador simple en la tabla de **Pedidos** (no en Producción). |

---

## 1. Contexto actual y una restricción de arquitectura clave

| Pieza | Archivo |
|-------|---------|
| Selector de Fabricación (Pedidos) | [`src/components/pedidos/Table/cells/CellFabricacion.tsx`](src/components/pedidos/Table/cells/CellFabricacion.tsx) |
| Selector de Fabricación (Producción) | [`src/components/produccion/Table/cells/CellFabricacion.tsx`](src/components/produccion/Table/cells/CellFabricacion.tsx) |
| Handler que aplica el cambio (Pedidos) | [`src/components/pedidos/Table/OrdersTable.tsx:164-180`](src/components/pedidos/Table/OrdersTable.tsx:164) |
| Handler que aplica el cambio (Producción) | [`src/components/produccion/Table/ProductionTable.tsx:272-293`](src/components/produccion/Table/ProductionTable.tsx:272) (ya soporta multi-selección: `selectedRows`) |
| Columnas de Pedidos (para el indicador de cobro) | [`src/components/pedidos/Table/columns.tsx:94-115`](src/components/pedidos/Table/columns.tsx:94) — columna `indicadores`, ya aloja `CellTasks` + `CellDeadline` |
| Patrón a reusar para el indicador (ícono + Popover leyendo `order.algo`) | [`src/components/pedidos/Table/cells/CellTasks.tsx`](src/components/pedidos/Table/cells/CellTasks.tsx) (lee `order.tasks`, cargado aparte) |
| Dónde se cargan `sellos`/`tareas` en batch para armar `Order[]` | [`src/lib/supabase/services/orders.service.ts:220-257`](src/lib/supabase/services/orders.service.ts:220) (`buildOrdersFromOrdenes`) |
| Historial de estados (append-only, ya existe) | `estado_historial` — [`migration_estado_historial.sql`](migration_estado_historial.sql) |
| Historial de envío ya construido (fecha de envío, tabla dedicada) | `PLAN_TABLA_HISTORIAL_ENVIOS.md` (ya implementado: `ordenes.seguimiento_enviado_at` existe, ver [`mappers.ts:331`](src/lib/supabase/mappers.ts:331)) |

**Restricción de arquitectura que hay que tener presente (no es negociable sin un rediseño grande):**
`fabricationState` y `saleState` son **por ítem** (`sellos.estado_fabricacion`, `sellos.estado_venta`), pero
**`shippingState` es en realidad un solo campo por PEDIDO** (`ordenes.estado_envio`, `ordenes.seguimiento`) que
se refleja igual en todos los ítems de esa orden — ver [`mappers.ts:287-290`](src/lib/supabase/mappers.ts:287)
(`shippingState: mapShippingState(null)` a nivel ítem, y luego pisado por `shippingStateFromOrder` a nivel
orden) y [`mappers.ts:401-402`](src/lib/supabase/mappers.ts:401) (al guardar, toma `order.items[0].shippingState`
y lo escribe en `ordenes.estado_envio`, un solo valor para toda la orden).

Esto importa para tu escenario de "un solo ítem de un pedido con varios": un pedido con 3 sellos siempre viajó
**en un solo paquete, con un solo número de seguimiento**. Si 1 de los 3 sale mal después de despachado, el
sistema no tiene manera de decir "el envío ya salió para 2 de 3 ítems" — el envío es una propiedad del pedido,
no del ítem. Ver el punto a confirmar de la sección 3.2.

---

## 2. Modelo de datos nuevo

### 2.1 Tabla `sello_rehacer_eventos`

Un registro por ítem rehecho, con **snapshot** de en qué estado estaba todo al momento de rehacer (así se
preserva lo que había, aunque después se resetee el campo vivo en `ordenes`/`sellos`).

Crear **`migration_sello_rehacer_eventos.sql`** en la raíz (misma convención que los `migration_*.sql`
existentes):

```sql
CREATE TABLE IF NOT EXISTS public.sello_rehacer_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sello_id uuid NOT NULL REFERENCES public.sellos(id) ON DELETE CASCADE,
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN (
    'ERROR_DETECTADO_EN_MAQUINA',
    'ERROR_MEDIDA_O_VECTOR',
    'RECLAMO_CLIENTE_PRE_ENTREGA',
    'DANIO_O_ERROR_EN_ENVIO',
    'RECLAMO_CLIENTE_POST_ENTREGA',
    'OTRO'
  )),
  descripcion text,

  -- Snapshot: qué tenía el ítem/pedido justo antes de resetear (para no perder el historial).
  fabricacion_estado_previo text,
  venta_estado_previo text,
  foto_sello_previo text,
  envio_estado_previo text,
  envio_seguimiento_previo text,
  envio_empresa_previo text,
  envio_fecha_previo timestamptz,

  -- Cobro adicional opcional (material, mitad de precio, envío, etc.). NO es una venta nueva:
  -- es informativo/administrativo, ligado al mismo pedido.
  cobro_adicional_monto numeric,
  cobro_adicional_concepto text,
  cobro_adicional_cobrado boolean NOT NULL DEFAULT false,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sello_rehacer_sello_id ON public.sello_rehacer_eventos (sello_id);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_orden_id ON public.sello_rehacer_eventos (orden_id);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_created_at ON public.sello_rehacer_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_cobro_pendiente
  ON public.sello_rehacer_eventos (orden_id)
  WHERE cobro_adicional_monto IS NOT NULL AND cobro_adicional_cobrado = false;

ALTER TABLE public.sello_rehacer_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sello_rehacer_select_authenticated" ON public.sello_rehacer_eventos;
CREATE POLICY "sello_rehacer_select_authenticated"
  ON public.sello_rehacer_eventos FOR SELECT TO authenticated USING (true);

-- El insert real lo hace el RPC de la sección 2.2 (SECURITY DEFINER); esta policy es para permitir
-- marcar "cobrado" desde el cliente (UPDATE) y, si hiciera falta, insertar directo en algún flujo futuro.
DROP POLICY IF EXISTS "sello_rehacer_update_authenticated" ON public.sello_rehacer_eventos;
CREATE POLICY "sello_rehacer_update_authenticated"
  ON public.sello_rehacer_eventos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON public.sello_rehacer_eventos TO authenticated;
REVOKE INSERT, DELETE ON public.sello_rehacer_eventos FROM authenticated;
REVOKE ALL ON public.sello_rehacer_eventos FROM anon;
```

**Nota sobre "no perder el historial de envío":** `estado_historial` ya es append-only (nunca se hace
`UPDATE`/`DELETE` sobre sus filas, solo `INSERT` vía trigger — ver `migration_estado_historial.sql`). Cuando
el RPC de abajo resetea `ordenes.estado_envio` de `'Seguimiento Enviado'` a `'Sin envio'`, ese cambio en sí
mismo **genera una fila nueva en `estado_historial`** con `estado_anterior = 'Seguimiento Enviado'` — o sea, el
hecho de que ese pedido salió una vez ya queda grabado para siempre, sin que haya que hacer nada extra. Lo
único que se perdía sin este plan era el **número de seguimiento** concreto (es texto libre en una sola
columna, se pisa) — por eso `envio_seguimiento_previo`/`envio_empresa_previo`/`envio_fecha_previo` lo
snapshotean explícitamente en el evento.

### 2.2 RPC `registrar_rehacer` (todo el reset en una sola transacción)

Se hace como función de Postgres (mismo patrón que `insert_estado_historial` en
`migration_estado_historial.sql:48`) para que el insert del evento + el reset de `sellos` + el reset de
`ordenes` sea **atómico** — si el cliente hiciera 3 llamadas separadas y una fallara, quedaría el pedido a
medio resetear.

Agregar a la misma migración `migration_sello_rehacer_eventos.sql`:

```sql
CREATE OR REPLACE FUNCTION public.registrar_rehacer(
  p_sello_ids uuid[],
  p_motivo text,
  p_descripcion text,
  p_cobro_monto numeric DEFAULT NULL,
  p_cobro_concepto text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid := auth.uid();
  v_sello record;
  v_orden record;
  v_orden_ids uuid[];
BEGIN
  FOR v_sello IN
    SELECT id, orden_id, estado_fabricacion, estado_venta, foto_sello
    FROM sellos WHERE id = ANY(p_sello_ids)
  LOOP
    SELECT * INTO v_orden FROM ordenes WHERE id = v_sello.orden_id;

    INSERT INTO sello_rehacer_eventos (
      sello_id, orden_id, motivo, descripcion,
      fabricacion_estado_previo, venta_estado_previo, foto_sello_previo,
      envio_estado_previo, envio_seguimiento_previo, envio_empresa_previo, envio_fecha_previo,
      cobro_adicional_monto, cobro_adicional_concepto, created_by
    ) VALUES (
      v_sello.id, v_sello.orden_id, p_motivo, p_descripcion,
      v_sello.estado_fabricacion, v_sello.estado_venta, v_sello.foto_sello,
      v_orden.estado_envio, v_orden.seguimiento, v_orden.empresa_envio, v_orden.seguimiento_enviado_at,
      p_cobro_monto, p_cobro_concepto, v_created_by
    );

    -- Reset del ítem: siempre vuelve a "Rehacer". Si ya se le había mandado foto pero el cliente
    -- todavía no había pagado (Foto, no Transferido), se limpia la foto y la venta vuelve a Señado
    -- para que, cuando vuelva a estar Hecho, vuelva a caer sola en la cola de "falta mandar foto".
    -- Si ya estaba Transferido, la venta NO se toca (ya está cobrada, no hay nada que deshacer ahí).
    UPDATE sellos
    SET estado_fabricacion = 'Rehacer',
        foto_sello = CASE WHEN estado_venta = 'Foto' THEN NULL ELSE foto_sello END,
        estado_venta = CASE WHEN estado_venta = 'Foto' THEN 'Señado' ELSE estado_venta END
    WHERE id = v_sello.id;
  END LOOP;

  v_orden_ids := ARRAY(SELECT DISTINCT orden_id FROM sellos WHERE id = ANY(p_sello_ids));

  -- Reset de envío a nivel PEDIDO (ver restricción de la sección 1): si ese pedido ya había avanzado
  -- más allá de "Sin envio" (etiqueta generada, despachado o ya con seguimiento enviado), se reinicia
  -- para que vuelva a pasar por el flujo normal de Envíos cuando el ítem rehecho esté Hecho de nuevo.
  UPDATE ordenes
  SET estado_envio = 'Sin envio',
      seguimiento = NULL,
      seguimiento_enviado_at = NULL
  WHERE id = ANY(v_orden_ids)
    AND estado_envio IS NOT NULL
    AND estado_envio <> 'Sin envio';

  -- Recalcular estado_orden agregado con el mismo criterio que ya usa el cliente
  -- (orders.service.ts:1040-1063): si todos los sellos de la orden comparten estado_venta, reflejarlo.
  UPDATE ordenes o
  SET estado_orden = sub.unico_estado
  FROM (
    SELECT orden_id, MIN(estado_venta) AS unico_estado, COUNT(DISTINCT estado_venta) AS distintos
    FROM sellos
    WHERE orden_id = ANY(v_orden_ids)
    GROUP BY orden_id
  ) sub
  WHERE o.id = sub.orden_id AND sub.distintos = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text) TO authenticated;
```

Nota: `estado_fabricacion`/`estado_venta` en la base están en español con mayúscula (`'Rehacer'`, `'Foto'`,
`'Señado'`) — respetar los mismos strings que usa `mapFabricationStateToDB`/`mapSaleStateToDB` en
[`mappers.ts:14-31`](src/lib/supabase/mappers.ts:14).

**Punto a confirmar (lista de motivos):** dejé 6 motivos razonables cubriendo tus 4 escenarios más "error de
medida/vector" (que mencionaste antes como causa técnica) y "otro". Es un `CHECK` fácil de ajustar — decime si
querés otros nombres/categorías antes de correr la migración.

---

## 3. Reglas de negocio por escenario (todas cubiertas por el mismo RPC)

El popup no pregunta "¿cuál de los 4 casos es?" — lo infiere solo, leyendo `estado_venta` y `estado_envio`
justo antes de abrir el diálogo, y se lo muestra al usuario como contexto de solo lectura.

| Tu escenario | Contexto detectado | Qué resetea el RPC |
|---|---|---|
| Se nota en la máquina | `venta = Señado`, `envío = Sin envio` | Solo `estado_fabricacion = Rehacer`. Nada más que tocar. |
| Cliente avisa antes de pagar | `venta = Foto`, `envío = Sin envio` | `estado_fabricacion = Rehacer`, limpia `foto_sello`, `venta` vuelve a `Señado`. Al volver a Hecho, vuelve a pedir foto sola. |
| Llega mal, ya pagado y enviado | `venta = Transferido`, `envío = Seguimiento Enviado` | `estado_fabricacion = Rehacer`. Venta **no se toca** (ya está cobrada). Envío se reinicia a `Sin envio` (con snapshot del seguimiento viejo guardado). Vuelve a generar etiqueta/seguimiento nuevo solo, con la misma automatización de `/envios`. |
| Ídem + hay que cobrar algo | Igual al anterior | Igual al anterior + fila con `cobro_adicional_monto`/`concepto`, visible en Pedidos (sección 6). |

### 3.1 Un solo ítem vs. el pedido entero

El RPC recibe `p_sello_ids uuid[]`, así que funciona igual para 1 ítem o para varios:

- **Desde la fila expandida de un ítem** (Pedidos, `CellFabricacion.tsx` con `singleItemId` definido, o
  Producción con un solo ítem clickeado): `p_sello_ids = [ese id]`.
- **Desde la fila resumen de un pedido** (Pedidos, sin `itemId` → hoy actualiza todos los ítems del pedido,
  [`OrdersTable.tsx:176-179`](src/components/pedidos/Table/OrdersTable.tsx:176)): `p_sello_ids` = todos los
  ítems de esa orden. Un solo motivo/descripción/cobro para todo el lote (si el pedido entero salió mal, no
  tiene sentido pedir 5 formularios idénticos).
- **Desde Producción con selección múltiple** ([`ProductionTable.tsx:276-278`](src/components/produccion/Table/ProductionTable.tsx:276),
  ya soporta aplicar a `selectedRows`): `p_sello_ids` = los ítems seleccionados, pueden ser de distintos
  pedidos — el RPC ya itera por sello y agrupa por `orden_id` para el reset de envío, así que funciona sin
  cambios.

### 3.2 Punto a confirmar: reenvío parcial (un ítem de varios, pedido ya despachado)

Acá está la limitación real de la arquitectura actual (sección 1): si un pedido de 3 ítems ya salió como un
solo paquete y 1 de los 3 hay que rehacerlo, el RPC va a resetear el envío **del pedido entero** (es lo único
que hay — no existe "envío por ítem"). En la práctica esto significa: cuando el ítem rehecho vuelva a estar
Hecho, el pedido va a volver a aparecer en la cola de "Hacer Etiqueta" en `/envios` como si hubiera que
despachar todo de nuevo — aunque en verdad solo hay que reenviar la pieza reemplazada.

No hay forma de resolver esto del todo sin rediseñar el envío para que sea por ítem (bastante más grande que
este plan). Mitigación barata para este alcance: cuando el RPC detecta que el envío se reinició sobre un
pedido que tiene **otros ítems no afectados por este rehacer** (`COUNT(sellos) > COUNT(p_sello_ids)` para esa
orden), se puede mostrar un aviso en `/envios` tipo el badge "Web — sin confirmar" que ya existe
([`envios/index.tsx:1453-1457`](src/app/envios/index.tsx:1453)) con el texto *"Reenvío parcial: solo
{diseño del ítem rehecho}"*, para que quien arma el paquete no reenvíe piezas que ya llegaron bien. Queda
como mejora **opcional, no bloqueante** para este plan (el dato para armarlo ya está en
`sello_rehacer_eventos`); avisame si la querés incluida ahora o después.

---

## 4. Capa de datos: nuevo servicio

Crear **`src/lib/supabase/services/rehacer.service.ts`**:

```ts
export interface RehacerContexto {
  selloId: string;
  ordenId: string;
  disenoNombre: string;
  fabricacionEstado: string;
  ventaEstado: string;           // 'Señado' | 'Foto' | 'Transferido'
  envioEstado: string | null;    // ordenes.estado_envio
  seguimiento: string | null;
  empresaEnvio: string | null;
  seguimientoEnviadoAt: string | null;
  cantidadItemsEnPedido: number; // para el aviso de "reenvío parcial" (3.2)
}

/** Contexto por ítem, para armar el resumen que se muestra en el popup antes de confirmar. */
export async function fetchRehacerContexto(selloIds: string[]): Promise<RehacerContexto[]>

export interface RegistrarRehacerInput {
  selloIds: string[];
  motivo: string;
  descripcion: string;
  cobroMonto?: number | null;
  cobroConcepto?: string | null;
}

export async function registrarRehacer(input: RegistrarRehacerInput): Promise<void> {
  const { error } = await supabase.rpc('registrar_rehacer', {
    p_sello_ids: input.selloIds,
    p_motivo: input.motivo,
    p_descripcion: input.descripcion,
    p_cobro_monto: input.cobroMonto ?? null,
    p_cobro_concepto: input.cobroConcepto ?? null,
  });
  if (error) throw error;
}

/** Para el indicador de la sección 6: cargos con monto, agrupados por pedido. */
export async function fetchReworkChargesForOrders(ordenIds: string[]): Promise<Map<string, ReworkCharge[]>>

export async function markReworkChargeCollected(eventId: string, cobrado: boolean): Promise<void>

/** Opcional: para mostrar "este ítem ya se rehizo N veces antes" en el propio popup. */
export async function fetchRehacerHistorialPorSello(selloId: string): Promise<RehacerEvento[]>
```

`fetchReworkChargesForOrders` hace `select * from sello_rehacer_eventos where orden_id in (...) and
cobro_adicional_monto is not null order by created_at desc` — mismo patrón de chunking por `in()` que ya usa
`buildOrdersFromOrdenes` para `sellos`/`tareas` ([`orders.service.ts:237-251`](src/lib/supabase/services/orders.service.ts:237)).

### 4.1 Extender el tipo `Order`

En [`src/lib/types/index.ts`](src/lib/types/index.ts), agregar:

```ts
export interface ReworkCharge {
  id: string;
  selloId: string;
  motivo: string;
  descripcion: string | null;
  monto: number;
  concepto: string | null;
  cobrado: boolean;
  createdAt: string;
}

// en Order:
reworkCharges?: ReworkCharge[];
```

### 4.2 Cargar `reworkCharges` junto con el resto de la orden

En `buildOrdersFromOrdenes` ([`orders.service.ts:220-257`](src/lib/supabase/services/orders.service.ts:220)),
sumar `fetchReworkChargesForOrders` al mismo `Promise.all` que ya trae `sellos`/`tareas` por chunk, y en el
lugar donde se arma cada `Order` final (más abajo en la misma función, donde hoy se le asigna `tasks: ...`),
agregar `reworkCharges: reworkChargesPorOrden.get(orden.id) ?? []`.

---

## 5. UI: popup de Rehacer

Crear **`src/components/shared/RehacerDialog.tsx`** (compartido entre Pedidos y Producción — es
autosuficiente: recibe solo IDs y hace su propia consulta de contexto, así no depende de si lo abrió una
tabla con el modelo `Order`/`OrderItem` o una con `ProductionItem`; en ambos casos `item.id` /
`singleItemId` **son el mismo `sello.id`**, confirmado en
[`production.service.ts:229`](src/lib/supabase/services/production.service.ts:229)).

```tsx
interface RehacerDialogProps {
  open: boolean;
  selloIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void; // el caller refresca su data (fetchOrders / refetch de producción)
}
```

Contenido:

1. Al abrir, `fetchRehacerContexto(selloIds)` y armar un resumen legible arriba del formulario:
   - 1 ítem: *"{diseño} — Venta: {venta}, Envío: {envío}"*.
   - Varios ítems: *"{N} ítems del pedido de {cliente}"* + el peor caso (si alguno ya está Transferido/enviado,
     avisarlo: *"Al menos uno de estos ítems ya estaba Transferido y con seguimiento enviado — se va a
     reiniciar el envío de todo el pedido"*, ligado al punto 3.2).
2. **Motivo** (`Select`, opciones del `CHECK` de la sección 2.1, "Otro" incluido).
3. **Descripción** (`Textarea`, obligatoria si el motivo es "Otro", opcional en el resto — decisión menor,
   ajustable).
4. Si algún ítem del lote tiene `ventaEstado !== 'Señado'` (ya se le mandó foto o ya pagó): sección opcional
   **"Cobro adicional"** — checkbox "Corresponde cobrar algo al cliente" que despliega `monto` + `concepto`
   (texto libre: "material", "mitad de precio", "envío", etc.).
5. Botón "Confirmar" → `registrarRehacer(...)` → toast de éxito → `onConfirmed()` → cerrar.

### 5.1 Dónde se dispara

**Pedidos** — [`CellFabricacion.tsx:48-52`](src/components/pedidos/Table/cells/CellFabricacion.tsx:48):

```tsx
const handleValueChange = (value: string) => {
  if (value === 'REHACER') {
    const ids = singleItemId ? [singleItemId] : order.items.map(i => i.id);
    onRequestRehacer?.(ids); // nueva prop, abre el RehacerDialog en OrdersTable/columns
    return;
  }
  onFabricacionChange?.(order.id, value as FabricationState, singleItemId);
};
```

El estado del diálogo (`open`, `selloIds`) vive en `OrdersTable.tsx` (mismo nivel que otros diálogos de esa
tabla), y `onConfirmed` llama a `fetchOrders()` (ya disponible ahí vía `useOrders`).

**Producción** — [`CellFabricacion.tsx:31-34`](src/components/produccion/Table/cells/CellFabricacion.tsx:31),
mismo patrón: si `value === 'REHACER'`, en vez de `onFabricacionChange`, disparar `onRequestRehacer?.(item.id)`.
En [`ProductionTable.tsx:272-293`](src/components/produccion/Table/ProductionTable.tsx:272), el estado del
diálogo se abre con `selectedRows.size > 0 ? Array.from(selectedRows) : [itemId]` (mismo criterio que ya usa
`handleFabricacionChange` para decidir el lote), y `onConfirmed` refresca vía lo que use `updateItem`/el store
de producción hoy (revisar `production.store.ts` para el método de refetch exacto al implementar).

**Importante:** en ambos casos, si el usuario cancela el popup, el `<Select>` no debe quedar visualmente en
"Rehacer" — hay que revertir el valor mostrado (el `Select` es controlado por `fabricationState` que viene de
`order`/`item`, así que alcanza con no cambiar el estado real hasta que el RPC confirme; no hace falta un
estado local extra).

---

## 6. UI: indicador de cobro adicional (solo Pedidos)

Crear **`src/components/pedidos/Table/cells/CellRehacerCargo.tsx`**, mismo patrón que
[`CellTasks.tsx`](src/components/pedidos/Table/cells/CellTasks.tsx) (lee un array embebido en `order`, ícono +
`Popover`):

```tsx
export function CellRehacerCargo({ order }: { order: Order }) {
  const charges = order.reworkCharges ?? [];
  if (!charges.length) return null;
  const pendientes = charges.filter(c => !c.cobrado);
  // Badge con ícono ($ o similar) — rojo/ámbar si hay pendientes de cobrar, gris si ya está todo cobrado.
  // Popover: lista de {concepto, monto, motivo, fecha}, con un toggle "Cobrado" por fila (markReworkChargeCollected).
}
```

Agregar a la columna `indicadores` en
[`columns.tsx:97-104`](src/components/pedidos/Table/columns.tsx:97), junto a `CellTasks`/`CellDeadline`:

```tsx
<CellRehacerCargo order={row.original} />
```

No se toca nada de Producción (su `columns.tsx` no recibe `reworkCharges` ni lo necesita — `ProductionItem`
no se extiende con este campo).

**Punto a confirmar:** dejé el cobro como dato puramente informativo (no se suma a `restante`/
`balanceAmountCached` del pedido ni pasa por Economía todavía). Si más adelante querés que ese monto sume al
saldo pendiente del cliente, es un paso aparte — mejor no mezclarlo con la lógica de pagos existente hasta
tener claro cómo se cobra en la práctica (transferencia aparte, se descuenta de otra cosa, etc.).

---

## 7. Checklist de pruebas manuales

1. Ítem sin foto/venta (recién salido mal de la máquina) → Rehacer → popup pide motivo/descripción, sin
   sección de cobro (venta = Señado) → confirma → `estado_fabricacion = Rehacer`, todo lo demás intacto.
2. Ítem con `Foto` enviada, sin pagar → Rehacer → confirma → venta vuelve a `Señado`, `foto_sello` se limpia
   → al volver a marcar el ítem `Hecho`, vuelve a aparecer en la cola de "falta mandar foto" sin tocar nada
   a mano.
3. Ítem `Transferido` + pedido `Seguimiento Enviado` → Rehacer → popup avisa que ya se había enviado y
   muestra sección de cobro → con o sin cobro cargado → confirma → venta sigue `Transferido`, envío del
   pedido vuelve a `Sin envio`, `seguimiento` queda vacío pero el viejo aparece guardado en el evento
   (`envio_seguimiento_previo`) y sigue existiendo la fila vieja en `estado_historial`.
4. Repetir el caso 3 pero desde un pedido de **3 ítems, rehaciendo solo 1**: confirmar que los otros 2 no
   cambian de `estado_venta`/`estado_fabricacion`, y que el pedido completo vuelve a aparecer en `/envios`
   como pendiente de etiqueta (documentar en la demo la limitación de 3.2, no es un bug).
5. Desde Producción, seleccionar varios sellos de **distintos pedidos** y marcar Rehacer en lote → un solo
   popup, un solo motivo/descripción → cada pedido afectado se resetea de forma independiente.
6. Cargar un cobro adicional → aparece el indicador en la fila del pedido en Pedidos → no aparece nada
   nuevo en Producción → togglear "Cobrado" desde el Popover y confirmar que persiste.
7. Cancelar el popup sin confirmar → el Select de Fabricación no queda trabado en "Rehacer".

---

## 8. Orden sugerido de implementación

1. Migración (`sello_rehacer_eventos` + `registrar_rehacer`) — sección 2.
2. Servicio `rehacer.service.ts` + extender `Order`/`buildOrdersFromOrdenes` — sección 4.
3. `RehacerDialog` compartido — sección 5, probado primero solo desde Pedidos.
4. Enganchar Producción al mismo diálogo — sección 5.1.
5. `CellRehacerCargo` en Pedidos — sección 6.
6. (Opcional, si se confirma) aviso de "reenvío parcial" en `/envios` — sección 3.2.
