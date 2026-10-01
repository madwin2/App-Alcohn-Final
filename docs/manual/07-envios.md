# 7. Envíos

[← Volver al índice](README.md)

Es la cola de trabajo de Logística después de fabricar: conseguir los datos de envío, generar la etiqueta y dejar el pedido listo para despachar. Se llega desde **Envíos** en el menú.

## Contenido

- [Qué pedidos aparecen](#qué-pedidos-aparecen)
- [Elegir el flujo](#elegir-el-flujo)
- [Correo Argentino](#correo-argentino)
- [Andreani](#andreani)
- [Vía Cargo y retiro en persona](#vía-cargo-y-retiro-en-persona)
- [Historial](#historial)

## Qué pedidos aparecen

Un pedido aparece en Envíos cuando:

- **Todos** sus ítems están **Hecho**.
- No es **Retiro en Persona**.
- No está en **Deudor**.
- Todavía no llegó a **Seguimiento Enviado**.

Un pedido **sin transportista** se trata como **Correo Argentino**.

## Elegir el flujo

Al entrar, la pantalla pide **elegir un flujo**, para no abrir todo junto:

| Flujo | Para qué |
|---|---|
| **Correo** | Datos de envío, MiCorreo y CSV de respaldo |
| **Andreani** | Links, etiquetas del portal y PDF de despacho |
| **Via Cargo** | Pedidos listos para despachar por Vía Cargo |
| **Todos** | Las tres colas juntas, para un pantallazo |
| **Historial** | Pedidos ya despachados |

Arriba siempre podés cambiar de flujo o volver a elegir.

## Correo Argentino

Tiene dos secciones:

| Sección | Qué pedidos | Qué hacer |
|---|---|---|
| **Pendientes de cargar datos** | Todavía no tienen dirección. Solo aparecen los que tienen la venta en **Foto Enviada** o **Transferido** | Pedirle los datos al cliente y cargarlos |
| **Con datos de envío** | Ya tienen dirección | Controlar que la etiqueta se genere bien |

### Cargar los datos de envío

⚠️ Los datos de envío se cargan **solo después de que el cliente pagó**. Al guardarlos, la venta pasa sola a **Transferido**.

1. En la fila del pedido, elegí **Dom.** (domicilio) o **Suc.** (sucursal). Sin esto no deja cargar datos.
2. Tocá **Cargar** (**Cargar datos de envío**).
3. **Pegá el mensaje del cliente** en **Texto del cliente** y tocá **Interpretar texto**. La app separa nombre, dirección, provincia, código postal, teléfono y email. Si no los reconoce bien, probá con la opción de IA.
4. Revisá y corregí cada campo:
   - **Nombre completo**, **Teléfono**, **Email**.
   - **Provincia** y **Localidad**: hay que **elegirlas del desplegable**. Son las del padrón oficial de Correo Argentino; no se acepta texto libre, porque si no coinciden exacto la etiqueta falla.
   - Domicilio: **Domicilio (calle y número)** y **Código postal**.
   - Sucursal: **Dirección de la sucursal** del desplegable, o el **Código de sucursal (manual)** de MiCorreo si lo sabés.
5. Tocá **Continuar con confirmación**. La app controla que los datos sirvan para la etiqueta.
6. Tocá **Confirmar y subir etiqueta**.

🤖 Al confirmar:
- Se guarda la dirección y queda registrado quién la cargó (si después se edita, se marca **Editado**).
- La venta pasa a **Transferido**.
- La etiqueta **se sube a MiCorreo y se paga sola**, en segundo plano. Vas a ver **MiCorreo: subiendo la etiqueta en segundo plano. Podés seguir usando la app.**
- Si el cliente no tenía email, se le guarda.

⚠️ La subida a MiCorreo corre **en la pestaña del navegador**. No cierres la pestaña de la app hasta que termine.

### Controlar las etiquetas

En **Con datos de envío**, la columna **Etiqueta** muestra el estado:

| Estado | Qué significa | Qué hacer |
|---|---|---|
| Subiendo | Se está subiendo a MiCorreo | Esperar |
| **Generada** | La etiqueta se generó pero el pago quedó pendiente | Pagarla en MiCorreo |
| **Pagada** | Lista | Nada |
| **Error** | MiCorreo rechazó los datos (código postal, localidad, sucursal, provincia, teléfono, email o pago) | Tocá el ícono para ver el error, corregí con **Editar** y volvé a confirmar |

El estado de envío del pedido acompaña: **Hacer Etiqueta** → **Etiqueta Lista** o **Error de Etiqueta**.

### Otras acciones

- **Copiar número de WhatsApp**: para escribirle al cliente.
- **Editar**: corregir datos (se guarda una dirección nueva; la anterior queda en el historial).
- **Quitar datos de envío**: el pedido vuelve a **Pendientes de cargar datos**.
- **CSV** (respaldo): baja un archivo para cargar a mano en MiCorreo con los pedidos en **Hacer Etiqueta**. Los que no se pueden exportar pasan a **Error de Etiqueta** y aparecen en **Órdenes excluidas del último CSV**.
- **Todos → Sin envío**: vuelve **todos** los pedidos de la tabla a **Sin envío**. Solo para empezar de nuevo si hubo un error con el CSV. ⚠️ Pide confirmación; afecta a toda la tabla.

⚠️ Si cambiás los datos de un pedido con la etiqueta **ya pagada**, la etiqueta vieja **no se anula sola**: cancelala en MiCorreo (reintegran el dinero). Logística recibe un aviso.

### Pedidos de la tienda web

Si el cliente cargó su dirección en la web, el pedido aparece como **Web — sin confirmar**. Tocá **Confirmar** (**Confirmar datos de envío (web)**), revisá lo que cargó el cliente, corregí si hace falta y confirmá.

### Despachar

Cuando las etiquetas están pagadas:

1. Bajá el PDF de etiquetas desde el portal de MiCorreo.
2. Justo antes de ir al correo, cargalo en [Pedidos → Subir seguimientos](03-pedidos.md#cargar-los-seguimientos-antes-de-ir-al-correo).
3. Imprimí el PDF que genera la app en la Zebra, pegá las etiquetas y llevá los paquetes.

## Andreani

Con Andreani **el cliente completa sus datos y paga el envío** en la página de Andreani, usando un link que le manda la app.

### 1. Pool Andreani: tener links disponibles

La tarjeta **Pool Andreani** muestra cuántos links hay **disp.** (disponibles), **asig.** (asignados) y **desc.** (descartados).

- **Generar más**: crea links nuevos en el portal de Andreani. ⚠️ Necesita que el **túnel de la PC de la oficina** esté abierto (si no, falla). El progreso se ve abajo.
- **Pegar links**: si generaste links a mano en el portal, pegalos (uno por línea) y tocá **Agregar**.

Cada link vale **30 horas**; los vencidos se descartan solos.

⚠️ Generá los links **antes de mandar las fotos**. La app asigna un link a cada pedido de Andreani cuando se sube la foto del último ítem y lo manda en el WhatsApp. Si no hay links, el mensaje sale sin link. [Subir Fotos](03-pedidos.md#subir-fotos-de-sellos-terminados) avisa si faltan.

### 2. Etiquetas Andreani

Cuando los clientes completan y pagan, sus etiquetas aparecen en el portal. En el panel **Etiquetas Andreani**:

| Botón | Qué hace |
|---|---|
| **Traer etiquetas** | Baja del portal las etiquetas nuevas (las pendientes de ingreso), lee el seguimiento y el destinatario, y las empareja con los pedidos por nombre. Si alguna que ya tenías **ya no** está pendiente de ingreso (la llevaron a Andreani), la saca de la lista activa y el pedido pasa a **Despachado** (el cliente recibe el seguimiento) |
| **Cargar PDF** | Subir etiquetas bajadas a mano del portal |
| **Actualizar seguimientos** | Revisa en el portal si Andreani ya recibió los paquetes. Los que ya no están "Pendiente de ingreso" pasan a **Despachado**. Sirve si no corriste Traer etiquetas después del ingreso |
| **Descargar todas (N)** | Une en un PDF (hojas 100 × 152 mm) todas las etiquetas listas para despachar |

Las etiquetas se ven en tres grupos:

- **Asignadas**: emparejadas con un pedido. Muestran destinatario, seguimiento, pedido, diseño, venta y si ya bajaste el PDF.
- **Huérfanos**: no se pudieron emparejar. Elegí el pedido (**Elegir pedido…**) y tocá **Asignar**. El pedido pasa a **Etiqueta Lista** (la venta no cambia).
- **Erróneas**: duplicadas, mal generadas o que no vas a usar. No vuelven a aparecer en Huérfanos. Si más adelante corresponden a un pedido, se asignan desde acá.

Acciones sobre una etiqueta (menú **Más acciones**): **Liberar a huérfano**, **Marcar como errónea**, **Devolver a huérfanos**, **Eliminar PDF**. Al liberar una etiqueta, elegís qué hacer con el pedido: **Sin envío** (queda disponible para otra etiqueta) o **Seguimiento enviado** (cierra el envío, con número manual o en blanco).

### 3. Cobrar y descargar

⚠️ El PDF de una etiqueta **solo se puede bajar cuando la venta está Transferido** (el cliente pagó el restante del sello). Cambiá la venta desde el panel (Pendiente / Transferido) cuando pague.

Después: **Descargar todas**, imprimir, pegar y entregar a Andreani.

🤖 Cuando Andreani ya recibió el paquete (lo detecta **Traer etiquetas** o **Actualizar seguimientos**), el pedido pasa a **Despachado**, al cliente le llega el seguimiento y queda en **Seguimiento Enviado**.

## Vía Cargo y retiro en persona

- **Vía Cargo**: la sección lista los pedidos listos para despachar por Vía Cargo. No hay automatización: se mandan como encomienda copiando los datos a mano, y el estado se cambia a mano en Pedidos.
- **Retiro en Persona**: no aparece en Envíos. Cuando el cliente lo retira, marcá el estado a mano en Pedidos.

## Historial

**Historial** muestra los pedidos ya despachados (**Seguimiento Enviado**), del más reciente al más viejo, con fecha de creación, cliente, diseño, **N° seguimiento**, **Empresa**, fecha de envío del seguimiento, estado del **WhatsApp** e ítems.

- Buscador: **Buscar por cliente, diseño o WhatsApp...**
- Clic en un pedido: **Detalle del envío** con la dirección, el contenido, el **Historial de estados** y las **Descargas de PDF** (quién bajó o reimprimió la etiqueta y cuándo).
- En Andreani, **Descargar PDF** baja otra vez la etiqueta guardada.
