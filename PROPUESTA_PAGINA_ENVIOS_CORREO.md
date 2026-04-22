# Propuesta: página «Envíos / Correo Argentino»

Documento para alinear el diseño de la subpágina de envíos y servir como **guía de implementación por tareas** (por ejemplo, para ejecutarla por etapas con el asistente de Cursor).

---

## 1. Objetivo

Centralizar el flujo **post-venta / pre-etiqueta** para órdenes listas para despacho:

1. Ver en una tabla las órdenes que cumplen criterios estrictos de «listas para cargar datos de envío».
2. Por cada orden, **registrar o actualizar** los datos de destino (alineados con la tabla `direcciones` y con lo que exige la plantilla de Correo Argentino).
3. Permitir **pegar texto libre** del cliente y **extraer automáticamente** nombre, provincia, localidad, domicilio o sucursal, CP, email y teléfono, con posibilidad de revisar y corregir antes de guardar.
4. **Generar el CSV** de carga masiva compatible con Mi Correo / Correo Argentino, reutilizando la lógica y referencias de la carpeta `correo arg auto` (sin depender de Streamlit en producción si la app ya es React).

**Unidad de trabajo definida:** en esta subpágina el envío se gestiona **por orden** (un set de datos de envío por `orden_id`), no por ítem/sello.

---

## 2. Contexto en el código actual

| Pieza | Ubicación / notas |
|--------|-------------------|
| Navegación lateral | `src/components/pedidos/Sidebar/Sidebar.tsx` — array `sidebarItems` + ruta en `App.tsx`. |
| Página de pedidos (referencia UI) | `src/app/pedidos/index.tsx`, `OrdersTable`, `OrdersHeader`. |
| Modelo de orden en frontend | `src/lib/types/index.ts` — `Order`, `OrderItem`, estados `FabricationState`, `SaleState`, `ShippingState`. |
| Mapeo BD ↔ UI | `src/lib/supabase/mappers.ts` — fabricación, venta, envío, transportista. |
| Tabla `direcciones` | `src/lib/supabase/types.ts` — `cliente_id`, `nombre`, `apellido`, `provincia`, `localidad`, `domicilio`, `codigo_postal`, `telefono`, `activa`, etc. |
| Tabla `ordenes` | `direccion_id`, `empresa_envio`, `tipo_envio`, `estado_envio`, `estado_orden`, `seguimiento`. |
| Sellos | `estado_fabricacion`, `estado_venta` por ítem; el **estado de envío mostrado en ítems** se propaga desde `orden.estado_envio` (ver `mapOrdenToOrder` en `mappers.ts`). |
| Automatización CSV (referencia) | `correo arg auto/` — `app.py`, `generar_carga_correo.py`, CSV de sucursales, `CAMPOS` de plantilla, normalización de provincias. |

**Importante:** en los scripts Python de `correo arg auto` aparecen claves de API incrustadas. En cualquier port a la app, usar **variables de entorno** y rotar claves si estuvieron expuestas en el repositorio.

---

## 3. Regla de negocio: qué órdenes entran en la tabla

Criterio pedido por producto (ajustar si el negocio prefiere solo mirar `estado_orden`):

| Dimensión | Condición sugerida | Valores en BD (referencia) |
|-----------|--------------------|----------------------------|
| Fabricación | Todos los sellos de la orden en **Hecho** | `sellos.estado_fabricacion = 'Hecho'` para cada sello de esa `orden_id` |
| Venta | Estado de venta **Foto Enviada** o **Transferido** | `sellos.estado_venta IN ('Foto', 'Transferido')` **para todos** los sellos, **o** coherencia con `ordenes.estado_orden` (`'Foto'`, `'Transferido'`) — **definir una sola regla** en implementación para evitar órdenes inconsistentes |
| Envío | Aún sin envío | `ordenes.estado_envio = 'Sin envio'` (respetar mayúsculas/minúsculas exactas del tipo en `types.ts`) |
| Transportista (recomendado) | Solo órdenes que se van a mandar por Correo | `ordenes.empresa_envio = 'Correo Argentino'` |

**Orden con varios sellos (regla cerrada):** una fila = **una orden**. El flujo no opera por sello/ítem. Para Correo Argentino se genera **una fila CSV por orden** con `numero_orden` = id o número interno.

---

## 4. Propuesta de UX de la subpágina

### 4.1 Layout general

