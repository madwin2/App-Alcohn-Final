# Propuesta: automatización e IA en Alcohn

> **Estado**: ideas para decidir, **nada implementado**. Armado el 2026-10-10 a partir de una conversación con Julián, de `docs/` y de datos reales de la base.
> Es una propuesta (como los otros `PROPUESTA_*.md`), no describe el estado actual de la app.
> Marcas: ✅ verificado en código/DB · 🔶 inferencia o cuenta estimada · ❓ falta un dato (ver [Preguntas abiertas](#9-preguntas-abiertas)).

## Índice

1. [Lo que dicen los datos](#1-lo-que-dicen-los-datos)
2. [Quién hace qué: app, Claude y Grok Bot](#2-quién-hace-qué-app-claude-y-grok-bot)
3. [Ideas grandes](#3-ideas-grandes)
4. [Huecos concretos de la app](#4-huecos-concretos-de-la-app)
5. [Grok Bot: dentro y fuera de la app](#5-grok-bot-dentro-y-fuera-de-la-app)
6. ["Lo que necesito" con un bot que lo resuelve](#6-lo-que-necesito-con-un-bot-que-lo-resuelve)
7. [Una app que se cuida sola (y se mejora sola)](#7-una-app-que-se-cuida-sola-y-se-mejora-sola)
8. [Prioridades sugeridas](#8-prioridades-sugeridas)
9. [Preguntas abiertas](#9-preguntas-abiertas)
10. [Límites y seguridad](#10-límites-y-seguridad)

---

## 1. Lo que dicen los datos

Consulta a la base el 2026-10-09 ✅, últimos 6 meses, solo pedidos de tipo Venta.

| Dato | Valor |
|---|---|
| Pedidos | **1.234** · ticket promedio **$91.530** · ~**$113M** facturados |
| Alta del pedido → seguimiento enviado | mediana **~11–15 días**; solo **1,6 %** dentro de 72 h |
| Dónde se va el tiempo (medianas, últimos 4 meses) | alta → `Hecho` **5,9 días** · `Hecho` → foto 2 h · foto → cobrado 0,8 días · cobrado → despacho 1 día |
| Sellos fabricados | 1.366 (~230/mes) · 16 rehacer |
| Clientes que compraron más de una vez | **7,4 %** de 5.621 |
| Mockups generados | **10.095**; solo **173** vinculados a un pedido |
| Deudores | 20 pedidos · $1,8M |

**Cuidado al leerlos**
- 🔶 En Andreani `Despachado` llega tarde (las etiquetas se traen después de despachar), así que el 1,6 % puede subestimar.
- ❓ Puede que los mockups hechos por Ventas para WhatsApp no se vinculen al pedido. La conversión real seguramente es mayor.

**Conclusiones**
1. El cuello de botella es **fabricar**, no vender ni enviar.
2. Casi nadie vuelve a comprar.
3. Hay una montaña de mockups (leads con su logo ya diseñado) sin aprovechar.

## 2. Quién hace qué: app, Claude y Grok Bot

| Herramienta | Para qué sirve mejor |
|---|---|
| **La app** (código propio) | Lo que es el corazón del negocio y tiene que ser confiable: estados, WhatsApp, cobros, programas, envíos |
| **Claude** (Claude Code / API) | Programar la app; agentes que razonan sobre la base, los logs y el código; reportes y análisis programados; diagnóstico y arreglo de errores |
| **Grok Bot** (xAI, beta desde ago-2026) | Agente con computadora propia en la nube que usa páginas web como una persona y aprende tareas mirando una grabación de pantalla. Sirve para **portales sin API** |

**Regla**: si hay API, va en la app. Si no hay API y hoy alguien hace clics a mano, va Grok Bot.

## 3. Ideas grandes

### 3.1 Fábrica en piloto automático (contra los 5,9 días)
- **Todo lo previo a la máquina, sin manos.** Entra el pedido, se vectoriza solo, la IA chequea si se puede fabricar (trazos demasiado finos para 1,7 mm, texto mal escrito, medida rara) y queda listo para programa. Fede revisa en vez de producir.
- **Planificador nocturno.** Cada noche propone el programa de mañana por máquina: aprovecha la planchuela (nesting), prioriza por antigüedad y prioridad y respeta la elegibilidad. Fede aprueba y corre el gadget. ❓ ¿Fede está cómodo con eso?
- **Torre de control.** Dónde está trabado cada pedido, en vivo, y días de cola por máquina.
- **Simulador de capacidad.** Con datos reales responder si conviene una tercera CNC, un turno más u otra forma de armar programas. Es la pregunta de "taller → fábrica".

### 3.2 Motor de recompra (el 7,4 %)
- 🔶 Cuenta rápida: +3 puntos de recompra ≈ 170 pedidos ≈ $15M al ticket actual.
- **Recompra por cliente** según rubro e historial, en vez del aviso fijo a los 2 meses.
- **Venta cruzada:** soldador, mango de golpe, otro tamaño o abecedario, con un mockup de **su** logo ya armado.
- **Referidos** entre artesanos.

### 3.3 Recuperar los 10.000 mockups
- Medir primero la conversión real, cruzando por cliente o teléfono aunque el pedido no esté vinculado.
- Seguimiento automático: reenviar su propio mockup a quien no compró ("tu sello te está esperando").
- Audiencias de Meta con quienes hicieron mockup. ❓ Consentimiento.

### 3.4 Venta 24/7 en un minuto
Cotizador instantáneo por WhatsApp: el cliente manda su logo y en un minuto recibe mockup, precio y cómo pagar la seña. La IA lee el comprobante y el pedido se crea solo; Ventas aprueba con un toque. Es más acotado y seguro que Francisco.

### 3.5 Publicidad que se paga sola
- **Atribución:** capturar UTM, gclid, fbclid y el dato de los anuncios que abren WhatsApp, y cruzarlo con el gasto por campaña (el dolor n.º 1 del dueño).
- **Arreglar el evento de compra a Meta,** que hoy le llega con ~16 % menos de valor (B-06): el algoritmo aprende mal.
- **Copiloto semanal:** costo por venta por campaña y propuesta de recortes o subas; se aplica solo con OK.
- **Cada sello es un anuncio:** creatividades armadas con las fotos de Juli B, con permiso del cliente.

### 3.6 Cuánto gana de verdad cada sello
- Usar el tiempo de máquina y el material real que ya reporta el gadget (B-21), para saber la rentabilidad por tipo y medida y ajustar precios.
- **Caja proyectada:** lo que entra (restantes de sellos en producción) contra lo que sale (gastos y publicidad).

### 3.7 Experiencia "wow" para el cliente
- Link de **"¿cómo va mi sello?"** con estado en vivo. Baja las consultas por WhatsApp.
- **Video de tu sello fabricándose:** clip corto de la CNC. ❓ Necesita cámara en las máquinas.
- **Control de calidad con visión:** comparar la foto del sello terminado con el vector antes de enviar.

## 4. Huecos concretos de la app

| Hueco | Propuesta | Ref. | ❓ |
|---|---|---|---|
| Datos de envío pedidos a mano | WhatsApp automático al pasar a `Transferido` | B-18 | Texto del mensaje estándar |
| Verificar seña/comprobantes | IA lee el comprobante y lo asocia al pedido; una persona confirma | FR-01 | Quién mira la cuenta hoy |
| Retoque en ChatGPT, fuera de la app | Botón "mejorar con IA" en vectorización | FR-02 | Qué se le pide hoy a ChatGPT |
| Trayectorias por pendrive | Subirlas con el gadget y bajarlas en la PC de la CNC | B-16 | — |
| Stock de bronce | Cargar compras + alerta con 3–4 días de margen (Buenos Aires tarda 2–3) | B-15, B-22 | Quién compra y a quién |
| Cajas de Economía desactualizadas | Alimentarlas desde los cobros registrados | FR-06 | Cómo quieren llevarlas |
| WhatsApp marcados fallidos (30–50 %) | Alinear timeouts y reintentos | B-10 | — |
| PDF de MiCorreo bajado a mano | Worker o Grok Bot | B-20 | — |

**Parte diario de "qué está trabado"** (tarea programada de Claude): pedidos fuera de 72 h, sellos en `Verificar`/`Retocar`, `Foto` sin cobrar, `Transferido` sin datos de envío, etiquetas con error, más un pulso de publicidad contra ventas.

## 5. Grok Bot: dentro y fuera de la app

**Fuera de la app**
- **Logística**
  - Bajar el PDF de etiquetas de MiCorreo cada día.
  - Recorrer los portales de Correo y Andreani buscando envíos demorados, devueltos o sin retirar, y avisar antes del reclamo.
  - ❓ ¿Puede reemplazar el túnel de Andreani? Depende de desde dónde corre su computadora.
- **Comercial**
  - Informe mensual de la competencia: precios en MercadoLibre e Instagram, anuncios en la Biblioteca de Anuncios de Meta.
  - Reseñas de Google: juntarlas y proponer respuestas.
  - Publicar en Instagram las fotos de sellos, con aprobación.
  - Listas de negocios para venta mayorista (solo la lista; el contacto lo decide una persona).
  - Ordenar la bandeja de Instagram y Facebook.
- **Administración**
  - Comparar precios de proveedores (planchuelas, packaging).
  - ❓ Facturación en ARCA, si se hace a mano: podría ser la tarea repetitiva más grande.

**Dentro de la app**
- **Probar la app cada noche,** solo mirando sin modificar datos: no hay entorno de prueba y los cambios van directo a producción.
- **Probar una automatización antes de programarla:** se le enseña una tarea repetitiva y, si en dos semanas demuestra que ahorra tiempo, se programa en la app.
- Pedidos en lenguaje natural: se superpone con el asistente propio que estábamos pensando ([`docs/14-open-questions/asistente.md`](docs/14-open-questions/asistente.md)). Elegir uno solo.

## 6. "Lo que necesito" con un bot que lo resuelve

**Idea del dueño**: que el equipo anote lo que necesita (por ejemplo, "necesito un monitor nuevo") y un bot lo investigue y lo deje listo para decidir.

**Lo que ya existe** ✅: la pestaña **Lo que necesito** del perfil (`necesidades_equipo`). La persona carga el pedido, el admin lo ve en la bandeja **Necesidades pendientes** y recibe la notificación `e3_necesidad_nueva`. Hoy lo resuelve una persona.

**Propuesta**
1. Al cargarse una necesidad, un agente (Claude por API con búsqueda web) la lee y, si hace falta, **pregunta lo que falta** dentro de la misma necesidad ("¿para qué lo usás? ¿presupuesto?").
2. Investiga y deja una **propuesta** pegada a la necesidad: 2–3 opciones (la más barata, la mejor relación precio-calidad, la mejor), con precio, link (MercadoLibre, tiendas), envío a Mar del Plata y por qué cada una.
3. El admin ve la propuesta en la bandeja y elige **Aprobar**, **Pedir otra cosa** o **Rechazar**.
4. **La compra la hace una persona.** El bot no paga nada.

**Por qué Claude por API y no Grok Bot para esto**: se dispara solo desde la app cuando entra la necesidad, el resultado queda guardado en la base y no hace falta prestarle cuentas. Grok Bot queda para cuando la necesidad exija entrar a un portal con usuario (por ejemplo, el de un proveedor).

**Además de compras**: "averiguame cómo se hace X", "necesito un curso de Illustrator", "¿qué proveedor de packaging hay en MdP?". Todo lo que sea **investigar y resumir**.

Esfuerzo 🔶: S–M. Es de lo más rápido de toda la lista y lo ve todo el equipo.

## 7. Una app que se cuida sola (y se mejora sola)

**Problema del dueño**: cuando algo se rompe (por ejemplo, el worker de Andreani), hoy se entera tarde, abre Cursor, pide el diagnóstico, abre otra sesión y pide el arreglo. La idea es que la app se dé cuenta sola, se diagnostique y se arregle.

**Opinión**: se puede, **por niveles**. Los niveles 1 a 3 son realistas hoy; el 100 % autónomo no conviene todavía.

| Nivel | Qué hace | Cómo | Riesgo |
|---|---|---|---|
| **1. Darse cuenta** | Detecta el problema antes que vos | "Latido" de cada worker (Andreani, MiCorreo, vector, bot) cada pocos minutos; tasa de errores en `webhook_logs`, `gastos_sync_log`, `vector_jobs` y en los logs de las edge functions y de Vercel; chequeo de que el bot responde. Aviso por WhatsApp o notificación al dueño | Nulo |
| **2. Diagnosticarse** | Explica qué pasó y dónde | Al saltar una alerta, se lanza un agente de Claude Code en la nube con acceso al repo y a los logs. Escribe el diagnóstico en una pantalla **Estado del sistema** ("andreani-worker sin latido hace 20 min; causa probable: …; archivo: …") | Nulo, solo lee |
| **3. Arreglarse con tu OK** | Propone el arreglo listo | **Arreglos de rutina** (reiniciar un worker, reintentar una cola) se ejecutan solos con una lista cerrada de acciones permitidas. **Arreglos de código**: el agente abre un PR en GitHub con la explicación; vos lo aprobás desde el celular y se despliega | Bajo, si los arreglos de código siempre pasan por tu OK |
| **4. Arreglarse solo** | Aplica arreglos de código sin preguntar | — | **No todavía**: no hay staging (B-04) ni backups del VPS (B-03), la base es compartida con la tienda web y casi no hay permisos (B-01). Un arreglo automático malo puede romper la web o los datos |

**Requisitos antes del nivel 3**
- Backups y monitoreo del VPS (B-03).
- Entorno de prueba o rama de Supabase (B-04).
- Que el VPS se pueda reiniciar con un script seguro.
- **Nunca** migraciones de base automáticas.

**"¿Cómo podrías mejorar?"**: una app que se propone mejoras
- Una vez por semana, un agente lee los errores, los tiempos (sección 1), el uso de cada pantalla, el backlog (`docs/16-backlog/`) y el Corcho.
- Pincha sus propuestas **en el Corcho** como ideas del bot. El equipo vota como con cualquier idea.
- Las ideas que el dueño **aprueba** pasan al agente, que las implementa como PR con el mismo circuito del nivel 3.
- Esto aprovecha el Corcho tal como está y deja la decisión en manos de las personas, en línea con la visión de "todos son parte".

Esfuerzo 🔶: nivel 1 S–M · nivel 2 M · nivel 3 M–L · mejora semanal M.

## 8. Prioridades sugeridas

| Orden | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | Nivel 1 de autocuidado (latidos + alertas) | Evita apagar incendios como el de Andreani | S–M |
| 2 | "Lo que necesito" con bot | Rápido, visible, le saca trabajo al dueño | S–M |
| 3 | Parte diario de lo trabado | No toca la app; el equipo lo ve al otro día | S |
| 4 | Evento de compra a Meta + atribución | Dolor n.º 1: publicidad | S–M |
| 5 | Medir mockups + recompra | Plata directa | S → M |
| 6 | Nivel 2 de autocuidado (diagnóstico automático) | — | M |
| 7 | Datos de envío automáticos (B-18) | Trabajo diario de Cachi y Juli B | S–M |
| 8 | Torre de control + planificador | Ataca los 5,9 días | M–L |
| 9 | Grok Bot: MiCorreo, envíos con problemas, competencia | Bajo riesgo | S cada uno |
| 10 | Mejora semanal vía Corcho, cotizador 24/7, video de fabricación | Más adelante | M–L |

## 9. Preguntas abiertas

1. ¿Los mockups hechos para WhatsApp se vinculan al pedido?
2. ¿Qué consentimiento hay para contactar o hacerle publicidad a quien hizo un mockup y no compró?
3. ¿Fede aceptaría un programa propuesto automáticamente?
4. ¿Facturan en ARCA a mano? ¿Quién y cuánto tiempo lleva?
5. ¿El equipo usa Slack o solo WhatsApp? Los bots de equipo de Grok se conectan a Slack.
6. ¿Quién verifica hoy que entró la seña?
7. ¿Texto del mensaje estándar para pedir datos de envío?
8. "Lo que necesito": ¿hay un presupuesto tope o tiendas preferidas? ¿Quién aprueba las compras además del dueño?
9. Autocuidado: ¿a quién se avisa (solo al dueño o también al equipo) y por qué canal?

## 10. Límites y seguridad

- **Sin acceso al homebanking ni a medios de pago** para ningún bot. Según la documentación de xAI, todos los Grok Bots de una cuenta comparten la misma computadora y no conviene tratarlos como barrera de seguridad.
- **Ningún bot compra, paga ni manda mensajes a clientes sin aprobación humana,** al menos al principio.
- **Si un bot entra a Alcohn AI,** que sea con un usuario propio y después de cerrar permisos (B-01).
- **Arreglos de código automáticos siempre por PR aprobado;** migraciones de base nunca automáticas.
- **Lo físico sigue siendo de personas:** fotos, armado, despacho, cargar la máquina.

**Fuentes sobre Grok Bot** (sin probarlo; información pública a oct-2026): [changelog de x.ai](https://x.ai/changelog/bot), [xAI News](https://x.ai/news), [Digital Applied](https://www.digitalapplied.com/blog/grok-bot-ai-teammates-launch-cloud-computer-2026), [Layer3 Labs](https://www.layer3labs.io/guides/what-is-grok-bot).
