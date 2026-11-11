> # ⚠️ DOCUMENTO DESACTUALIZADO
>
> Describe la **API Paq.ar v2**, que finalmente **no vamos a usar**. La integración se va a hacer con la **API MiCorreo**, que funciona distinto.
>
> **Lo que cambia respecto de lo que dice acá:**
>
> - ✅ **Sí se pueden cotizar precios** (esta guía dice que no) — es la gran ventaja de MiCorreo.
> - ❌ **No genera etiquetas, ni tracking number, ni seguimiento, ni cancelación** por API. Todo eso sigue pasando por el portal de MiCorreo.
> - ❌ El ciclo de vida descrito en la sección 4 **no aplica tal cual**.
>
> Lo que **sí sigue siendo válido**: los datos obligatorios del destinatario y del paquete, los códigos de provincia, la regla de 1 envío = 1 paquete, y las decisiones de producto de la sección 11.
>
> **Pendiente:** reescribir esta guía contra la API MiCorreo.

---

# Integración Correo Argentino (API Paq.ar) — Guía funcional

> **Para qué sirve este documento:** describir *qué puede hacer* la nueva integración con Correo Argentino, qué datos necesita, qué decisiones toma el usuario y en qué orden — para poder diseñar el flujo de uso dentro de la app.
>
> **No habla de código.** No hace falta saber programar para leerlo.
>
> Basado en: *Correo Argentino – Plataforma de Integración – API 2.0 – Manual de Usuario* (abril 2023).

---

## 1. Qué cambia respecto de hoy

| | **Hoy** | **Con la nueva integración** |
|---|---|---|
| Cómo se genera el envío | Se arma un CSV y un robot lo sube al portal MiCorreo simulando a una persona | La app le habla directo a Correo Argentino |
| Velocidad | Lento, por tandas | Inmediato, envío por envío |
| Confiabilidad | Si Correo cambia el diseño del portal, se rompe | Estable |
| Seguimiento | Manual / aparte | La app puede consultar el estado cuando quiera |
| Etiquetas | Se descargan del portal | Llegan directo a la app, listas para imprimir |
| Cancelar un envío | A mano | Un botón |

**En una frase:** pasamos de "un robot que usa la web de Correo por nosotros" a "Correo nos da acceso directo". El mismo cambio que ya hicimos con Andreani.

---

## 2. Las 5 cosas que la app va a poder hacer

1. **Crear un envío** — le avisamos a Correo que tenemos un paquete para despachar y nos devuelve un número de seguimiento.
2. **Obtener la etiqueta** — el PDF que se pega en el paquete. Se puede pedir de a varios de una sola vez.
3. **Consultar el estado** — dónde está el paquete y todo su historial de movimientos.
4. **Cancelar un envío** — siempre y cuando todavía no lo hayamos despachado físicamente.
5. **Listar sucursales** — todas las sucursales habilitadas, con dirección, horarios y ubicación en el mapa. Sirve para que el cliente elija dónde retirar.

---

## 3. Conceptos que hay que tener claros antes de diseñar

**Acuerdo (*agreement*)**
Es nuestro contrato con Correo Argentino. Define qué servicios tenemos habilitados, cuánto peso nos aceptan y **qué sucursales podemos usar**. Es un número fijo, va en todas las operaciones. El usuario de la app nunca lo ve ni lo elige.

**Número de seguimiento (*tracking number* o TN)**
El identificador único del paquete. **Es la llave de todo**: sin él no hay etiqueta, no hay seguimiento, no hay cancelación. Lo genera Correo cuando creamos el envío y queda guardado contra el pedido. Es el número que después le pasamos al cliente para que rastree.

**Preimposición vs. imposición** ← *importante para el diseño*

- **Preimposición** = el envío está *anunciado*. Correo sabe que existe, pero el paquete todavía está en nuestras manos.
- **Imposición** = el paquete ya entró físicamente al circuito de Correo.

La diferencia marca el punto de no retorno: **solo se puede cancelar mientras está en preimposición**. Una vez impuesto, el botón de cancelar deja de tener sentido y debería desaparecer o deshabilitarse.

**Rótulo**
Es la etiqueta en PDF. Viene en dos formatos: uno tamaño **10×15 cm** (el de impresora térmica) y uno estándar. Elegimos uno por lote de impresión, no por envío.

**Tipo de entrega**
Solo existen tres opciones, y no hay más:

- **A domicilio** — llega a la puerta del cliente.
- **Retiro en sucursal** — el cliente lo busca por una sucursal de Correo.
- **Retiro en locker** — el cliente lo busca de un locker automático.

---

## 4. El ciclo de vida de un envío