- Misma estética que la página de `Pedidos`: reutilizar layout, espaciados, tipografías, colores, estilos de header, estados de carga/vacío, toasts y comportamiento de tabla.
- Misma envoltura base: `Sidebar` + contenido con margen (`ml-20`).
- Título claro, por ejemplo: **«Envíos — Correo Argentino»**.
- Tabla principal (ver siguiente apartado).
- Barra superior opcional: búsqueda por cliente/teléfono, contador de pendientes, botón **«Descargar CSV seleccionadas»**.

### 4.2 Tabla (similar a Pedidos, filtrada)

Columnas definidas para esta pantalla (versión simple):

- **Fecha**
- **Cliente**
- **Diseño**
- **Base**
- **Vector**

Definición de `Base` y `Vector`:

- Son **previews visuales** (miniatura o ícono con acceso a preview) para ubicar rápidamente la orden.
- No requieren metadata adicional en la tabla de envíos; el objetivo es orientar visualmente al operador.

Acciones por fila:

- Botón secundario **«Datos de envío»** (abre flujo de pegado/edición en dropdown/modal).
- Checkbox para selección y exportación CSV por lote.

Notas de implementación:

- Mantener el estilo visual de la tabla de `Pedidos` (mismo look & feel), pero con menos información visible.
- Los estados (fabricación/venta/envío) y validaciones de elegibilidad siguen aplicando en backend/hook, aunque no se muestren como columnas.
- Cada fila representa una **orden completa**; `Diseño`, `Base` y `Vector` se muestran como referencia visual resumida de la orden, no como edición por ítem.

Reutilizar componentes de tabla existentes si es posible (`OrdersTable` con props de columnas reducidas y datos prefiltrados, o un `EnviosCorreoTable` que comparta celdas/estilos).

### 4.3 Acción «Datos de envío» (botón secundario + menú)

Al hacer clic:

- **Dropdown o menú** con al menos:
  - **«Pegar datos del cliente»** — abre modal con textarea.
  - **«Editar manualmente»** — mismo formulario que el preview del parseo, sin pegar.
  - (Opcional) **«Ver dirección en BD»** — solo lectura para comparar.

### 4.4 Modal «Pegar datos del cliente»

1. Textarea multilínea (ejemplos del producto en placeholder).
2. Botón **«Interpretar»** que ejecuta el parser (ver §5).
3. **Preview editable** en formulario alineado a campos de `direcciones` + campos extra que Correo pide y no están en BD (p. ej. sucursal destino textual para matching).
4. Bloque **«Comparación con BD»**: mostrar fila actual de `direcciones` vs valores parseados (diff visual simple).
5. Selector explícito de tipo de envío: botón/toggle **«Sucursal»** o **«Domicilio»** (actualiza `ordenes.tipo_envio` y condiciona validaciones del formulario/CSV).
6. Antes de persistir en Supabase, mostrar **confirmación final**: «¿Confirmás que el parseo quedó correcto?» con resumen de campos clave.
7. Botones: **Cancelar**, **Confirmar y Guardar** (upsert `direcciones` + actualizar `ordenes.direccion_id` si aplica).

### 4.4.1 Regla adicional al guardar datos de envío

Al confirmar **Guardar en sistema**:

- Si el estado de venta de la orden/sellos corresponde a un estado previo (por ejemplo `Foto` / `Foto Enviada`), actualizar a **`Transferido`**.
- Si ya está en **`Transferido`**, no hacer cambios (idempotente).
- Esta transición se ejecuta junto con el guardado de dirección para evitar pasos manuales extra.

### 4.5 Selección y exportación CSV

- Botón principal **«Generar CSV Correo Argentino»**.
- Al hacer click, incluir **todas las órdenes con datos de envío cargados y estado de envío distinto de `Etiqueta Lista`** (normalmente en `Sin envio`).
- Excluir automáticamente del CSV las órdenes que ya estén en `Etiqueta Lista` (para no duplicar etiquetas).
- Luego de generar el CSV correctamente, actualizar `ordenes.estado_envio` a **`Etiqueta Lista`** para todas las órdenes incluidas.
- Opción de **descargar** el archivo; nombre sugerido: `carga_correo_YYYYMMDD.csv`.

### 4.6 Post-condición opcional (definir con negocio)

Tras guardar datos y/o generar CSV:

- ¿Se actualiza `ordenes.estado_envio` a **«Hacer Etiqueta»** automáticamente o solo con un botón explícito «Marcar listo para etiqueta»?

Documentar la decisión en código (comentario breve cerca del servicio).

---

## 5. Parseo del texto pegado (matching inteligente)

### 5.1 Salida estructurada objetivo

Objeto intermedio alineado a:

