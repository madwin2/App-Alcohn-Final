# Plan simple: mensaje a compras sin terminar + pedidos internacionales

> **Para Cursor (operario):** hacé exactamente lo que dice cada paso, nada más.
> Los SQL se corren **a mano en el SQL Editor de Supabase**. Guardá cada uno también como archivo `.sql` en la raíz del repo.

---

## PARTE 1: Mensaje a los que no completaron la compra

### Qué pasa hoy

El cron `comercial-contacto-pendientes` (cada 2 min) ejecuta `procesar_contactos_comerciales_pendientes()`. Esa función manda el mensaje `generador_muestras_contacto` 10 minutos después de que la muestra está lista, **pero solo si la muestra NO tiene orden** (`m.orden_id IS NULL`).

Cuando el cliente llega al checkout, la web crea la orden y la vincula a la muestra. Desde ese momento la función lo saltea, y como no paga, **no recibe ningún mensaje**. Además, los pedidos que no tienen muestra asociada (por ejemplo los internacionales) nunca reciben mensaje.

### Qué queremos

Mandar **el mismo mensaje** (`generador_muestras_contacto`) también a quien llegó al pago y **no pagó a los 10 minutos** de crear la orden.

### Paso 1.1: SQL `migration_contacto_compra_no_completada.sql`

Reemplaza la función existente. Mismo nombre y mismo cron, así que no hay que tocar nada más.

```sql
CREATE OR REPLACE FUNCTION public.procesar_contactos_comerciales_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_nombre text;
  v_enviados int := 0;
  v_omitidos int := 0;
BEGIN
  -- A) Muestras web: sin orden, o con orden que sigue sin pagar después de 10 min.
  FOR r IN
    SELECT m.id, m.whatsapp, m.nombre_muestra, m.nombre_slug
    FROM public.mockup_solicitudes m
    WHERE m.origen = 'web'
      AND m.estado IN ('completado', 'pendiente_aprobacion')
      AND NULLIF(trim(m.whatsapp), '') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_enviado_at') IS NULL
      AND (m.metadata_web->>'contacto_comercial_omitido_at') IS NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz <= now()
      AND (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz > now() - interval '3 days'
      AND (
        m.orden_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.ordenes o
          WHERE o.id = m.orden_id
            AND o.estado_pago_web IS DISTINCT FROM 'pagado'
            AND o.created_at <= now() - interval '10 minutes'
        )
      )
      -- Si el cliente ya pagó otra orden, no escribir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes op
        WHERE op.cliente_id = m.cliente_id
          AND op.estado_pago_web = 'pagado'
          AND op.created_at >= m.created_at - interval '1 day'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.comercial_exclusiones e
        WHERE e.entity_type = 'mockup' AND e.entity_id = m.id
      )
    ORDER BY (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz ASC
    LIMIT 15
  LOOP
    IF public.contacto_comercial_enviado_recientemente(r.whatsapp, 7) THEN
      UPDATE public.mockup_solicitudes
      SET metadata_web = COALESCE(metadata_web, '{}'::jsonb) || jsonb_build_object(
        'contacto_comercial_omitido_at', to_jsonb(now()),
        'contacto_comercial_omitido_motivo', 'cooldown_7_dias'
      )
      WHERE id = r.id;
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    v_nombre := COALESCE(NULLIF(trim(r.nombre_muestra), ''), NULLIF(trim(r.nombre_slug), ''), 'Cliente');

    PERFORM public.enviar_webhook_pedido(
      'generador_muestras_contacto',
      trim(r.whatsapp),
      v_nombre,
      jsonb_build_object('solicitud_mockup_id', r.id::text),
      NULL,
      NULL
    );

    UPDATE public.mockup_solicitudes
    SET metadata_web = COALESCE(metadata_web, '{}'::jsonb) || jsonb_build_object(
      'contacto_comercial_enviado_at', to_jsonb(now()),
      'contacto_comercial_tipo', 'generador_muestras_contacto'
    )
    WHERE id = r.id;

    v_enviados := v_enviados + 1;
  END LOOP;

  -- B) Órdenes web sin muestra vinculada (ej. internacionales) que no pagaron en 10 min.
  FOR r IN
    SELECT o.id, c.nombre, c.telefono
    FROM public.ordenes o
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE o.origen = 'Web'
      AND o.mockup_solicitud_id IS NULL
      AND o.estado_pago_web IN ('pendiente', 'pago_fallido', 'esperando_comprobante')
      AND o.created_at <= now() - interval '10 minutes'
      AND o.created_at > now() - interval '3 days'
      AND (o.notas_web->>'contacto_comercial_enviado_at') IS NULL
      AND NULLIF(trim(c.telefono), '') IS NOT NULL
      -- Ya pagó otra orden (checkout duplicado) → no escribir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes op
        WHERE op.cliente_id = o.cliente_id
          AND op.id <> o.id
          AND op.estado_pago_web = 'pagado'
          AND op.created_at >= o.created_at - interval '1 day'
      )
      -- Ya le escribimos por otra orden en los últimos 7 días → no repetir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes o2
        WHERE o2.cliente_id = o.cliente_id
          AND o2.id <> o.id
          AND (o2.notas_web->>'contacto_comercial_enviado_at')::timestamptz > now() - interval '7 days'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.comercial_exclusiones e
        WHERE (e.entity_type = 'orden' AND e.entity_id = o.id)
           OR (e.entity_type = 'cliente' AND e.entity_id = o.cliente_id)
      )
    ORDER BY o.created_at ASC
    LIMIT 15
  LOOP
    PERFORM public.enviar_webhook_pedido(
      'generador_muestras_contacto',
      trim(r.telefono),
      public.primer_nombre_comercial(r.nombre),
      jsonb_build_object('orden_id', r.id::text),
      r.id,
      NULL
    );

    UPDATE public.ordenes
    SET notas_web = COALESCE(notas_web, '{}'::jsonb) || jsonb_build_object(
      'contacto_comercial_enviado_at', to_jsonb(now())
    )
    WHERE id = r.id;

    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN jsonb_build_object('enviados', v_enviados, 'omitidos', v_omitidos, 'at', now());
END;
$$;
```

