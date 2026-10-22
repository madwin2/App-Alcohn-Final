# Sello tipo Personalizado (mecanizado a medida)

> Pedido por el usuario el 2026-10-22. Código: `src/lib/pedidos/mecanizadoPersonalizado.ts` (+ test), `src/components/pedidos/MecanizadoPersonalizadoDialog.tsx`. Migración: `migration_sello_tipo_personalizado.sql` (aplicada en Supabase con autorización del usuario el 2026-10-22).

## Qué es

✅ Un sexto tipo de sello, `Personalizado` (`PERSONALIZADO` en la app), para sellos cuyo mecanizado no es el de una receta fija (Clásico, 3mm, Alimento). Al elegirlo se abre un modal con:

| Campo | Valores | Trayectoria de la base C (✅ fixture `aspire-c-app.json`) |
|---|---|---|
| Rosca | M6 · M5 · M4 · Sin rosca | «0 Taladrado» + «0 Roscado» |
| Profundidad exterior | mm (vacío = como Clásico) | «1 Cajeado 6MM» (fresa de 6) |
| Profundidad de grabado | mm, **una sola** para las dos cónicas | «2 Cajeado 1MM» y «3 Perfilado 0.5MM» (cónicas de 1 mm y 0,6 mm configurada) |
| Perfilado recto fresa 1 mm | sí / no | No existe en la base actual |

✅ El modal arranca con los valores de Clásico: rosca M6, grabado 1,7 mm, sin perfilado recto (usuario, 2026-10-22). La profundidad exterior de Clásico no está documentada en la app, así que el campo queda vacío y significa «igual que Clásico» ([Q-PROG-025](../../14-open-questions/programas.md#q-prog-025)). Profundidades válidas: más de 0 y hasta 10 mm. Esto valida errores de tipeo; no es una regla del taller.

## Dónde se elige

- Columna **Tipo** de la tabla de Pedidos: opción «Personalizado» y, si el sello ya es Personalizado, «Editar personalización…». La fila resumen de un pedido con varios sellos aplica la configuración a **todos sus sellos** (igual que el cambio de tipo). La fila expandida la aplica solo a ese sello. Al pasar el mouse sobre el ícono se ve el resumen.
- **Nuevo pedido** (paso 2) y **Agregar ítem**: opción «Personalizado» + enlace «… · Editar» debajo del selector.
- Cancelar el modal deja el tipo anterior.

## Datos

✅ `sellos.tipo = 'Personalizado'`, permitido por el CHECK `sellos_tipo_check` desde el 2026-10-22. La configuración va en `sellos.item_config.mecanizado`:

```json
{ "rosca": "M6", "exteriorDepthMm": null, "grabadoDepthMm": 1.7, "perfiladoRecto1mm": false }
```

✅ Al editar un sello desde la tabla, `updateOrder` **combina** `item_config` con lo que ya había (la tienda web y los abecedarios guardan ahí otros datos). Si después se cambia a otro tipo, `mecanizado` queda guardado pero se ignora; si se vuelve a Personalizado, el modal lo recupera.

**Decisión (usuario, 2026-10-22):** usar el CHECK + `item_config` en vez de columnas nuevas. Es una migración mínima en una base compartida con la tienda web. Como contra, no se puede filtrar en SQL por rosca o profundidad sin leer el JSON.

## Programas

✅ `getPrograms` lee `mecanizado` para los sellos Personalizado (`ProgramStamp.mecanizado`). En la mesa de armado, la cola muestra el tipo «Personalizado» y el detalle del sello muestra la configuración con el aviso «El gadget todavía no lo aplica solo: ajustá esas trayectorias en Aspire».

🔶 La mesa ubica estos sellos con la receta **Clásico** (como cualquier tipo sin receta, `mesa.ts`), así que las capas y trayectorias de Aspire son las de Clásico hasta que Fede las ajuste.

### Pendiente: que el gadget lo aplique solo

El usuario pidió que el gadget aplique la configuración automáticamente. Todavía no está hecho porque faltan datos de Aspire y una prueba en la PC de la CNC ([Q-PROG-025](../../14-open-questions/programas.md#q-prog-025)):

1. **Rosca M5/M4**: la base solo tiene taladrado y roscado M6 (broca Ø5 a 6,5 mm, roscado Ø4,8 a 5 mm, Q-PROG-024). Hacen falta plantillas nativas de taladrado y roscado para M5 y M4 (otra broca, otro paso). «Sin rosca» = no seleccionar el sello en esas dos trayectorias.
2. **Profundidades**: las plantillas nativas guardan `_ppdCutDepth` como número de 8 bytes (`nativeTemplate.ts` ya lo lee). Una opción es que la app genere una copia de la plantilla con la profundidad del sello y una capa propia (p. ej. `VECTOR PERS <id>`). Cambiar el nombre de capa cambia el largo del archivo; hay que comprobar en Aspire 10.514 que lo acepta. La otra opción es crear la trayectoria con el SDK del gadget.
3. **Perfilado recto 1 mm**: hace falta una plantilla nueva (herramienta, profundidad, Profile Outside/On, etapa).
4. El flujo de preparación (gadget 3.2) todavía no está instalado como gadget operativo ([gadget-aspire](../programas/gadget-aspire.md)).
