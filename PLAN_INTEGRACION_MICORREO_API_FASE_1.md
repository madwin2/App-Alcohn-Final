# Plan de implementación — Integración API MiCorreo (Correo Argentino) — FASE 1

> **Destinatario:** Cursor.
> **Objetivo de esta fase:** poder cotizar envíos e importarlos a MiCorreo desde una CLI local, para entender la API antes de tocar la app.
> **Resultado esperado:** un paquete nuevo `services/micorreo-api-worker` con scripts para obtener token, resolver el `customerId`, listar sucursales, **cotizar precios** e importar un envío.

> ⚠️ **Este documento reemplaza a `PLAN_INTEGRACION_CORREO_API_FASE_1.md`**, que estaba basado en la API Paq.ar v2 — una API distinta que finalmente no vamos a usar. Ignorá ese archivo por completo.

---

## 0. ⛔ Guardrails — leer antes de escribir una línea

### 0.1 NO tocar la página de Envíos ni el worker existente

**PROHIBIDO modificar:**

- Cualquier archivo bajo `src/` — **esta fase no toca el frontend en absoluto**
- `services/micorreo-worker/**` — el worker de Playwright **está en uso productivo** subiendo CSVs al portal. Es un paquete distinto del que vamos a crear, pese al nombre parecido. No se toca, no se deprecia, no se refactoriza
- `services/andreani-worker/**`
- Tablas de Supabase y migraciones — **esta fase no crea ni modifica tablas**

**Todo el trabajo vive dentro de `services/micorreo-api-worker/`**, que es nuevo.

### 0.2 🔴 Esta API NO tiene endpoint para cancelar

Esto es lo más importante del documento.

`POST /shipping/import` importa un envío real a la plataforma MiCorreo. **No existe ningún endpoint para deshacerlo.** Un envío importado por error solo se puede dar de baja entrando manualmente al portal de MiCorreo.

Además, `extOrderId` es único: si se reintenta con el mismo, la API responde *"La orden ya fue importada con anterioridad"*.

Por eso, las escrituras van con doble candado:

| Regla | Implementación |
|---|---|
| **Lecturas libres** | `token`, `users/validate`, `agencies` y `rates` se pueden correr sin ceremonia. Ninguno crea nada |
| **`shipping/import` bloqueado por defecto** | Requiere **las dos** cosas: `MICORREO_ALLOW_IMPORT=true` en `.env` **y** el flag `--confirmar`. Sin ambas, el script imprime el payload que hubiera enviado y termina con exit 0, **sin hacer ninguna llamada HTTP** |
| **`/register` nunca se llama** | Crea usuarios reales en MiCorreo. **No implementar un script para este endpoint en esta fase.** Ya tenemos cuenta |
| **Todo import queda registrado** | Cada import exitoso se escribe en `artifacts/registry.json` **antes** de imprimir nada. Como no hay cancelación por API, este archivo es el único rastro de qué se creó y qué hay que dar de baja a mano |
| **Los imports de prueba se marcan** | El `extOrderId` de las pruebas lleva prefijo `TEST-` + timestamp, para poder identificarlos en el portal |

> **Para el implementador:** no agregues un "modo simulación" que invente respuestas. Si no está confirmado, el script no llama a la API y muestra el payload. Un mock que finge éxito no enseña nada.

---

## 1. Cómo funciona esta API (resumen)

REST, JSON, HTTPS obligatorio. Autenticación en dos pasos:

```
1. POST /token  con HTTP Basic Auth (user:password)
         ↓
   Devuelve un JWT + su fecha de expiración
         ↓
2. Todo el resto de las llamadas:  Authorization: Bearer <token>
```

Y hay un segundo concepto de identidad, separado del token:

**`customerId`** — el identificador de nuestra cuenta de MiCorreo. **Va en el body o query de casi todos los endpoints.** Se obtiene con `POST /users/validate` mandando el email y password de la cuenta de MiCorreo. No se deduce del token.

