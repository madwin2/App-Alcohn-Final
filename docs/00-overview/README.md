# Qué es Alcohn AI

> Nivel de certeza por sección indicado con ✅ (código) · 🔶 (inferencia) · ❓ (desconocido). Ver [convenciones](../_meta/convenciones.md).

## 1. Nombre

- La aplicación se llama **Alcohn AI** (`<title>` en `index.html`; paquete npm `pedidos-app`; repositorio "Alcohn Ai Nueva"). Confirmado por el equipo ([Q-GEN-001](../14-open-questions/general.md#q-gen-001)). "Icon" fue un error de transcripción: no es un nombre del sistema.
- Contexto de negocio (visión, clientes, estrategia, marca, hoja de ruta): [la-empresa.md](la-empresa.md).
- **Alcohn** (también "Alcohn CNC", dominio `alcohncnc.com` citado en el código) es la empresa. ✅ (confirmado) Alcohn fabrica **sellos personalizados de bronce mecanizados por CNC** (para marcar cuero, madera, alimentos, lacre), y vende además **accesorios**: abecedarios (juegos de letras), soldadores eléctricos adaptados (100 W / 200 W), mangos de golpe y bases para remachadora.

## 2. Para qué existe

Alcohn AI es la **aplicación interna de operación** de Alcohn. ✅ Centraliza, sobre una única base de datos Supabase compartida con la tienda web:

1. **Pedidos**: alta de clientes y pedidos (manuales y de la web), ítems ("sellos"), montos, seña y restante.
2. **Diseño → vector**: archivo base del cliente, vectorización (Vectorizer.AI), medida de fabricación.
3. **Producción CNC**: agrupación de sellos en **programas** por máquina (Chica/Grande/XL), paquete para **Vectric Aspire**, sincronización con el archivo `.crv3d` que realmente se fabrica.
4. **Terminación y cobro**: foto del sello terminado, aviso automático por WhatsApp con el monto restante, estados de venta (Señado → Foto → Transferido / Deudor).
5. **Envíos**: carga de datos de envío validados contra el padrón de Correo Argentino, subida automática a MiCorreo, links de pago y etiquetas de Andreani, seguimiento.
6. **Comercial y marketing**: generador de mockups, embudo de la tienda web, contactos y seguimientos automáticos por WhatsApp, eventos de conversión a Meta.
7. **Soporte a la operación**: stock de insumos, costos de fabricación, economía/gastos, precios, notificaciones internas, tareas entre compañeros, tablero de innovación.

## 3. Quiénes parecen usarla

✅ 7 usuarios en Supabase Auth (al 2026-09-27); 3 con área `ventas`, 2 `logistica`, 2 `produccion` (tabla `usuario_area`, un usuario puede tener varias). Existe además una cuenta de revisión de Meta (`FBTEST`) limitada a `/whatsapp`.
🔶 Es un equipo chico donde las mismas personas cubren varias áreas: el código no restringe ninguna pantalla por área (salvo Economía/Gastos visibles solo para una cuenta). Ver [09-roles-permissions](../09-roles-permissions/README.md).
❓ Quién hace qué tarea en la práctica no está en el código → [Q-USR-001](../14-open-questions/usuarios-permisos.md#q-usr-001).

## 4. Grandes áreas

| Área | Módulos | Doc |
|---|---|---|
| Ventas / atención | Pedidos, Mockups, Comercial Web, Precios, WhatsApp Bot | [02-modules](../02-modules/README.md) |
| Diseño técnico | Vectorización, (vector en Pedidos/Producción) | [vectorizacion](../02-modules/vectorizacion/README.md) |
| Producción | Producción, Programas, gadgets de Aspire, Stock | [programas](../02-modules/programas/README.md) |
| Logística | Envíos (Correo Argentino, Andreani, Vía Cargo), Historial | [envios](../02-modules/envios/README.md) |
| Administración | Economía, Gastos, Configuración | [economia-gastos](../02-modules/economia-gastos/README.md) |
| Transversal | Inicio, Notificaciones, Tareas, Innovación, Novedades | [plataforma](../02-modules/plataforma/README.md) |

## 5. Lectura recomendada

1. [Mapa del sistema](mapa-del-sistema.md) — cómo se conectan las piezas (app, DB, workers, bot, web, Aspire).
2. [Ciclo de vida real de un pedido](ciclo-de-vida-del-pedido.md) — el recorrido completo reconstruido del código.
3. [Qué controla, qué registra, qué automatiza Alcohn AI](control-registro-automatizacion.md).
4. [Fronteras Alcohn AI ↔ mundo real](../10-operational-boundaries/README.md).
