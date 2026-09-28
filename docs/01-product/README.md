# Producto: actores, superficies y oferta

## 1. Actores

> Personas concretas y responsabilidades: ver [equipo.md](equipo.md).

| Actor | Evidencia | Qué hace en/con Alcohn AI |
|---|---|---|
| **Usuario interno** (equipo Alcohn) | ✅ Supabase Auth + `solicitudes_registro` aprobada | Opera todas las pantallas. No hay permisos por pantalla (ver [09](../09-roles-permissions/README.md)). |
| Usuario con área **ventas** | ✅ `usuario_area.area='ventas'` | Recibe notificaciones de ventas (sellos terminados, deudores, rehacer, ítems agregados a pedidos pagados). 🔶 Atiende clientes, carga pedidos y fotos. |
| Usuario con área **producción** | ✅ `usuario_area.area='produccion'` | Recibe notificaciones de producción (prioridades, cambios en sellos en curso, vencimientos, stock bajo, sellos que no entraron a Aspire). 🔶 Vectoriza, arma programas, opera Aspire/CNC. |
| Usuario con área **logística** | ✅ `usuario_area.area='logistica'` | Recibe notificaciones de despachos próximos/vencidos y cambios de dirección post-etiqueta. 🔶 Carga datos de envío, imprime y despacha. |
| **Dueño / administración** | ✅ una cuenta hardcodeada ve Economía y Gastos y es la única que puede editar Precios (RLS) | 🔶 Finanzas, precios, costos. ❓ [Q-USR-002](../14-open-questions/usuarios-permisos.md#q-usr-002) |
| **Cliente final** | ✅ `clientes` | No usa Alcohn AI. Recibe WhatsApp automáticos, compra en la tienda web, completa links de Andreani. |
| **Cuenta de revisión de Meta** (`FBTEST`) | ✅ `src/lib/auth/access.ts` | Solo puede ver `/whatsapp` (para aprobar la app de Meta). |
| **Operario de máquina** (Fede, en la PC de cada CNC) | ✅ gadgets Lua + `programa-sync` | Corre el gadget, que habla con Alcohn AI sin sesión de usuario (clave de instalación + token por programa). Es la misma persona que vectoriza y arma los programas. |
| **Sistemas** | ✅ | Bot de WhatsApp, workers de MiCorreo/Andreani/vector, tienda web, pg_cron. Ver [07-integrations](../07-integrations/README.md). |

## 2. Qué vende Alcohn (según el modelo de datos)

### 2.1 Tipos de ítem (`sellos.item_type`) ✅

| Valor | Nombre en UI | Pasa por vector / programa CNC | Insumos que descuenta del stock (al despachar) | Costo de fabricación (trigger) |
|---|---|---|---|---|
| `SELLO` | Sello | Sí | tubo 80 mm, prisionero, varilla, mango, tuerca | amortización fresa + mango madera + varilla + prisionero + tubo + bronce por cm |
| `ABECEDARIO` | Abecedario ("ABC"): letras individuales + contenedor; el único ítem que no es un sello | Se fabrica en la **máquina Grande en un programa especial**, armado a mano en Aspire (en la app: máquina `ABC`, sin paquete) | tubo 125 mm, mango, varilla, prisionero, tuerca, soporte, caja | amortización + soporte + mango + varilla + prisionero + caja + tubo + bronce (40 o 80 cm) |
| `SOLDADOR` | Soldador eléctrico (100 W / 200 W). "Adaptado" = se le corta la punta y se le hace una rosca M6 para enroscar el sello | No (se adapta a mano) | soldador adaptado (si no hay, soldador "crudo") | soldador + amortización |
| `MANGO_GOLPE` | Mango de golpe (viene hecho) | No | mango de golpe | costo fijo |
| `BASE_REMACHADORA` | Base para remachadora (viene hecha) | No | base remachadora + aluminio para base | base + amortización |

Distribución real: 3.765 sellos, 51 soldadores, 26 bases, 16 abecedarios, 15 mangos de golpe.

### 2.2 Tipos de sello (`sellos.tipo`) ✅

`Clasico` (3.802), `3mm` (34), `Lacre` (22), `Alimento` (11), `ABC` (4).
✅ Confirmado por el equipo (Q-GEN-003):

| Tipo | Qué es |
|---|---|
| `Clasico` | Desbaste con fresa recta de 6 mm + grabado cónico de **1,7 mm** de profundidad. El estándar. |
| `3mm` | Desbaste con fresa recta de 6 mm a **3 mm** de profundidad + grabado cónico de 3 mm. Pedidos especiales. |
| `Lacre` | Sello para lacre: lleva un **cabezal torneado especial** (cabezal de lacre). Diferencia de uso. |
| `Alimento` | 3 mm de profundidad y además **cortado con la forma del diseño**, para que la base no marque la superficie. |
| `ABC` | Abecedario (no es un sello). |

El tipo determina la plantilla de trayectorias en Aspire (`roughing_<tipo>`, `profile_<tipo>`) y la capa (`VECTOR` vs `VECTOR 3MM`).

### 2.3 Máquinas CNC ✅

⚠️ Físicamente hay **dos CNC, cada una con su PC** (Q-CNC-001). El código modela tres (C, G, XL): ver [Q-CNC-007](../14-open-questions/produccion-fabricacion.md#q-cnc-007).

| Código | Nombre en UI | Planchuelas que acepta | Largo máximo por planchuela |
|---|---|---|---|
| `C` | Chica | 12, 19, 25, 38 mm | 400 mm |
| `G` | Grande | 12, 38 mm | 250 mm |
| `XL` | XL | 63 mm | 250 mm |
| `ABC` | (abecedarios) | cualquier tamaño, solo sellos tipo `ABC` | sin tope; no genera paquete Aspire |

Fuente: `src/lib/programas/material.ts`, `fabricacion_parametros.params`. La DB admite además `maquina='Circular'` en `programa` (legado, se mapea a `C`).

### 2.4 Planchuela

✅ Las planchuelas llegan **ya cortadas** para colocar en la CNC; se compran en Buenos Aires (2–3 días de demora). Si no alcanza el material, se espera la compra (Q-CNC-004).

🔶 Barra de bronce del ancho indicado (12, 19/20, 25, 38/40, 63 mm) de la que se mecanizan los sellos uno detrás de otro. El tamaño se elige por el **lado menor** del sello:

| Lado menor (cm) | Planchuela |
|---|---|
| ≤ 1,2 | 12 |
| ≤ 1,8 | 19 (stock de 20 mm, útil 18 mm) |
| ≤ 2,5 | 25 |
| ≤ 4,0 | 38 |
| > 4,0 | 63 |

Cada sello consume a lo largo de la planchuela su **lado mayor + 0,8 cm** de pérdida de corte. ✅ `resolvePlanchuelaRef`, `stampLengthAlongMm`, trigger `registrar_bronce_consumo_sello`.
❓ Nomenclatura: el código usa a la vez 19/20 y 38/40 para la misma planchuela → ver [05-data/inconsistencias-de-nombres.md](../05-data/inconsistencias-de-nombres.md).

## 3. Superficies (pantallas)

Ver la tabla de rutas en [mapa-del-sistema.md](../00-overview/mapa-del-sistema.md#4-rutas-de-la-aplicación) y el inventario completo en [02-modules](../02-modules/README.md).

## 4. Canales de venta

✅ `clientes.medio_contacto`: `Whatsapp` (2.832), `Web` (2.174), `Instagram` (357), `Facebook` (227), `Mail` (8).
⚠️ El alta manual de pedidos **no guarda** el canal elegido en el formulario: siempre escribe `Whatsapp` si hay teléfono (`mapCustomerToCliente`). Ver [AUD-INC-004](../audits/inconsistencias.md#aud-inc-004). El equipo confirma que casi todo entra por WhatsApp, así que el impacto es bajo.