> 💡 **Hipótesis a verificar:** las credenciales de la cuenta MiCorreo probablemente sean las mismas que ya usa `services/micorreo-worker` (`MICORREO_USER` / `MICORREO_PASSWORD`). Probar con esas primero. **No copiar el archivo `.env` de ese worker** — configurar el nuestro por separado.

### URLs base

| Ambiente | URL |
|---|---|
| QA / Test | `https://apitest.correoargentino.com.ar/micorreo/v1` |
| Producción | `https://api.correoargentino.com.ar/micorreo/v1` |

Las credenciales son **distintas por ambiente** y se piden a Correo. `MICORREO_API_BASE_URL` es una variable de entorno — **el script debe imprimir en qué ambiente está corriendo al arrancar**, para que nadie importe a producción creyendo que está en QA.

---

## 2. Los 5 endpoints

| # | Operación | Método | Ruta | Riesgo |
|---|---|---|---|---|
| 1 | Obtener token | POST | `/token` | 🟢 |
| 2 | Obtener `customerId` | POST | `/users/validate` | 🟢 Lectura |
| 3 | Listar sucursales | GET | `/agencies` | 🟢 Lectura |
| 4 | **Cotizar envío** | POST | `/rates` | 🟢 Lectura |
| 5 | **Importar envío** | POST | `/shipping/import` | 🔴 **Escritura irreversible** |
| — | Registrar usuario | POST | `/register` | ⛔ **No implementar** |

### ⚠️ Lo que esta API NO hace

Hay que tenerlo clarísimo antes de diseñar nada encima:

- **No genera etiquetas.** No hay endpoint de rótulos. La etiqueta se sigue obteniendo desde el portal de MiCorreo.
- **No devuelve tracking number.** La respuesta de `/shipping/import` es solo `{ "createdAt": "..." }`. No hay ningún ID de envío.
- **No tiene seguimiento.** No hay endpoint de tracking.
- **No tiene cancelación.**

**La API cubre la parte de cotizar + importar. El pago, la etiqueta y el seguimiento siguen pasando por el portal** — que es justamente lo que hoy automatiza `micorreo-worker` con Playwright. O sea: esta API **reemplaza el paso de subir el CSV**, no el flujo completo.

El único hilo entre nuestro pedido y el envío en MiCorreo son los campos `extOrderId` y `orderNumber` que mandamos nosotros. **Esto hace que el registry local sea crítico.**

---

## 3. Referencia de la API (usar esto, no inventar)

### 3.1 `POST /token`

HTTP Basic Auth con usuario y contraseña de API (no los de la cuenta MiCorreo).

```bash
curl -X POST ${BASE_URL}/token -u ${user}:${password}
```

**200 OK:**

```json
{ "token": "eyJ0eXAiOiJKV1Qi...", "expires": "2022-04-26 21:16:20" }
```

**401:** `{ "code": "401", "message": "Unauthorized" }`

⚠️ `expires` viene como `"YYYY-MM-DD HH:mm:ss"` **sin zona horaria**. Asumir hora Argentina (`-03:00`) y **documentar en el README si el token dura lo que parece**. Del ejemplo del manual se deduce una vida de ~2h30m, pero hay que medirlo.

### 3.2 `POST /users/validate`

```json
{ "email": "...", "password": "..." }
```

**200 OK:** `{ "customerId": "0090000025", "createdAt": "2021-03-10" }`

**404:** `{ "code": "404", "message": "Usuario no valido o inexistente" }`

### 3.3 `GET /agencies`

Query params: `customerId` (req), `provinceCode` (req), `services` (opcional: `package_reception` | `pickup_availability`).

⚠️ `provinceCode` es **obligatorio** — no se puede traer el país entero de una. Para tener el listado completo hay que iterar las 24 provincias.

⚠️ El manual muestra el ejemplo con `--data-urlencode` sin `-G`, lo que en curl mandaría los datos como body. **Son query params.** Implementar como query string y, si falla, probar la otra variante y documentarlo.

**200 OK** — array de:

```json
{
  "code": "B0107",
  "name": "Monte Grande",
  "manager": "...", "email": "...", "phone": "...",
  "services": { "packageReception": true, "pickupAvailability": true },
  "location": {
    "address": { "streetName": "...", "streetNumber": "...", "floor": null,
                 "apartment": null, "locality": "...", "city": "...",
                 "province": "Buenos Aires", "provinceCode": "B", "postalCode": "B1842ZAB" },
    "latitude": "-34.81939997", "longitude": "-58.46747615"
  },
  "hours": { "monday": { "start": "0930", "end": "1800" }, "sunday": null, "holidays": null },
  "status": "ACTIVE"
}
```

`code` (ej. `B0107`) es lo que después va en `shipping.agency`. Los horarios **acá sí vienen estructurados** (`start`/`end` en formato `HHmm`), no como texto libre. Muchos campos pueden ser `null` → **todos los tipos nullable**.

### 3.4 `POST /rates` — cotización

```json
{
  "customerId": "0000550137",
  "postalCodeOrigin": "1757",
  "postalCodeDestination": "1704",
  "deliveredType": "D",
  "dimensions": { "weight": 2500, "height": 10, "width": 20, "length": 30 }
}
```

| Campo | Regla |
|---|---|
| `deliveredType` | `"D"` domicilio, `"S"` sucursal. **Opcional**: si se omite, devuelve **ambas** cotizaciones |
| `dimensions.weight` | **Enteros, en gramos.** Mínimo 1, **máximo 25.000** |
| `dimensions.height/width/length` | Enteros, en cm, **máximo 150** |

⚠️ Acá los números son **enteros de verdad**, no strings. `"weight": 2500` sin comillas.

**200 OK:**

```json
{
  "customerId": "0000550997",
  "validTo": "2022-06-07T10:31:27.881-03:00",
  "rates": [
    { "deliveredType": "D", "productType": "CP", "productName": "Paq.ar Clásico", "price": 498.06 }
  ]
}
```

`validTo` = hasta cuándo vale el precio. **Guardarlo**: es lo que va a determinar si una cotización mostrada en la app está vencida.

### 3.5 `POST /shipping/import` 🔴

```json
{
  "customerId": "0005000033",
  "extOrderId": "583358193",
  "orderNumber": "102",
  "sender": {
    "name": null, "phone": null, "cellPhone": null, "email": null,
    "originAddress": { "streetName": null, "streetNumber": null, "floor": null,
                       "apartment": null, "city": null, "provinceCode": null, "postalCode": null }
  },
  "recipient": { "name": "Aa cc", "phone": "", "cellPhone": "", "email": "username@mail.com" },
  "shipping": {
    "deliveryType": "D",
    "agency": null,
    "address": { "streetName": "Bb", "streetNumber": "1234", "floor": "", "apartment": "",
                 "city": "Buenos Aires", "provinceCode": "B", "postalCode": "1425" },
    "weight": 1000, "declaredValue": 500.00, "height": 20, "length": 40, "width": 20
  }
}
```

**Obligatorios:** `customerId`, `extOrderId`, `recipient` (con `name` y `email`), `shipping` (con `deliveryType`, `weight`, `declaredValue`, `height`, `length`, `width`).

| Campo | Regla |
|---|---|
| `extOrderId` | **Obligatorio y único.** Reintentar con el mismo da *"La orden ya fue importada con anterioridad"*. En pruebas: `TEST-<timestamp>` |
| `orderNumber` | Opcional. Es lo que se ve en el portal de MiCorreo — usar algo reconocible |
| `sender` | **Todo `null` en los ejemplos** → los datos del remitente salen de la cuenta MiCorreo. **Probar primero con todo en `null`.** Si da *"no se encontro datos de remitente"*, completarlo y documentarlo |
| `recipient.email` | **Obligatorio** |
| `shipping.deliveryType` | `"D"` domicilio, `"S"` sucursal |
| `shipping.agency` | **Obligatorio solo si `deliveryType === "S"`.** Es el `code` de `/agencies` (ej. `B0107`) |
| `shipping.address.*` | Obligatorio solo para `"D"`. Ojo: el ejemplo de sucursal igual manda dirección — **probar con `null` y ver si la acepta** |
| `floor` / `apartment` | Se truncan a 3 caracteres |
| `weight`, `height`, `length`, `width` | **Enteros.** Alto/ancho/largo entre 0 y 255 (según los mensajes de error) |
| `declaredValue` | Acepta decimales (`500.00`) |