> ⚠️ **Al correrlo**, en los próximos minutos van a salir mensajes a los que no pagaron en los **últimos 3 días** (hoy son unos 8 clientes). Si no se quiere eso, cambiar las dos líneas `interval '3 days'` por `interval '1 hour'` antes de correrlo, y al día siguiente volver a correrlo con `'3 days'`.

### Paso 1.2: Probar

1. Hacer una muestra en la web con un número propio, ir al checkout y no pagar.
2. A los ~10-12 min tiene que llegar el mensaje de siempre.
3. Chequear: `SELECT tipo_actualizacion, success, created_at FROM webhook_logs ORDER BY created_at DESC LIMIT 5;`
4. Agregar esa muestra y esa orden a `comercial_exclusiones` para que no ensucien las métricas.

---

## PARTE 2: Pedidos internacionales (Chile, Perú, México y Colombia)

### Idea

- La web ya guarda en `ordenes.notas_web.international` el país (`countryIso2`), la moneda (`currency`), el envío (`shipping`) y la dirección DHL (`shippingForm`). **No hace falta ninguna columna nueva:** leemos de ahí.
- Los valores de los sellos **quedan en la moneda del país** (como ya los guarda la web). En **Pedidos** se muestran así (ej. `S/ 661`).
- En **Economía** se convierten a pesos con una tasa fija por país.
- El envío queda como **DHL**.

### Tasas de conversión (ARS por 1 unidad de moneda local)

Salen de la lista de precios: chico = $69.500 y mediano = $83.500.

| País | ISO | Moneda | Chico | Mediano | Tasa usada | Control grande | Control DHL |
|---|---|---|---|---|---|---|---|
| México | MX | MXN | 940 | 1.130 | **73,9** | 1.330 → $98.287 | 700 → $51.730 |
| Colombia | CO | COP | 179.000 | 215.000 | **0,3883** | 254.000 → $98.628 | 133.000 → $51.644 |
| Perú | PE | PEN | 183 | 219 | **380,5** | 259 → $98.550 | 136 → $51.748 |
| Chile | CL | CLP | 50.000 | 60.000 | **1,39** | 70.000 → $97.300 | 37.000 → $51.430 |

La venta de Perú (S/ 661) queda en **≈ $251.500**.

### Paso 2.1: Archivo nuevo `src/lib/internacional.ts`