```
   Se confirma la venta
            │
            ▼
   ┌─────────────────────┐
   │  CREAR EL ENVÍO     │  ← acá se juegan todos los datos del cliente
   └─────────────────────┘
            │
            ├──── falló (datos mal) ──────► "Error de Etiqueta"
            │                                     │
            │                                  corregir y reintentar
            ▼
   Correo devuelve el N° de seguimiento
            │
            ▼
   ┌─────────────────────┐
   │  BAJAR LA ETIQUETA  │  ──► "Etiqueta Lista"
   └─────────────────────┘
            │
            ▼
   Se imprime, se pega, se lleva a Correo
            │
            ▼
   ┌─────────────────────┐
   │  IMPOSICIÓN         │  ──► "Despachado"   ⚠ desde acá ya no se puede cancelar
   └─────────────────────┘
            │
            ▼
   ┌─────────────────────┐
   │  SEGUIMIENTO        │  ──► "Seguimiento Enviado" / Entregado
   └─────────────────────┘
```

### Cómo encaja con los estados que ya usa la app

| Estado actual en la app | Qué significa ahora, con la API |
|---|---|
| `Sin envio` | Todavía no se creó nada en Correo |
| `Hacer Etiqueta` | Listo para crear el envío — falta apretar el botón |
| `Error de Etiqueta` | Correo rechazó los datos. **Hay que mostrar por qué** |
| `Etiqueta Lista` | El envío existe, tiene N° de seguimiento y la etiqueta está disponible |
| `Despachado` | Ya se entregó en Correo, empieza el seguimiento real |
| `Seguimiento Enviado` | Se le pasó el número al cliente |

**No hace falta inventar estados nuevos.** El mapeo es directo. Lo único que sumaría valor es un estado o indicador de **"Cancelado"**, que hoy no existe.

---

## 5. Los datos que hay que tener sí o sí

Si falta cualquiera de estos, Correo rechaza el envío. Conviene **validarlos en la app antes de intentar crearlo**, así el usuario no se entera del problema recién cuando falla.

### Del destinatario (el cliente que compra)

| Dato | ¿Obligatorio? | Notas para el diseño |
|---|---|---|
| Nombre | **Sí, siempre** | |
| Calle | Sí* | |
| Altura | Sí* | |
| Localidad | Sí* | |
| Provincia | Sí* | Lista cerrada de 24 opciones — **tiene que ser un desplegable**, nunca texto libre |
| Código postal | Sí* | ⚠️ **Correo valida que el CP corresponda a la provincia elegida.** Si no matchean, rechaza |
| Piso / Depto | No | |
| Teléfono / Celular | No | Recomendable igual: ayuda al cartero |
| Email | No | |
| Observaciones | No | Ej. "portón negro", "tocar timbre 2 veces" |

\* **Solo si el envío es a domicilio.** Si el cliente retira en sucursal o locker, alcanza con el nombre — la dirección no se pide.

> **Implicancia de diseño:** el formulario debería **cambiar según el tipo de entrega**. Si elige "retiro en sucursal", los campos de dirección se ocultan y aparece el selector de sucursal. Pedir una dirección que no se va a usar solo genera fricción y errores.

### Del remitente (nosotros)

Los mismos campos, pero **son siempre los mismos**. Esto no debería pedirse en cada envío: va una vez en configuración y se reutiliza. Como mucho, si algún día despachamos desde más de un lugar, un selector de "desde dónde sale".

### Del paquete

| Dato | ¿Obligatorio? | Límite |
|---|---|---|
| Peso | **Sí** | **En gramos.** Máximo 99.999 g, pero nuestro acuerdo puede tener un tope menor (hay que confirmarlo) |
| Alto | **Sí** | En cm, máximo 3 dígitos. Algunos acuerdos no aceptan más de 255 cm |
| Ancho | **Sí** | Ídem |
| Largo | **Sí** | Ídem |
| Valor declarado | **Sí** | Es el monto por el que va asegurado |
| Categoría del producto | No | Texto descriptivo, ej. "Sellos" |

> **Implicancias de diseño:**
>
> - Si en la app el peso se carga en kilos, hay que convertir. Un error acá es carísimo: cargar "2" pensando en kilos manda 2 gramos.
> - Conviene **precargar medidas típicas** por tipo de producto para que nadie tenga que medir cada caja.
> - **Nada puede ir con decimales ni comas.** Los tres lados y el peso son números enteros.

### Otros

- **Fecha de la venta** — obligatoria. La app la tiene, se completa sola.
- **Tipo de servicio** — el "nivel" de servicio contratado (tipo de producto postal). ⚠️ El manual **no dice cuáles son los valores válidos**; hay que pedírselos a Correo. Probablemente sea uno fijo para nosotros y el usuario nunca lo elija.

---

## 6. Reglas que condicionan el diseño

### 🔴 Un envío = un solo paquete