**200 OK:** `{ "createdAt": "2022-06-07T16:15:04.996-03:00" }` — **eso es todo. No hay ID.**

### 3.6 Errores

```json
{ "code": "402", "message": "Error ..." }
```

| Código | Significado |
|---|---|
| 400 | Falta un parámetro obligatorio |
| 401 | Token inválido o vencido |
| **402** | **Los parámetros son válidos pero la operación falló.** Es el error de negocio más común — el detalle real viene en `message` |
| 403 | Sin permisos |
| 404 | Recurso inexistente |
| 409 | Conflicto (idempotencia) |
| 429 | Rate limit — el manual recomienda backoff exponencial |
| 50x | Error de Correo |

**Mensajes de negocio conocidos** (mapear a español claro en `errors.ts`):

```
La orden ya fue importada con anterioridad.
Peso no valido  /  El peso debe ser mayor a 0  /  El peso excede el maximo permitido para el producto
Tipo de entrega invalido
Verifique la sucursal de destino
Tipo de encomienda [TENC] no valida
no se encontro datos de remitente - id :...
El codigo Postal del emisor debe tener valor.
La provincia del emisor debe tener valor.
La provincia es invalida.
El alto debe estar entre 0 y 255.
El ancho debe estar entre 0 y 255.
El largo debe estar entre 0 y 255.
Cliente FAP no identificado {customerId}
Customer ID no valido
```

### 3.7 Códigos de provincia

```
A Salta          B Buenos Aires    C CABA            D San Luis
E Entre Ríos     F La Rioja        G Sgo. del Estero H Chaco
J San Juan       K Catamarca       L La Pampa        M Mendoza
N Misiones       P Formosa         Q Neuquén         R Río Negro
S Santa Fe       T Tucumán         U Chubut          V Tierra del Fuego
W Corrientes     X Córdoba         Y Jujuy           Z Santa Cruz
```

No existen I, Ñ ni O. Exponer en `provinces.ts` como const tipada, con helpers en ambos sentidos.

### 3.8 Inconsistencias del manual (esperarlas)

- El ejemplo de `/register` incluye `password` y `address.locality`, que **no figuran en la tabla de campos**.
- La descripción de `shipping.deliveryType` está mal redactada (*«"D" (no "S") envío a domicilio»*). Lo correcto: **D = domicilio, S = sucursal**.
- El ejemplo de import a sucursal manda `address` completa aunque la doc diga que solo hace falta para domicilio.
- Algunos ejemplos JSON traen comas finales inválidas.

**La fuente de verdad es lo que devuelve la API, no el manual.** Por eso se guardan todas las respuestas crudas.

---

## 4. Estructura de archivos a crear

```
services/micorreo-api-worker/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore                  # .env, artifacts/, node_modules, dist
├── README.md                   # se completa CON LOS RESULTADOS REALES
├── artifacts/                  # gitignored
│   ├── registry.json           # imports realizados (no hay cancelación por API)
│   ├── agencies/
│   └── responses/              # request/response crudos de cada llamada
└── src/
    ├── config.ts               # env + validación zod
    ├── types.ts
    ├── errors.ts               # MiCorreoApiError + traducción de mensajes
    ├── http-client.ts
    ├── token-store.ts          # cachea el JWT y lo renueva
    ├── registry.ts
    ├── micorreo/
    │   ├── auth.ts             # /token
    │   ├── customer.ts         # /users/validate
    │   ├── agencies.ts
    │   ├── rates.ts
    │   └── shipping.ts         # /shipping/import
    ├── domain/
    │   ├── provinces.ts
    │   └── build-import.ts     # datos de negocio -> payload + validación zod
    └── scripts/
        ├── cli-token.ts
        ├── cli-customer.ts
        ├── cli-agencies.ts
        ├── cli-rates.ts
        └── cli-import.ts
```

### Convenciones (copiar de `services/micorreo-worker`)

