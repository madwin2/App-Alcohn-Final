# 12. Precios

[← Volver al índice](README.md)

Es la **lista de precios oficial** de Alcohn. La app la usa para **sugerir el valor** al cargar un pedido o agregar un ítem, y para cotizar en el generador de mockups. Se llega desde **Precios** en el menú (sección de administración).

Todos pueden **ver** la lista, pero **solo Julián puede modificarla**.

## Cómo se leen los precios

- Todos los precios cargados son **con transferencia**.
- El precio con **Link (+15 %)** (tarjeta o link de pago) se calcula solo: transferencia × 1,15, redondeado.

## Secciones

| Sección | Qué tiene |
|---|---|
| **Sellos por medida — 4 grupos** | Grupos de sellos (chicos, medianos, grandes, XL) con su precio de **Transferencia** y **Link (+15 %)**. Cada medida (ancho × largo) pertenece a un grupo |
| **Otras medidas de sellos** | Precios fijos para medidas puntuales. **Tienen prioridad** sobre el grupo |
| **Sellos redondos** | Por **Tamaño**, con precio **Simple**, **Intermedio** o **Complejo** según el diseño |
| **Abecedarios** | Por **Categoría** y **Detalle** |
| **Accesorios** | Soldador, base remachadora y mango de golpe |

## Cómo cotiza la app un sello rectangular

1. Si la medida tiene un precio en **Otras medidas de sellos**, usa ese.
2. Si no, busca a qué **grupo** pertenece la medida y usa el precio del grupo.
3. Si la medida no está en ningún lado, no sugiere precio: hay que cotizarlo a mano.

## Editar

Cambiá el valor en la tabla. **Se guarda solo** al segundo de dejar de escribir (**Guardar ahora** fuerza el guardado). Los cambios se usan desde ese momento en las cotizaciones nuevas; los pedidos ya cargados no cambian.
