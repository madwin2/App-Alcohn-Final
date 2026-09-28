# Glosario de Alcohn AI / Alcohn

Términos propios encontrados en el código. **Definición incompleta** = el código no permite saber el significado exacto (hay pregunta abierta).

| Término | Definición | Contexto / relación | Ambigüedades |
|---|---|---|---|
| **Alcohn AI** | Nombre de la app interna. | Paquete npm `pedidos-app`. | "Icon" en documentos viejos = error de transcripción de "Alcohn". |
| **Cyprea** | Marca paralela de Alcohn de sellos de lacre. | Economía/Gastos ("inversiones en Cyprea"). | — |
| **Alcohn / Alcohn CNC** | La empresa; fabrica sellos de bronce por CNC. | Dominio `alcohncnc.com`. | — |
| **Pedido / Orden** | Compra de un cliente (`ordenes`). | Tiene ítems, envío, estado de venta. | "Número de pedido" = id de la orden. |
| **Sello / ítem** | Línea de un pedido (`sellos`). | Puede ser sello o accesorio (`item_type`). | La tabla se llama "sellos" aunque tenga soldadores. |
| **Diseño** | Nombre del ítem (`diseno`) y, por extensión, el logo/arte del cliente. | "Diseños" en la hoja del programa = sellos. | — |
| **Tipo (de sello)** | `Clasico`, `3mm`, `Lacre`, `Alimento`, `ABC`. | Define trayectorias en Aspire. | Significado físico: **incompleta** (Q-GEN-003). |
| **ABC / Abecedario** | Juego de letras (mayúsculas/minúsculas, letras extra, caracteres especiales) para marcar. | `item_type='ABECEDARIO'` o `tipo='ABC'`; máquina `ABC`; hoja de fabricación PDF. | Fabricación: **incompleta** (Q-PROD-005). |
| **Soldador (adaptado)** | Soldador eléctrico 100 W/200 W que se vende para calentar el sello. "Adaptado" = modificado en el taller. | Stock `SOLDADOR_ADAPTADO_*`. | "Adaptar": **incompleta** (Q-STK-002). |
| **Mango de golpe / Base remachadora** | Accesorios vendidos. | `item_type`. | — |
| **Seña** | Pago parcial inicial. | `senia`, `senia_total`. | Cómo se cobra: Q-VEN-001. |
| **Restante** | Lo que falta pagar: valor − seña (+ costo de envío a nivel orden). | Triggers. | — |
| **Señado** | Estado de venta: solo pagó la seña. | — | — |
| **Foto / Foto enviada** | Estado de venta: se envió la foto del sello terminado y se espera el pago. | Se entra al subir `foto_sello`. | — |
| **Transferido** | Estado de venta: pagó el total. | Habilita el envío. | Alcance exacto: Q-VEN-003. |
| **Deudor** | No pagó 10 días después de la foto. | Cron diario. | — |
| **Estado de fabricación** | `Sin Hacer`, `Programado`, `Haciendo`, `Hecho`, `Rehacer`, `Retocar`, `Verificar`, (`Prioridad`). | — | Retocar/Verificar: **incompleta** (Q-PROD-002). |
| **Prioridad / prioritario** | Flag `es_prioritario`: fabricar antes. | Automático al rehacer. | Antes era un estado. |
| **Rehacer** | Volver a fabricar un ítem, con motivo. | RPC `registrar_rehacer`. | — |
| **Fecha límite** | Fecha comprometida del ítem. | Avisos de vencimiento. | ¿Entrega, despacho o fabricación? Q-PED-004. |
| **Archivo base** | Imagen original del cliente. | Bucket `base`. | — |
| **Base mejorada** | Versión retocada del base (pegada del portapapeles), sin borrar el original. | `archivo_base_mejorado`. | — |
| **Vector / vectorizado** | Archivo vectorial (ideal SVG) para mecanizar. | `archivo_vector_preview`. | El campo se llama "preview" pero guarda el vector (o el preview de un EPS). |
| **Hoja (vectorización)** | Imagen compuesta con varios bases para vectorizar en una sola llamada. | Ahorra créditos. | Distinto de "hoja" de programas. |
| **Créditos** | Unidad de cobro de Vectorizer.AI. | — | — |
| **Medida pedida / de fabricación** | Tamaño acordado (cm) vs tamaño real del vector confirmado (mm). | Largo × corto. | `ancho` = lado mayor. |
| **Tope (de planchuela)** | Máximo útil del lado menor por planchuela (11,5/18/24/36,5 mm). | Medida de fabricación. | — |
| **Planchuela** | Barra de bronce del ancho 12/19/25/38/63 mm de donde se mecanizan los sellos. | Se elige por lado menor. | 19≈20, 38≈40 según contexto. |
| **P12, P19, P25…** | Abreviatura de planchuela. | UI de Programas. | — |
| **Pérdida de corte** | Largo extra por sello (0,8 cm) al cortarlo de la planchuela. | Material y costo. | — |
| **Largo máximo** | Largo de planchuela usable por máquina (C 400, G/XL 250 mm). | Validación de programas. | — |
| **Máquina C / G / XL** | CNC "Chica", "Grande", "XL". | Programas. | — |
| **Programa** | Lote de sellos para una corrida de CNC en una máquina. | `programa`. | En UI nueva: "hoja". |
| **Hoja (programas) / bolsillo / tarjetero** | Metáforas de la UI del tablero de Programas: cada programa es una hoja en el bolsillo de su máquina. | Changelog #14. | — |
| **Listo para Fabricar** | Etiqueta del estado `LISTO` del programa. | — | — |
| **Terminados** | Carpeta de programas finalizados; soltar un programa ahí = todos sus sellos Hecho. | — | — |
| **Dirty / desactualizado** | El programa cambió después del último paquete. | — | — |
| **Candado** | Bloqueo manual del programa. | — | — |
| **Paquete** | ZIP con vectores + `manifest.lua` + `.crv3d` base. | — | — |
| **Manifest** | Descripción del programa para el gadget. | Lua/JSON. | — |
| **Aspire** | Vectric Aspire (software CAM); también el archivo `.crv3d` y el estado `estado_aspire`. | — | Tres usos del mismo nombre. |
| **Aspire C/G/XL (Check)** | Estado del sello: está programado en Aspire en esa máquina (Check = verificado). | — | "Check": **incompleta** (Q-PROD-003). |
| **Gadget** | Script Lua dentro de Aspire que arma el programa. | `ArmarPrograma_*.lua`. | — |
| **Clave de instalación** | Secreto que el gadget usa para listar programas. | `PROGRAMA_SYNC_KEY`. | — |
| **Actualizar / Rehacer desde cero / Solo recalcular** | Modos del gadget. | — | "Rehacer" del gadget ≠ Rehacer de un sello. |
| **Paso 3** | Etapa del gadget que crea rectángulos de planchuela y recalcula trayectorias. | — | — |
| **Trayectorias / toolpaths** | Recorridos de fresa generados en Aspire. | No se suben a Alcohn AI. | — |
| **No importado** | Sello que el gadget no pudo meter en Aspire (típicamente EPS). | `no_importado_motivo`. | — |
| **Sin material** | Sello sacado del programa en Aspire porque no alcanzó la planchuela. | `motivo_salida_programa`. | — |
| **Empresa de envío** | Andreani, Correo Argentino, Vía Cargo, Retiro en persona (y "Retiro"/"Otro"). | `empresa_envio`. | — |
| **Domicilio / Sucursal** | Tipo de entrega. | `tipo_envio`. | — |
| **Padrón** | Tabla oficial de sucursales/localidades de MiCorreo. | `correo_sucursales`. | — |
| **MiCorreo** | Portal/servicio de Correo Argentino para envíos. | Worker Playwright. | — |
| **Hacer Etiqueta / Etiqueta Lista / Error de Etiqueta** | Estados de envío previos al despacho. | — | — |
| **Despachado** | Estado de envío. | — | Difiere por empresa (Q-ENV-001). |
| **Seguimiento / Seguimiento Enviado** | Número de tracking / estado final: el cliente recibió el tracking por WhatsApp. | — | — |
| **Link Andreani / pool** | Link de Andreani Pymes que el cliente completa y paga; conjunto de links disponibles. | 30 h de vida. | — |
| **Huérfano / errónea** | Etiqueta Andreani sin pedido / descartada. | — | — |
| **Túnel de la oficina** | Salida de internet del worker Andreani a través de la PC de la oficina. | — | — |
| **Bot / webhook** | Servidor externo que manda WhatsApp; llamada HTTP que lo dispara. | — | — |
| **Mockup** | Imagen de cómo se vería el logo marcado en cuero/madera. | Generador de Mockups. | — |
| **Generador de muestras** | Versión web del generador de mockups. | `origen='web'`. | — |
| **Potencial** | Persona que hizo un mockup o empezó a pagar y no compró. | Comercial Web. | — |
| **Caliente / tibio / frío** | Prioridad comercial de un potencial. | — | — |
| **Contacto comercial** | WhatsApp automático a un potencial web. | Cron. | — |
| **Recompra / seguimiento de cliente** | WhatsApp a clientes de una sola compra a los 2 meses. | Cron. | — |
| **Exclusión** | Marca para que un cliente/mockup/orden no reciba automatizaciones. | — | — |
| **Precio transferencia / precio link** | Precio de lista / +15 % para pago con link o tarjeta. | — | — |
| **Grupo (chicos, medianos, grandes, xl)** | Grupos de medidas para precio. | Precios. | — |
| **Amortización de fresa** | Costo fijo por ítem por desgaste de la herramienta. | Costos. | — |
| **Bronce consumo** | Registro de bronce usado por sello al terminarlo. | — | — |
| **Cajas** | Saldos de dinero por cuenta (efectivo, Mercado Pago, bancos). | Economía. | — |
| **Área** | produccion / logistica / ventas: solo para notificaciones. | `usuario_area`. | No es un permiso. |
| **Tanda** | Grupo de contenido en el Inicio que se recorre con scroll. | UI. | — |
| **FBTEST** | Cuenta para la revisión de Meta. | — | — |