`"type": "module"`, imports con extensión `.js`, `dotenv` cargado desde `config.ts` con `path.join(workerRoot, '.env')`, `zod` para validar env y payloads, `tsx` para dev. **Sin dependencias pesadas: no instalar axios ni playwright.** Alcanza con el `fetch` nativo de Node 20 — acá **no hay GET con body**, así que no hace falta `node:https` crudo.

### `package.json` — scripts

```json
{
  "token:get":        "tsx src/scripts/cli-token.ts",
  "customer:resolve": "tsx src/scripts/cli-customer.ts",
  "agencies:list":    "tsx src/scripts/cli-agencies.ts",
  "rates:quote":      "tsx src/scripts/cli-rates.ts",
  "shipping:import":  "tsx src/scripts/cli-import.ts",
  "build":            "tsc -p tsconfig.json"
}
```

---

## 5. Variables de entorno (`.env.example`)

```bash
# --- Ambiente: QA por defecto. Cambiar a producción a conciencia ---
MICORREO_API_BASE_URL=https://apitest.correoargentino.com.ar/micorreo/v1
MICORREO_ENV_LABEL=QA

# --- Credenciales de API (Basic Auth para /token) ---
MICORREO_API_USER=
MICORREO_API_PASSWORD=

# --- Credenciales de la cuenta MiCorreo (para /users/validate) ---
MICORREO_ACCOUNT_EMAIL=
MICORREO_ACCOUNT_PASSWORD=

# --- customerId: si se conoce, se usa directo y se saltea /users/validate ---
MICORREO_CUSTOMER_ID=

# --- Seguridad: en false, ningún script importa envíos ---
MICORREO_ALLOW_IMPORT=false

# --- CP de origen (desde dónde despachamos) ---
MICORREO_ORIGIN_POSTAL_CODE=

# --- Valores por defecto para pruebas (mínimos) ---
MICORREO_TEST_WEIGHT_G=100
MICORREO_TEST_HEIGHT_CM=5
MICORREO_TEST_WIDTH_CM=10
MICORREO_TEST_LENGTH_CM=15
MICORREO_TEST_DECLARED_VALUE=1000

MICORREO_TIMEOUT_MS=30000
```

`config.ts` valida con zod y **falla al arrancar** si faltan las credenciales de API. **Todo script imprime en su primera línea el `MICORREO_ENV_LABEL` y el host**, para que nunca haya duda de contra qué ambiente se está corriendo.

---

## 6. Módulos a implementar

### `http-client.ts`

- Inyecta `Authorization: Bearer <token>` pidiéndoselo a `token-store`.
- Timeout por `MICORREO_TIMEOUT_MS`.
- **Vuelca cada request/response a `artifacts/responses/<timestamp>-<endpoint>.json`**, con credenciales y token redactados. Esto es lo que permite entender la API de verdad.
- Lanza `MiCorreoApiError` con `code`, `message` y body crudo en status >= 400.
- **Un único reintento**, y solo ante un 401 (token vencido): renueva el token y reintenta una vez. **Ningún otro reintento automático** — para aprender la API queremos ver el primer error tal cual. Ante un 429, no reintentar: informar y salir.

### `token-store.ts`

Cachea el token en memoria y en `artifacts/.token.json`, con su `expires`. Renueva si está vencido o **le faltan menos de 5 minutos**. Expone `getToken()`. **El archivo de token va al `.gitignore`.**

### `domain/build-import.ts`

Toma un objeto de negocio legible y devuelve el payload. Acá vive toda la conversión y validación: kg→gramos, redondeo a enteros, provincia→código, reglas condicionales por `deliveryType`. Validar con zod **antes** de llamar, con mensajes que digan qué campo está mal.

### `registry.ts`

`artifacts/registry.json` — array de:

```ts
{ extOrderId: string; orderNumber: string | null; createdAt: string;
  deliveryType: 'D' | 'S'; agency: string | null; destinatario: string;
  env: string; notes?: string }
```

Escritura atómica (temp + rename). Funciones: `registrarImport()`, `listar()`.

> Como **no hay cancelación por API**, este archivo es el inventario de lo que hay que dar de baja manualmente en el portal. Tratarlo en serio.