```ts
import type { Order } from '@/lib/types/index';

export type PaisInternacional = {
  iso2: 'MX' | 'CO' | 'PE' | 'CL';
  nombre: string;
  moneda: string;
  simbolo: string;
  /** Pesos argentinos por 1 unidad de moneda local (sale de la lista de precios). */
  arsPorUnidad: number;
  decimales: number;
};

export const PAISES_INTERNACIONALES: Record<PaisInternacional['iso2'], PaisInternacional> = {
  MX: { iso2: 'MX', nombre: 'México', moneda: 'MXN', simbolo: '$', arsPorUnidad: 73.9, decimales: 0 },
  CO: { iso2: 'CO', nombre: 'Colombia', moneda: 'COP', simbolo: '$', arsPorUnidad: 0.3883, decimales: 0 },
  PE: { iso2: 'PE', nombre: 'Perú', moneda: 'PEN', simbolo: 'S/', arsPorUnidad: 380.5, decimales: 0 },
  CL: { iso2: 'CL', nombre: 'Chile', moneda: 'CLP', simbolo: '$', arsPorUnidad: 1.39, decimales: 0 },
};

/** Lee el país desde notas_web.international (countryIso2 o, si falta, currency). */
export function paisDesdeNotasWeb(notasWeb: unknown): PaisInternacional | null {
  const intl = (notasWeb as { international?: { countryIso2?: string; currency?: string } } | null)?.international;
  if (!intl) return null;
  const iso = String(intl.countryIso2 ?? '').toUpperCase();
  if (iso in PAISES_INTERNACIONALES) return PAISES_INTERNACIONALES[iso as PaisInternacional['iso2']];
  const cur = String(intl.currency ?? '').toUpperCase();
  return Object.values(PAISES_INTERNACIONALES).find((p) => p.moneda === cur) ?? null;
}

/** Ej.: "S/ 661", "$940 MXN", "$179.000 COP". */
export function formatMontoInternacional(monto: number, pais: PaisInternacional): string {
  const n = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: pais.decimales,
  }).format(monto);
  return pais.simbolo === '$' ? `$${n} ${pais.moneda}` : `${pais.simbolo} ${n}`;
}

export function aPesos(monto: number, pais: PaisInternacional | null | undefined): number {
  return pais ? Math.round(monto * pais.arsPorUnidad) : monto;
}

/** Copia del pedido con todos los montos pasados a pesos (para Economía). */
export function pedidoEnPesos(order: Order): Order {
  const pais = order.international;
  if (!pais) return order;
  const items = order.items.map((it) => {
    const valorArs = aPesos(Number(it.itemValue || 0), pais);
    return {
      ...it,
      itemValue: valorArs,
      depositValueItem: aPesos(Number(it.depositValueItem || 0), pais),
      fabricationMarginItem: valorArs - Number(it.fabricationCostItem || 0),
    };
  });
  const totalArs = aPesos(Number(order.totalValue || 0), pais);
  return {
    ...order,
    totalValue: totalArs,
    depositValueOrder: aPesos(Number(order.depositValueOrder || 0), pais),
    restPaidAmountOrder: aPesos(Number(order.restPaidAmountOrder || 0), pais),
    paidAmountCached: aPesos(Number(order.paidAmountCached || 0), pais),
    balanceAmountCached: aPesos(Number(order.balanceAmountCached || 0), pais),
    fabricationMarginTotal: totalArs - Number(order.fabricationCostTotal || 0),
    items,
  };
}
```

### Paso 2.2: Tipos (`src/lib/types/index.ts`)

- Agregar `'DHL'` a `ShippingCarrier`:
  ```ts
  export type ShippingCarrier = 'ANDREANI' | 'CORREO_ARGENTINO' | 'VIA_CARGO' | 'OTRO' | 'RETIRO_EN_PERSONA' | 'DHL';
  ```
- En `interface Order` agregar:
  ```ts
  /** País del pedido internacional (null = pedido nacional). Los montos del pedido están en su moneda. */
  international?: import('@/lib/internacional').PaisInternacional | null;
  /** Envío DHL cobrado al cliente, en moneda local. */
  internationalShipping?: number | null;
  /** Datos de destino DHL (notas_web.international.shippingForm). */
  internationalAddress?: Record<string, string> | null;
  ```

