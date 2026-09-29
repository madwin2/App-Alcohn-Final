# WF-01 · Alta manual de pedido

| | |
|---|---|
| **Inicio** | ❓ El cliente ya acordó comprar (por WhatsApp, Instagram, Facebook, mail) y 🔶 pagó una seña. |
| **Actor** | Usuario de Ventas (🔶). |
| **Módulos** | Pedidos, Precios (cotización), WhatsApp (bot), Vectorización (si hay base) |
| **Resultado** | Orden `Señado` con sus ítems, archivos subidos y cliente notificado. |

## Pasos

1. ❓ Conversación de venta fuera de Alcohn AI (diseño, medida, precio, seña, envío) → [FR-01](../10-operational-boundaries/README.md#fr-01).
2. Pedidos → **Nuevo pedido** (`NewOrderDialog`).
3. **Paso 1 — Cliente**: nombre, apellido, teléfono, email, canal, casilla **pedido internacional** (si se marca, país obligatorio: México, Colombia, Perú o Chile), casilla "no enviar confirmación por WhatsApp".
4. **Paso 2 — Diseños** (uno o más). Por cada uno: tipo de ítem, tipo de sello, nombre del diseño, medida, notas, **valor** y **seña** (se sugiere el precio desde la tabla de Precios según medida; en pedidos internacionales se convierte a la moneda local), empresa/servicio de envío (**DHL** por defecto si es internacional), estados iniciales (fabricación, venta, envío), prioridad, fecha límite, archivos (base, vector, foto). Para abecedarios: tipografía, altura, juegos de mayúsculas/minúsculas, letras extra, caracteres especiales. Para soldador: potencia.
5. **Paso 3 — Resumen** → Crear. Si algún vector no es SVG, aparece la advertencia y hay que confirmar.
6. Sistema (✅ `createOrder` + `addStampToOrder`):
   - Busca cliente existente por teléfono (tolerando `+54`, `549`, etc.) y luego por email; si existe, **actualiza** sus datos; si no, lo crea (`medio_contacto` queda `Whatsapp`, ver AUD-INC-004).
   - Crea `ordenes` (`estado_orden='Señado'`, fecha de hoy en Argentina, `taken_by`, empresa/servicio del primer diseño). Si es internacional: `notas_web.international` (`countryIso2` + `currency`); montos en moneda local; envío suele ser DHL.
   - Crea un `sellos` por diseño y sube sus archivos.
   - Si hay base sin vector y la vectorización automática estuviera activa, encola el job (hoy inactiva).
7. Automatizaciones (✅ triggers): `restante = valor − seña` por ítem; totales de la orden + costo de envío; costo y margen de fabricación; historial de estados; evento Purchase a Meta.
8. Si no se marcó la casilla: WhatsApp **`pedido_registrado`** (vía `webhook-bot`, que enriquece con ítems, montos, tipo de envío y link de Andreani si ya tuviera).
9. Si la empresa es Andreani y no hay link asignado: aviso "Sin links Andreani disponibles — generá más" (el link se asigna recién al enviar la foto, ver WF-07).

## Cambios de estado

| Entidad | Campo | Valor |
|---|---|---|
| orden | `estado_orden` | `Señado` |
| orden | `estado_envio` | 🔶 `NULL` (el mapper no recibe ítems al crear la orden); se muestra como "Sin envío" |
| ítem | `estado_fabricacion` | el elegido (por defecto `Sin Hacer`) |
| ítem | `estado_venta` | el elegido (por defecto `Señado`) |
| ítem | `estado_vectorizacion` | `VECTORIZADO` si se subió vector; si no `BASE` |

## Decisiones humanas

Precio y seña (la cotización es sugerencia), estados iniciales, prioridad, fecha límite, si avisar al cliente.

## Excepciones

- Falla la subida de un archivo: el pedido se crea igual, sin ese archivo (solo log).
- Falla el WhatsApp: el pedido queda creado; el error va a consola.
- Envío y fecha límite de los diseños 2..N se ignoran (se usa el del primero).

## Preguntas

[Q-VEN-001](../14-open-questions/ventas-cobros.md#q-ven-001) (cómo se cobra la seña), [Q-PED-001](../14-open-questions/pedidos.md#q-ped-001) (cuándo se omite la confirmación), [Q-PED-002](../14-open-questions/pedidos.md#q-ped-002) (canal no guardado).
