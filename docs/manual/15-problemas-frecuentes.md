# 15. Problemas frecuentes

[← Volver al índice](README.md)

Qué hacer cuando algo no sale como se espera. Si el problema no está acá, avisale a Julián con una captura.

## Entrar a la app

| Problema | Qué pasa | Qué hacer |
|---|---|---|
| "Tu cuenta está pendiente de aprobación" | Te registraste pero todavía no te aprobaron | Avisale a Julián |
| Me olvidé la contraseña | La app no tiene recuperación de contraseña | Pedile a Julián que te la resetee |
| Aparece **Hay una actualización disponible** | La app cambió mientras la tenías abierta | Guardá lo que estabas haciendo y tocá **Actualizar ahora** |

## Pedidos

| Problema | Por qué pasa | Qué hacer |
|---|---|---|
| No encuentro un pedido | Por defecto se ven los últimos 6 meses y los no despachados | Activá **Toda la base** y escribí al menos 4 letras |
| No encuentro un pedido de la web | Los pedidos web sin pagar no aparecen en Pedidos | Buscalo en [Comercial Web → Pagos pendientes](10-comercial-web.md#confirmar-un-pago-de-la-web) |
| No puedo cambiar la **Venta** | Solo se habilita cuando el ítem está **Hecho** | Que Producción lo marque Hecho |
| No puedo cambiar el **Envío** | Solo se habilita cuando la venta está **Transferido** | Confirmá el pago primero |
| La fila está en rojo | A un sello le falta el archivo base o el vector | Subí el diseño |
| Al cliente le llegó dos veces la foto | Se reemplazó la foto por otra: cada foto nueva vuelve a mandar el mensaje | Evitá reemplazar fotos ya enviadas salvo que haga falta |
| No quiero que al cliente le llegue la confirmación | — | Al cargar el pedido, marcá **No enviar aviso de confirmación al cliente** |
| El cobro adicional de un rehacer no aparece en el restante | Es así: no se suma | Pedíselo al cliente aparte y marcalo **Cobrado** |
| El tipo **3MM** no aparece al cargar el pedido | El alta no lo ofrece | Cargalo como Clásico y cambiá la columna **Tipo** después |
| **Seguimiento y empresa no coinciden** | El número no corresponde a la empresa elegida | Cambiá la empresa o seguí sin cambiar si estás seguro |

## Fotos y Andreani

| Problema | Qué hacer |
|---|---|
| **Faltan links de Andreani** al subir fotos | Andá a [Envíos → Andreani](07-envios.md#1-pool-andreani-tener-links-disponibles), **Generar más**, y volvé a asignar. Las fotos quedan guardadas en la ventana |
| **Generar más** links falla | El túnel de la PC de la oficina tiene que estar abierto. Abrilo y probá de nuevo |
| No aparece el sello para asignar la foto | Solo aparecen sellos **Hecho**, con venta **Señado** y sin foto. Revisá el estado |
| No puedo bajar la etiqueta de Andreani | Solo se puede con la venta en **Transferido** |
| Una etiqueta de Andreani quedó en **Huérfanos** | No se pudo emparejar por nombre. Elegí el pedido y tocá **Asignar** |

## Envíos por Correo Argentino

| Problema | Qué hacer |
|---|---|
| No me deja cargar datos | Primero elegí **Dom.** o **Suc.** |
| "Provincia no válida" / "Localidad no válida" / "Sucursal no válida" | Elegí del desplegable (padrón de Correo). No se acepta texto libre |
| Etiqueta en **Error** | Mirá el error (ícono en la columna Etiqueta), corregí con **Editar** y volvé a confirmar |
| Etiqueta **Generada** pero no **Pagada** | El pago quedó pendiente en MiCorreo: pagala ahí |
| La etiqueta quedó "subiendo" para siempre | Probablemente se cerró la pestaña durante la subida. Volvé a confirmar los datos del pedido |
| Cambié la dirección con la etiqueta ya pagada | Cancelá la etiqueta vieja en MiCorreo (reintegran el dinero) |
| El pedido no aparece en Envíos | Tiene que tener **todos** los ítems Hecho, no ser Retiro en Persona ni Deudor. En **Pendientes de cargar datos** solo aparecen los que tienen venta **Foto Enviada** o **Transferido** |
| **Subir seguimientos** no emparejó un pedido | Elegilo a mano en **Sin match en pedidos**. Si el nombre del destinatario es distinto al del cliente, pasa seguido |

## Vectorización y Programas

| Problema | Qué hacer |
|---|---|
| Se perdió la revisión de vectores | En el mismo navegador debería recuperarse al volver a Vectorización. Si borraste datos del sitio o estás en otra PC, hay que volver a vectorizar (cuesta créditos) |
| **Sin saldo** de créditos | Avisale a Julián |
| **No entró: …** en la hoja del programa | El vector es EPS o no se pudo importar. Re-vectorizalo en SVG y corré el gadget en modo Actualizar |
| **No entra en esta máquina** | La planchuela de ese sello no la acepta esa máquina. Probá en otra |
| **Sin espacio** al usar Sugerir | Las planchuelas ya están llenas |
| Un sello rehecho no aparece en el panel Vectores | Error conocido: queda atado al programa viejo. Avisale a Julián |
| El programa volvió a **Borrador** | Se cambió algo después de llevarlo a Aspire. Corré el gadget en modo Actualizar |
| No puedo agregar ni sacar sellos de un programa | Está bloqueado (candado). **Desbloquear** |

## Stock

| Problema | Qué hacer |
|---|---|
| "Falta stock para este envío" | Se crearon tareas de reposición para los responsables. Cuando llegue la mercadería, cargala desde el Inicio |
| **Necesario (pendientes)** parece demasiado alto | Error conocido: cuenta pedidos viejos que ya se entregaron. Tomalo como referencia |