- **BD:** `direcciones.nombre`, `apellido`, `provincia`, `localidad`, `domicilio`, `codigo_postal`, `telefono`, y email si se decide guardar en `clientes.mail` o campo extendido (hoy `direcciones` no tiene mail en `types.ts` — **valorar** ampliar tabla o siempre tomar mail del cliente).

- **CSV Correo:** campos de plantilla (`destino_nombre`, `provincia_destino`, `localidad_destino` vs `sucursal_destino`, `calle_destino`, `altura_destino`, `codpostal_destino`, `destino_email`, códigos de área y número de celular, `numero_orden`, etc.).

### 5.2 Estrategia en dos capas (recomendada)

1. **Heurística en cliente o Edge Function (sin costo):** regex y líneas clave (`Provincia:`, `E-mail:`, `Celular:`, `Nombre con el que recibe`, bloques separados por líneas en blanco). Normalizar tildes y mayúsculas como en `generar_carga_correo.py` (`normalizar_nombre`).
2. **Refinamiento opcional con LLM** (misma idea que `app.py`): solo si la heurística deja campos ambiguos; nunca enviar datos personales sin política clara; usar API key en servidor.

### 5.3 Casos de ejemplo del producto

- Texto **sin etiquetas** (solo líneas sueltas): inferir orden → línea 1 nombre, línea provincia/localidad mezclada con sucursal, email por patrón, teléfono por dígitos.
- Texto **con etiquetas** (`Provincia:`, `Localidad:`, `Sucursal:`): mapeo directo.
- **Sucursal vs domicilio:** si hay «Sucursal X» y no hay calle/altura claras, modo envío a sucursal: rellenar `sucursal_destino` para CSV y dejar `calle_destino` vacío según reglas de la plantilla (como en la herramienta Python).

### 5.4 Matching con tabla `direcciones`

- Cargar direcciones del `cliente_id` de la orden (activa primero).
- Comparar por similitud de strings (provincia/localidad normalizada) y por teléfono/email si existen.
- Mostrar al usuario: **«Coincide con dirección guardada»** / **«Conflicto: el cliente cambió localidad»** para reducir errores.

---

## 6. Integración con `correo arg auto`

| Qué reutilizar | Cómo |
|----------------|------|
| Lista de columnas CSV | Copiar constantes `CAMPOS` / `VALORES_DEFECTO` a módulo TS compartido o generar desde un único JSON en repo. |
| CSV de sucursales | Incluir en `public/` o cargar como asset versionado; lógica `buscar_sucursal` / códigos de provincia portar a TS. |
| Normalización | Portar `normalizar_nombre`, `ABREVIACIONES`, `CODIGOS_PROVINCIAS`. |
| OpenAI | **No** copiar claves; usar env en backend si se mantiene el flujo con LLM. |

Meta: **un solo flujo** dentro de la app (React + servicio Supabase o Edge Function) que produzca el mismo CSV que hoy genera Streamlit.

---

## 7. Seguridad y permisos

- Operaciones de escritura en `direcciones` y `ordenes` deben respetar **RLS** de Supabase y usuario autenticado (misma convención que `orders.service.ts`).
- Si se añade Edge Function para parseo con LLM, autenticación con **service role** solo en servidor, nunca en el bundle del cliente.

---

## 8. Guía de desarrollo — tareas (orden sugerido)

Cada tarea está pensada para ser un **prompt o ticket** autocontenido para Cursor u otro desarrollador.

### Fase A — Navegación y página vacía

1. **Añadir ruta y entrada en sidebar**  
   - Agregar ítem «Envíos» o «Correo Argentino» en `sidebarItems` (icono p. ej. `Truck` de `lucide-react`).  
   - Registrar ruta protegida `/envios` (o `/envios/correo`) en `App.tsx`.  
   - Crear `src/app/envios/index.tsx` con layout base (Sidebar + título).

### Fase B — Datos y filtro

2. **Definir función de elegibilidad de órdenes**  
   - En `orders.service.ts` (o nuevo `envios.service.ts`), implementar consulta Supabase que traiga órdenes con joins a `clientes`, `sellos`, y opcionalmente `direcciones`, aplicando filtros de §3.  
   - Consolidar información por `orden_id` para que todo el flujo sea 1 envío por orden.
   - Incluir tests manuales con 2–3 órdenes de ejemplo (Hecho + Foto + Sin envio).

3. **Hook o extensión de `useOrders`**  
   - `useEnviosPendientesCorreo()` que llame al servicio nuevo y exponga `loading` / `error` / `refetch`.  
   - Suscribirse a cambios en `ordenes` y `sellos` vía realtime si ya se usa en `useOrders`.

### Fase C — Tabla UI