Al agregar `'DHL'`, TypeScript va a marcar error en los `Record<ShippingCarrier, string>`. Agregar `DHL: 'DHL'` en:
- `src/lib/supabase/mappers.ts`, en `mapShippingCarrierToDB` y también en `mapShippingCarrier` (`'DHL': 'DHL'`).
- `src/lib/supabase/services/orders.service.ts` (~línea 1533, `empresaMap`). Además, al principio de `getShippingCost` agregar `if (carrier === 'DHL') return 0;`.
- `src/lib/utils/trackingValidation.ts` (`CARRIER_LABELS`). En la línea 26, agregar `|| carrier === 'DHL'`.

### Paso 2.3: Mapper (`src/lib/supabase/mappers.ts`, en `mapOrdenToOrder`)

Agregar al objeto que se retorna:

```ts
international: paisDesdeNotasWeb(orden.notas_web),
internationalShipping: Number((orden.notas_web as any)?.international?.shipping ?? 0) || null,
internationalAddress: ((orden.notas_web as any)?.international?.shippingForm as Record<string, string>) ?? null,
```

(importar `paisDesdeNotasWeb` de `@/lib/internacional`).

### Paso 2.4: SQL `migration_envio_dhl.sql` (DHL automático)

```sql
-- 1. Permitir DHL
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_empresa_envio_check;
ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_empresa_envio_check CHECK (
  empresa_envio IS NULL OR empresa_envio::text = ANY (ARRAY[
    'Andreani','Correo Argentino','Via Cargo','Retiro','Retiro en Persona','DHL'
  ]::text[])
);

-- 2. Toda orden internacional nueva entra como DHL domicilio
CREATE OR REPLACE FUNCTION public.trg_ordenes_internacional_dhl()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.notas_web, '{}'::jsonb) ? 'international' AND NEW.empresa_envio IS NULL THEN
    NEW.empresa_envio := 'DHL';
    NEW.tipo_envio := COALESCE(NEW.tipo_envio, 'Domicilio');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ordenes_internacional_dhl ON public.ordenes;
CREATE TRIGGER trigger_ordenes_internacional_dhl
  BEFORE INSERT ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public.trg_ordenes_internacional_dhl();

-- 3. Las que ya existen
UPDATE public.ordenes
SET empresa_envio = 'DHL', tipo_envio = COALESCE(tipo_envio, 'Domicilio')
WHERE notas_web ? 'international' AND empresa_envio IS NULL;
```

### Paso 2.5: Bandera

Archivo nuevo `src/components/shared/CountryFlag.tsx`. Usa una imagen porque Windows no muestra los emojis de banderas:

```tsx
export function CountryFlag({ iso2, title }: { iso2: string; title?: string }) {
  const code = iso2.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/20x15/${code}.png`}
      srcSet={`https://flagcdn.com/40x30/${code}.png 2x`}
      width={20}
      height={15}
      alt={title ?? iso2}
      title={title ?? iso2}
      className="inline-block shrink-0 rounded-[2px] shadow-sm"
    />
  );
}
```

En `src/components/pedidos/Table/cells/CellCliente.tsx`, en el bloque `content`, envolver el nombre en `flex items-center gap-1.5` y, si `order.international`, poner antes del nombre `<CountryFlag iso2={order.international.iso2} title={`Pedido internacional · ${order.international.nombre}`} />`.

### Paso 2.6: Montos en Pedidos en moneda local

Agregar en `src/lib/internacional.ts`:

```ts
import { formatCurrency } from '@/lib/utils/format';