La API **no soporta envíos de varios bultos**. Si un pedido necesita 3 cajas, son **3 envíos separados, con 3 números de seguimiento y 3 etiquetas**.

*Qué implica:* si hoy la app asume "1 pedido = 1 envío", eso se rompe en cuanto haya un pedido grande. Hay que decidir cómo se muestra un pedido con varios envíos: ¿una lista de paquetes dentro del pedido? ¿Un contador "Paquete 1 de 3"?

### 🔴 La lista de sucursales no es la lista completa de Correo

Solo podemos usar **las sucursales habilitadas para nuestro acuerdo**, y esa lista **puede cambiar**. Además, Correo verifica que la sucursal siga habilitada **en el momento exacto en que se crea el envío**.

*Qué implica:* el selector de sucursales tiene que alimentarse de la lista real, actualizada cada tanto — no de una lista fija cargada a mano. Y hay que contemplar el caso "la sucursal que eligió el cliente ya no está disponible", que puede aparecer días después de la compra.

### 🔴 La ventana de cancelación es corta

Solo se cancela mientras el paquete no fue despachado. Después, no hay vuelta atrás desde la app.

*Qué implica:* el botón de cancelar debería estar visible y accesible mientras el envío está en "Etiqueta Lista", y desaparecer al pasar a "Despachado".

### 🟡 Las etiquetas se piden de a varias, pero pueden fallar de a una

Se puede pedir un lote de 20 etiquetas en una sola operación. Pero **algunas pueden salir bien y otras mal dentro del mismo lote**.

*Qué implica:* la pantalla de impresión masiva no puede ser "salió todo bien" o "falló todo". Necesita mostrar un resultado por envío: **cuáles se imprimieron y cuáles no, con el motivo**. Y permitir reintentar solo los que fallaron.

### 🟡 El formato de etiqueta se elige por lote

10×15 cm o estándar — pero **aplica a todo el lote junto**, no se puede mezclar.

*Qué implica:* si se elige, es una preferencia global (configuración) o un selector en la pantalla de impresión. No un campo por envío.

### 🟡 El número de seguimiento es único para siempre

No se puede repetir jamás, ni siquiera si el envío se canceló.

*Qué implica:* si un envío se cancela y hay que rehacerlo, **es un envío nuevo con número nuevo**. La app no debería intentar "reactivar" el anterior.

---

## 7. Lo que la API **no** hace (y hay que resolver de otra manera)

Esto es tan importante como lo que sí hace:

| No hace | Consecuencia para el diseño |
|---|---|
| **No cotiza precios** | No hay forma de preguntarle a Correo "¿cuánto sale este envío?". Si la app necesita mostrar un costo, sale de una tabla de tarifas propia o se pacta con Correo aparte |
| **No avisa cuando algo cambia** | Correo no nos notifica. Para saber si un paquete se movió, **la app tiene que ir a preguntar cada tanto**. Hay que definir cada cuánto (¿cada hora? ¿2 veces por día?) y qué pasa si el usuario quiere el dato *ahora* (botón "actualizar") |
| **No le avisa al cliente final** | Los mails o WhatsApp al comprador los mandamos nosotros |
| **No devuelve una lista de todos nuestros envíos** | Solo se puede consultar por número de seguimiento. **La app es la única fuente de verdad** de qué envíos existen. Si se pierde un número de seguimiento, ese envío se vuelve inubicable |
| **No guarda nuestro número de pedido** | Existe un campo para eso pero **está documentado como no funcional**. La relación pedido ↔ envío la mantenemos nosotros |
| **No hay multi-bulto** | Ver arriba |

> **La conclusión más importante de esta tabla:** el número de seguimiento tiene que guardarse contra el pedido de forma robusta, apenas Correo lo devuelve. Es el único hilo que conecta nuestro pedido con el paquete real.

---

## 8. Errores: qué puede salir mal y qué debería ver el usuario

Los errores vienen de Correo en tres sabores. La app debería traducirlos a algo accionable:

| Tipo de error | Causa real | Qué debería decir la app |
|---|---|---|
| **Datos inválidos** | CP que no corresponde a la provincia, peso fuera de rango, falta un campo obligatorio, medidas con decimales | Un mensaje concreto sobre **qué campo corregir**, y volver al formulario con ese campo marcado |
| **Credenciales inválidas** | La clave venció o está mal configurada | Esto **no es culpa del usuario**. Mensaje tipo "problema de conexión con Correo Argentino, avisá al administrador" — y una alerta interna |
| **Sin permiso** | Nuestro acuerdo no tiene habilitado ese servicio o esa sucursal | "Esa sucursal no está disponible para nuestra cuenta" y ofrecer elegir otra |
| **Sucursal dada de baja** | La sucursal se deshabilitó entre que el cliente eligió y nosotros despachamos | Avisar y pedir que se elija otra — es un caso real y hay que contemplarlo |