4. **Componente `EnviosCorreoTable`**  
   - Clonar estética de la tabla de `Pedidos` y mostrar únicamente columnas: Fecha, Cliente, Diseño, Base y Vector.  
   - Datos desde el hook; estados de carga y vacío («No hay órdenes pendientes»).  
   - Opcional: persistencia de vista con `useTableViewPersistence` clave `envios-correo`.

5. **Selección múltiple y barra de acciones**  
   - Mantener selección opcional en UI solo para revisión.
   - El botón **Generar CSV** toma automáticamente las órdenes elegibles (no `Etiqueta Lista`) y no depende de selección manual obligatoria.

### Fase D — Parser y formulario

6. **Módulo `parseClienteEnvioText` (TS)**  
   - Entrada: string; salida: objeto tipado + lista de «advertencias» (campos no detectados).  
   - Cubrir los tres estilos de ejemplo del producto (§5.3).  
   - Tests unitarios con strings fijos.

7. **Utilidades de normalización portadas desde Python**  
   - `normalizarNombre`, mapa provincias, matching sucursal leyendo el CSV empaquetado.

8. **Modal de pegado + preview**  
   - UI según §4.4; formulario controlado; validación (email, CP numérico, teléfono).
   - Incluir selector/toggle `Sucursal` / `Domicilio`.
   - Incluir paso de confirmación final del parseo antes de guardar en Supabase.

### Fase E — Persistencia

9. **Servicio `upsertDireccionEnvio`**  
   - Actualizar o insertar en `direcciones` (y `activa`); asignar `ordenes.direccion_id`.  
   - Si el mail solo vive en `clientes`, actualizar `clientes.mail` cuando el usuario confirme.  
   - En la misma transacción/lógica de guardado, setear estado de venta en `Transferido` **solo si aún no lo estaba**.

10. **(Opcional) Migración SQL**  
    - Solo si se acuerda guardar email en `direcciones` u otro campo; si no, documentar que el mail va al CSV desde `clientes`.

### Fase F — Export CSV

11. **Generador CSV en TS**  
    - Dada una lista de órdenes con datos resueltos, producir blob CSV idéntico en columnas a la plantilla de Correo.  
    - Reutilizar defaults de `VALORES_DEFECTO` del proyecto Python.

12. **Acción «Descargar»**  
    - Encadenar validación → generar → `download` en navegador; toast de éxito/error.
    - Tras éxito, actualizar estado de envío de las órdenes exportadas a `Etiqueta Lista`.

### Fase G — Pulido y negocio

13. **Transición de `estado_envio`**  
    - Implementar según decisión de §4.6 (automática o botón manual).

14. **Accesibilidad y i18n menor**  
    - Labels en español; foco en modal; tecla Escape cierra.

15. **Documentación interna breve**  
    - Comentario en README o en este archivo: enlace a ruta, criterios de filtro, y variable de entorno si hay LLM.

---

## 9. Criterios de aceptación (checklist)

- [ ] La nueva página aparece en la barra lateral y requiere login.  
- [ ] Solo se listan órdenes que cumplen los filtros acordados (§3).  
- [ ] El flujo opera estrictamente por orden (1 registro de envío por `orden_id`), no por ítem.
- [ ] Pegar texto del cliente rellena un formulario revisable; guardar actualiza BD de forma observable (recarga o realtime).  
- [ ] Antes de guardar en Supabase existe confirmación explícita del parseo.
- [ ] El formulario permite elegir claramente `Sucursal` o `Domicilio` y guarda ese tipo de envío.
- [ ] Al guardar datos de envío, el estado de venta pasa a `Transferido` cuando corresponde; si ya estaba en `Transferido`, permanece igual.  
- [ ] El CSV generado abre en Excel/LibreOffice y coincide con las columnas esperadas por Correo Argentino.  
- [ ] El botón de CSV incluye solo órdenes no etiquetadas y, después de exportar, esas órdenes pasan a `Etiqueta Lista`.
- [ ] No hay secretos de API en el frontend; archivos Python históricos no se empeoran.  
- [ ] Flujo probado con al menos un caso domicilio y un caso sucursal.

---

## 10. Decisiones cerradas de negocio

- Regla de venta para esta vista: basarse en `ordenes.estado_orden`.
- El `tipo_envio` no condiciona la visibilidad en esta subpágina; se filtra por estados definidos.
- El envío se gestiona por orden: **1 envío por `orden_id`**.
- No se requiere historial ni auditoría de textos pegados en esta primera versión.

---

*Última actualización: reglas de negocio principales cerradas para implementación.*