/** Formatea un monto del pedido: moneda local si es internacional, ARS si no. */
export function formatMontoPedido(order: Pick<Order, 'international'>, monto: number): string {
  return order.international ? formatMontoInternacional(monto, order.international) : formatCurrency(monto);
}
```

Reemplazar `formatCurrency(x)` por `formatMontoPedido(order, x)` **solo** en estos archivos, en los montos de valor, seña y restante del pedido:

- `src/components/pedidos/Table/cells/CellValor.tsx` (2 lugares)
- `src/components/pedidos/Table/cells/CellSena.tsx` (2 lugares)
- `src/components/pedidos/Table/cells/CellRestante.tsx` (las 3 de `restanteFinal`; las de `shippingCost` dejarlas)
- `src/components/pedidos/Table/cells/CellSummary.tsx` (líneas ~106, 113 y 120)
- `src/components/pedidos/Table/OrderSummaryRow.tsx` (si tiene montos con `formatCurrency`)

La edición inline no se toca: se edita en la moneda local, que es como está guardado.

### Paso 2.7: Envío DHL en Pedidos

`src/components/pedidos/Table/cells/CellEnvio.tsx`:
- Agregar `'DHL'` al tipo `ShippingOption` y la opción `{ value: 'DHL', carrier: 'DHL', service: null, iconName: '', label: 'DHL Internacional' }`.
- En `getCurrentShippingOption`, agregar `if (carrier === 'DHL') return 'DHL';`.
- Si el carrier es DHL, mostrar el texto "DHL" en un badge amarillo. Si hay `order.internationalAddress`, agregar un `title` con la dirección (`nombreCompleto, direccion1, distrito, ciudad, region, codigoPostal, telefono`) y un botón chico **"Copiar dirección"** que la copie con `navigator.clipboard.writeText` y muestre un toast.

`src/components/pedidos/Table/cells/CellSummary.tsx` (~línea 90): agregar `order.shipping.carrier === 'DHL' ? 'DHL Internacional' :`.

### Paso 2.8: Que DHL no entre al flujo de Correo Argentino

En `src/app/envios/index.tsx` (~línea 176), hoy todo lo que no es Andreani ni Vía Cargo cae en Correo Argentino/MiCorreo. Cambiar:

```ts
const isDhlShipping = (order: Order): boolean => order.shipping?.carrier === 'DHL';

/** Flujo Correo Argentino / MiCorreo (excluye Andreani, Via Cargo y DHL). */
const isCorreoShippingFlow = (order: Order): boolean =>
  !isAndreaniShipping(order) && !isViaCargoShipping(order) && !isDhlShipping(order);
```

(No hace falta una sección DHL en Envíos: se gestiona a mano con el "Copiar dirección" de Pedidos.)

En `src/components/envios/EnviosHistorialTable.tsx` y `EnviosHistorialDetailDialog.tsx`, agregar la rama `carrier === 'DHL'` → `'DHL'`.

### Paso 2.9: Economía en pesos

En `src/app/economia/index.tsx`:

1. Donde está `const { orders, loading, ... } = useOrders({...})` (~línea 372), renombrar `orders` a `ordersRaw` y justo abajo agregar:
   ```ts
   const orders = useMemo(() => ordersRaw.map(pedidoEnPesos), [ordersRaw]);
   ```
   (importar `pedidoEnPesos` y `aPesos` de `@/lib/internacional`). Así ventas, transferido, pendiente, margen y desglose por producto quedan en pesos sin tocar el resto.
2. En el cálculo de `envioImputadoVentas` (~línea 582), agregar primero el caso internacional (el envío DHL cobrado, pasado a pesos):
   ```ts
   const envioImputadoVentas = economiaPedidoListoParaImputarEnvio(order)
     ? order.international
       ? aPesos(Number(order.internationalShipping || 0), order.international)
       : orderHasShippingCarrierAndService(order)
         ? (shippingCostByOrderId[order.id] ?? ECONOMIA_ENVIO_SIN_TIPO_ARS)
         : ECONOMIA_ENVIO_SIN_TIPO_ARS
     : 0;
   ```
3. Si `src/lib/utils/exportVentas.ts` se usa para exportar ventas en pesos, pasarle `pedidoEnPesos(order)` en vez de `order`.

### Paso 2.10: Probar

1. `npx tsc --noEmit` sin errores.
2. En Pedidos, la venta de Perú (Carla Mazzi) muestra la bandera de Perú, el valor `S/ 661` y el envío "DHL".
3. En Economía, esa venta suma ≈ $251.500 (no $661) y el margen es positivo.
4. Un pedido nacional se ve exactamente igual que antes.
5. En Envíos, la orden de Perú **no** aparece en Correo Argentino.

---

## Notas para Julian (no son tareas de Cursor)

- **Para cambiar una tasa**, editar `arsPorUnidad` en `src/lib/internacional.ts`. Es una tasa fija: si cambian los precios de la lista, se actualiza ahí.
- **El cliente de México** quedó guardado en la base como `+54523334963531` (con un +54 de más). Los WhatsApp no le van a llegar hasta que la web deje de anteponer +54 a los números extranjeros.
- **Del 16/9 al 22/9 el bot no mandó ningún mensaje:** fallaron todos los webhooks. Conviene mirar los logs del servidor de esos días.