---

## 7. Los scripts CLI

Todos: args con `node:util parseArgs`, resumen legible por consola (no JSON crudo), detalle en `artifacts/`, exit code ≠ 0 si falla, y el ambiente impreso en la primera línea.

### `token:get` 🟢

Sin args. Pide el token y muestra que se obtuvo, cuándo vence y **cuánto dura en minutos**. **No imprimir el token completo** — solo los primeros y últimos 6 caracteres.

### `customer:resolve` 🟢

Llama `/users/validate` con las credenciales de la cuenta y muestra el `customerId`. Sugiere guardarlo en `MICORREO_CUSTOMER_ID` para no repetir la llamada.

### `agencies:list` 🟢

```bash
npm run agencies:list -- --provincia=B --servicio=pickup_availability
```

Guarda el JSON crudo en `artifacts/agencies/<provincia>.json` y muestra una tabla con `code`, nombre, localidad, CP y los dos flags de servicio. Al final: total y **cuántas tienen `pickupAvailability: true`**.

Con `--todas`, itera las 24 provincias **secuencialmente con una pausa breve entre llamadas** (por el 429) y arma un consolidado en `artifacts/agencies/_all.json`.

### `rates:quote` 🟢

```bash
npm run rates:quote -- --cp-destino=1704 --peso=2500 --alto=10 --ancho=20 --largo=30
```

`--cp-origen` por defecto de `MICORREO_ORIGIN_POSTAL_CODE`. Si no se pasa `--tipo`, **omitir `deliveredType` para traer las dos cotizaciones** y mostrarlas comparadas. Mostrar `validTo` y cuánto falta para que venza.

Validar límites antes de llamar (peso 1–25000 g, lados ≤150 cm) y explicar el problema sin gastar una llamada.

> Este es el script con más valor inmediato: es lo que nos va a decir cuánto sale realmente cada envío.

### `shipping:import` 🔴

```bash
npm run shipping:import -- --tipo=D --nombre="Juan Perez" --email=juan@mail.com \
  --calle="Av Siempreviva" --altura=742 --ciudad="Springfield" \
  --provincia=B --cp=1425 --confirmar
```

Flujo obligatorio:

1. Armar el payload y **validarlo con zod**.
2. **Cotizarlo primero con `/rates`** y mostrar el precio — así se sabe qué se está por importar.
3. Imprimir el payload completo formateado, y **el `extOrderId` generado** (`TEST-<timestamp>`).
4. Si falta `--confirmar` o `MICORREO_ALLOW_IMPORT !== 'true'` → imprimir
   `⚠️ NO SE IMPORTÓ NADA (falta --confirmar o MICORREO_ALLOW_IMPORT=true)` y salir con 0.
5. Si está confirmado → mostrar una advertencia de que **esto no se puede deshacer por API** y llamar.
6. **Escribir en el registry ANTES de imprimir nada.**
7. Mostrar el `createdAt` y recordar: *"para darlo de baja hay que entrar al portal de MiCorreo"*.

Con `--tipo=S`, exigir `--sucursal=<code>`. Probar primero mandando `shipping.address` en `null` y documentar si la API lo acepta.

---

## 8. Orden de implementación

Implementar y **verificar corriendo** en este orden. No avanzar sin que el paso anterior funcione:

1. **Andamiaje** — `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `config.ts`.
2. **`http-client.ts` + `errors.ts` + `token-store.ts`**, con el volcado a `artifacts/responses/`.
3. **`token:get`** → 🎯 **primer hito: las credenciales funcionan.**
4. **`customer:resolve`** → 🎯 **segundo hito: tenemos `customerId`.** Sin esto no anda ningún otro endpoint.
5. **`agencies:list`** → datos reales; insumo directo para la Fase 2.
6. **`rates:quote`** → 🎯 **tercer hito: precios reales.** Probar domicilio, sucursal y ambos.
7. **`provinces.ts` + `build-import.ts` + validación zod + `registry.ts`.**
8. **`shipping:import` SIN `--confirmar`** — revisar el payload hasta que esté impecable.
9. **`shipping:import` con confirmación**, una sola vez, con el paquete más chico posible → 🎯 **cuarto hito: verificar que el envío aparece en el portal de MiCorreo.**
10. **`README.md`** con los hallazgos.

---

## 9. El README del worker (parte del entregable)

No es un README genérico: documenta **lo que realmente pasó**, que es el insumo para diseñar la Fase 2.

- Cómo configurar y correr cada script; advertencia sobre el ambiente.
- **Qué devolvió realmente cada endpoint** (respuestas reales, datos personales tacheados).
- **Cuánto dura el token** medido de verdad.
- **Si `sender` en `null` funcionó** o hubo que completarlo.
- **Si un import a sucursal acepta `address: null`.**
- **Qué `productType` / `productName` devolvió `/rates`** y a qué precios.
- **Si `/agencies` anduvo con query params** o hubo que mandarlo distinto.
- **Los mensajes de error 402 que aparecieron** y qué los causó.
- **Cómo se ve el envío importado en el portal de MiCorreo** y qué pasos manuales faltan para pagar e imprimir la etiqueta. ← **Lo más importante para planificar la Fase 2.**

---

## 10. Criterios de aceptación

- [ ] `npm run token:get` obtiene un JWT e informa su vencimiento, sin imprimirlo completo.
- [ ] `npm run customer:resolve` devuelve un `customerId` real.
- [ ] `npm run agencies:list -- --provincia=B` trae sucursales reales y las guarda.
- [ ] `npm run rates:quote` devuelve precios reales para domicilio y sucursal.
- [ ] `npm run shipping:import` **sin `--confirmar` no hace ninguna llamada de import** (verificable: no aparece nada nuevo en `artifacts/responses/` para ese endpoint).
- [ ] Con `MICORREO_ALLOW_IMPORT=false`, no se importa aunque se pase `--confirmar`.
- [ ] Un import exitoso aparece en `registry.json` **antes** de que el script imprima el resultado.
- [ ] Un 401 por token vencido se resuelve solo (renueva y reintenta una vez).
- [ ] Un error 402 se muestra en español entendible, nunca como volcado crudo.
- [ ] Ningún script imprime el token completo ni las contraseñas; `artifacts/responses/` tiene las credenciales redactadas.
- [ ] `npm run build` compila sin errores de TypeScript.
- [ ] **`git status` no muestra archivos modificados fuera de `services/micorreo-api-worker/`.**
- [ ] `.env`, `artifacts/` y el token cacheado están gitignorados. **Ninguna credencial commiteada.**

---

## 11. Trampas conocidas

1. **No hay cancelación.** Un import es definitivo desde la API.
2. **`extOrderId` es único para siempre.** Reintentar con el mismo falla.
3. **Los números van como enteros**, no como strings (al revés que la otra API de Correo).
4. **El peso es en gramos**, máximo 25.000. Convertir si el origen está en kilos.
5. **`customerId` no sale del token.** Son dos identidades separadas.
6. **`/agencies` exige `provinceCode`.** No hay listado nacional en una sola llamada.
7. **El token vence** (~2h30m). Renovarlo, no pedir uno nuevo en cada llamada.
8. **402 no es "no autorizado"** — es un error de negocio. El detalle está en `message`.
9. **429 existe.** No martillar la API al iterar las 24 provincias.
10. **`expires` viene sin zona horaria.** Asumir `-03:00` y verificar.
11. **El manual tiene erratas reales** (ver 3.8). La API manda.

---

## 12. Qué viene después (contexto, NO implementar ahora)

- **Fase 2:** servidor HTTP en el worker + tablas `envios_correo_cotizaciones`, `envios_correo_importaciones`, `envios_correo_sucursales` (siguiendo el naming de `envios_andreani_*`).
- **Fase 3:** UI en la app — primero **mostrar el costo del envío al armar el pedido**, que es lo que esta API habilita y antes no teníamos.
- **Fase 4:** decidir qué pasa con `micorreo-worker`. **No se puede deprecar por ahora**: la API no genera etiquetas ni paga, así que la automatización del portal sigue haciendo falta.