⚠️ **Advertencia concreta:** algunos mensajes de error de Correo vienen **en crudo, en jerga técnica, o directamente vacíos**. No se pueden mostrar tal cual. Hay que traducir los casos frecuentes a español claro y tener un mensaje genérico decente para el resto (*"Correo Argentino rechazó el envío. Revisá los datos del destinatario."*).

---

## 9. Sobre el seguimiento

Cada consulta devuelve el **historial completo de movimientos** del paquete: qué pasó, dónde y cuándo. Cuando alguien firma la recepción, también viene la firma.

Tres cosas a tener en cuenta al diseñar la vista de seguimiento:

1. **Los estados vienen en la jerga de Correo**, en MAYÚSCULAS y abreviados (`PREIMPOSICION`, `EN PROCESO DE CANCELACION`, `caduco`...). Hay que traducirlos a lenguaje humano antes de mostrarlos: *"Anunciado"*, *"En camino"*, *"Entregado"*.
2. **El manual no incluye la lista completa de estados posibles.** Hay que pedírsela a Correo, o ir descubriéndolos. Mientras tanto, la app tiene que mostrar con dignidad un estado que no conoce, en vez de romperse.
3. **Un envío recién creado puede no tener ningún movimiento todavía.** Eso no es un error: es "todavía no pasó nada". La pantalla necesita un estado vacío que lo explique bien.

---

## 10. Sobre las sucursales

La consulta de sucursales devuelve, por cada una: nombre, código, dirección completa, **latitud y longitud**, teléfono, email y horarios. Se puede filtrar por provincia y por si sirve para que el cliente retire.

Esto habilita cosas lindas para el diseño:

- **Un mapa** con las sucursales cercanas al cliente (tenemos las coordenadas).
- **Filtrar por la provincia del cliente** automáticamente, así no tiene que buscar entre cientos.
- Mostrar el horario de atención antes de que elija.

Dos advertencias:

- Los **horarios vienen como texto libre** (ej. `"LUN A VIE 08.00 A 14.30"`), no como datos ordenados. Se pueden mostrar tal cual, pero no se puede hacer "abierto ahora" sin trabajo extra.
- **Varios campos vienen vacíos** en muchas sucursales (capacidad máxima, horarios detallados). El diseño tiene que aguantar que falte información sin verse roto.

---

## 11. Decisiones de producto a tomar

Preguntas que conviene resolver antes de diseñar las pantallas:

1. **¿Quién elige el tipo de entrega?** ¿El cliente al comprar, o nosotros al despachar? Cambia bastante el formulario.
2. **¿Cómo elige el cliente la sucursal?** ¿Buscador por nombre, lista por provincia, mapa? ¿Y si nunca eligió?
3. **¿Cada cuánto se actualiza el seguimiento?** ¿Automático de fondo, o solo cuando alguien lo pide?
4. **¿Las etiquetas se imprimen de a una o por lote?** Lo más eficiente es un flujo tipo "seleccionar los envíos del día → imprimir todo junto".
5. **¿Qué pasa con los pedidos de varios bultos?** Hay que decidirlo sí o sí, la API obliga.
6. **¿Mostramos el envío cancelado o lo escondemos?**
7. **¿Quién puede cancelar un envío?** ¿Cualquiera, o requiere permiso?
8. **¿El número de seguimiento se le manda al cliente automáticamente?** ¿En qué momento?

---

## 12. Lo que todavía falta confirmar con Correo Argentino

Huecos reales del manual. Ninguno bloquea el diseño, pero afectan los detalles:

- **Qué tipos de servicio tenemos habilitados** (¿hay opción express o es uno solo?).
- **Nuestro tope real de peso y medidas** — el manual muestra un ejemplo de otro cliente con 25 kg, pero el nuestro puede ser distinto.
- **La lista completa de estados de seguimiento**, para poder traducirlos todos.
- **Si el código postal se carga con 4 dígitos o en formato largo** (`1425` vs `C1425ABC`).
- **Si el número de seguimiento lo genera Correo o lo tenemos que generar nosotros** — depende del acuerdo.

---

## Glosario rápido

| Término | Qué es |
|---|---|
| **Acuerdo / agreement** | Nuestro contrato con Correo. Define qué podemos hacer |
| **TN / tracking number** | El número único del paquete. La llave de todo |
| **Rótulo** | La etiqueta en PDF que se pega al paquete |
| **Preimposición** | El envío está anunciado pero el paquete sigue con nosotros |
| **Imposición** | El paquete ya entró al circuito de Correo. Punto de no retorno |
| **Tipo de entrega** | Domicilio, sucursal o locker |
| **Sucursal habilitada** | Una sucursal que *nuestro acuerdo* puede usar — no todas sirven |
| **Valor declarado** | El monto por el que va asegurado el paquete |
