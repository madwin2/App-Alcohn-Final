> # ⛔ DOCUMENTO OBSOLETO — NO IMPLEMENTAR
>
> Está basado en la **API Paq.ar v2**, que finalmente **no vamos a usar**.
> El plan vigente es **[`PLAN_INTEGRACION_MICORREO_API_FASE_1.md`](./PLAN_INTEGRACION_MICORREO_API_FASE_1.md)** (API MiCorreo).
> Se conserva solo como referencia histórica.

---

# Plan de implementación — Integración API Correo Argentino (Paq.ar v2) — FASE 1

> **Destinatario:** Cursor.
> **Objetivo de esta fase:** poder probar y entender la API de Correo Argentino de punta a punta desde una CLI local, sin tocar la app.
> **Resultado esperado:** un paquete nuevo `services/correo-worker` con scripts que permitan validar credenciales, listar sucursales, crear un envío, bajar su etiqueta en PDF, trackearlo y cancelarlo.

---

## 0. ⛔ Guardrails — leer antes de escribir una línea

### 0.1 NO tocar la página de Envíos

La página de Envíos **está en uso productivo**. En esta fase:

**PROHIBIDO modificar:**

- `src/app/envios/**`
- `src/components/envios/**`
- `src/lib/supabase/services/enviosHistorial.service.ts`
- `src/lib/supabase/services/enviosHistorialTabla.service.ts`
- `src/lib/supabase/mappers.ts`
- Cualquier archivo bajo `src/` — **esta fase no toca el frontend en absoluto**
- `services/micorreo-worker/**` — sigue funcionando, no se toca ni se deprecia todavía
- Cualquier tabla existente de Supabase (`ordenes`, `envio_eventos`, `envios_andreani_*`, etc.)
- Migraciones de base de datos — **esta fase no crea ni modifica tablas**

**Todo el trabajo de esta fase vive dentro de `services/correo-worker/`. Ese directorio es nuevo y no existe nada más que tocar.**

### 0.2 ⚠️ Solo tenemos credenciales de PRODUCCIÓN

No hay entorno de test. **Cada envío que se cree es un envío real** en el sistema de Correo Argentino, con posible impacto de facturación.

Esto no es negociable y define el diseño de toda la CLI:

| Regla | Implementación |
|---|---|
| **Las operaciones de lectura son libres** | `auth`, `agencies`, `labels`, `tracking` se pueden correr sin ceremonia |
| **Las operaciones de escritura están bloqueadas por defecto** | `order:create` y `order:cancel` requieren **dos** condiciones simultáneas: la variable `CORREO_ALLOW_WRITES=true` en `.env` **y** el flag `--confirmar` en la línea de comandos. Sin ambas, el script imprime el payload que *hubiera* enviado y termina con exit 0 |
| **Todo envío creado queda registrado** | Cada alta exitosa se escribe inmediatamente en `artifacts/registry.json` **antes** de imprimir nada por pantalla. Es la red de seguridad: si algo falla después, el TN no se pierde |
| **Todo envío de prueba se cancela** | Existe un script `cleanup` que cancela todos los TN del registry que no estén cancelados |
| **Los envíos de prueba son mínimos** | Valor declarado mínimo, peso mínimo, medidas mínimas. Configurables por env, nunca hardcodeadas en el script |

> **Nota para el implementador:** no agregues un "modo simulación" que invente respuestas falsas. Si no hay confirmación, el script **no llama a la API** y muestra el payload. Eso es todo. Un mock que finge éxito es peor que no tener nada.

---

## 1. Alcance de la Fase 1

### Sí

- Paquete `services/correo-worker` con cliente HTTP tipado contra la API.
- Scripts de CLI para ejercitar los 6 endpoints.
- Guardado en disco de las respuestas crudas (JSON) y de las etiquetas (PDF), para poder inspeccionarlas.
- Traducción de errores de Correo a mensajes entendibles.
- Un `README.md` en el worker con el resultado de las pruebas y las respuestas reales observadas.

### No (queda para Fase 2, no lo implementes)

- Servidor HTTP / endpoint `/orders` del worker.
- Tablas en Supabase.
- Cualquier cambio en el frontend.
- Cron de tracking.
- Reemplazar `micorreo-worker`.

---

## 2. Por qué un worker y no una Edge Function

Se sigue el patrón ya establecido en el repo (`andreani-worker`, `micorreo-worker`):

1. **IP fija.** Correo Argentino puede exigir whitelist de IP; Hetzner nos da una IP estable, las Edge Functions no.
2. **Credenciales fuera del navegador.** La API-Key nunca puede viajar al cliente.
3. **Iteración rápida.** `tsx` + CLI local es el ciclo más corto para explorar una API desconocida.
4. **Continuidad.** El mismo paquete se convierte después en el servicio con HTTP y cron, sin reescribir el cliente.

En Fase 1 **el worker no levanta servidor**. Es solo una librería + scripts. El `index.ts` con `createServer` llega en Fase 2.

---

## 3. Estructura de archivos a crear

```
services/correo-worker/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore                  # .env, artifacts/, node_modules, dist
├── README.md                   # se completa CON LOS RESULTADOS REALES al final
├── artifacts/                  # gitignored — salidas de las pruebas
│   ├── registry.json           # TNs creados (red de seguridad)
│   ├── agencies/               # listados de sucursales
│   ├── labels/                 # PDFs descargados
│   └── responses/              # respuestas crudas por llamada
└── src/
    ├── config.ts               # carga y valida env
    ├── types.ts                # tipos del dominio + de la API
    ├── errors.ts               # CorreoApiError + traducción de mensajes
    ├── http-client.ts          # transporte de bajo nivel
    ├── registry.ts             # alta/lectura/marcado de TNs en registry.json
    ├── correo/
    │   ├── auth.ts
    │   ├── agencies.ts
    │   ├── orders.ts           # create + cancel
    │   ├── labels.ts
    │   └── tracking.ts
    ├── domain/
    │   ├── provinces.ts        # tabla de códigos de provincia
    │   └── build-order.ts      # datos de negocio -> payload + validación zod
    └── scripts/
        ├── cli-auth.ts
        ├── cli-agencies.ts
        ├── cli-create-order.ts
        ├── cli-label.ts
        ├── cli-tracking.ts
        ├── cli-cancel.ts
        └── cli-cleanup.ts
```

### Convenciones (copiar de `services/micorreo-worker`)

- `"type": "module"`, imports con extensión `.js`.
- `dotenv` cargado desde `config.ts` con `path.join(workerRoot, '.env')`.
- `zod` para validar tanto el env como los payloads.
- `tsx` para correr los scripts en dev.
- Scripts de npm con el patrón `<accion>:<sufijo>`.
- Sin dependencias pesadas: **no instalar axios ni playwright**, alcanza con `node:https` y `node:http`.

### `package.json` — scripts

```json
{
  "auth:check":     "tsx src/scripts/cli-auth.ts",
  "agencies:list":  "tsx src/scripts/cli-agencies.ts",
  "order:create":   "tsx src/scripts/cli-create-order.ts",
  "order:cancel":   "tsx src/scripts/cli-cancel.ts",
  "label:get":      "tsx src/scripts/cli-label.ts",
  "tracking:get":   "tsx src/scripts/cli-tracking.ts",
  "cleanup":        "tsx src/scripts/cli-cleanup.ts",
  "build":          "tsc -p tsconfig.json"
}
```

---

## 4. Variables de entorno (`.env.example`)

```bash
# --- Credenciales (las provee el área Comercial de Correo Argentino) ---
CORREO_API_BASE_URL=https://api.correoargentino.com.ar/paqar
CORREO_API_KEY=
CORREO_AGREEMENT=

# --- Seguridad: en false, ningún script crea ni cancela envíos reales ---
CORREO_ALLOW_WRITES=false

# --- Parámetros del servicio ---
CORREO_SERVICE_TYPE=CP
CORREO_LABEL_FORMAT=10x15

# --- Remitente (nosotros) — fijo, se reutiliza en todas las altas ---
CORREO_SENDER_NAME=
CORREO_SENDER_STREET=
CORREO_SENDER_NUMBER=
CORREO_SENDER_FLOOR=
CORREO_SENDER_DEPARTMENT=
CORREO_SENDER_CITY=
CORREO_SENDER_STATE=            # código de 1 letra, ej: B
CORREO_SENDER_ZIP=
CORREO_SENDER_PHONE_AREA=
CORREO_SENDER_PHONE=
CORREO_SENDER_EMAIL=

# --- Valores por defecto para los paquetes de prueba (mínimos) ---
CORREO_TEST_WEIGHT_G=100
CORREO_TEST_HEIGHT_CM=5
CORREO_TEST_WIDTH_CM=10
CORREO_TEST_DEPTH_CM=15
CORREO_TEST_DECLARED_VALUE=1000

# --- Timeouts ---
CORREO_TIMEOUT_MS=30000
```

`config.ts` valida con zod y **falla ruidosamente al arrancar** si falta `CORREO_API_KEY` o `CORREO_AGREEMENT`.

---

## 5. Referencia de la API (usar esto, no inventar)

### 5.1 Autenticación — en todas las llamadas

```
Authorization: Apikey <CORREO_API_KEY>
agreement: <CORREO_AGREEMENT>
```

Literalmente la palabra `Apikey`, un espacio, y la key. La ruta base es `<CORREO_API_BASE_URL>/v1/<endpoint>`.

### 5.2 Endpoints

| # | Operación | Método | Ruta | Riesgo |
|---|---|---|---|---|
| 1 | Validar credenciales | GET | `/v1/auth` | 🟢 Lectura |
| 2 | Listar sucursales | GET | `/v1/agencies` | 🟢 Lectura |
| 3 | **Crear envío** | POST | `/v1/orders` | 🔴 **Escritura real** |
| 4 | Obtener etiquetas | POST | `/v1/labels` | 🟢 Lectura (POST por diseño de ellos) |
| 5 | Consultar tracking | GET | `/v1/tracking` | 🟢 Lectura |
| 6 | **Cancelar envío** | PATCH | `/v1/orders/{trackingNumber}/cancel` | 🔴 Escritura |

### 5.3 `GET /v1/auth`

Sin body. **Éxito = HTTP 204 sin contenido.** No devuelve JSON. No intentes parsearlo.

### 5.4 `GET /v1/agencies`

Query params, todos opcionales: `stateId` (ISO 3166-2), `pickup_availability` (bool), `package_reception` (bool).

Respuesta: array de sucursales. Campos relevantes:

```json
{
  "location": {
    "geolocation": { "latitude": "-32.370737", "longitude": "-61.360767" },
    "state_name": "SANTA FE", "city_name": "SAN GENARO",
    "street_name": "JUAN LAZARTE", "street_number": "1498",
    "zip_code": "S2146ZAA"
  },
  "schedule": "LUN A VIE 08.00 A 14.30",
  "agency_id": "SCQ",
  "agency_name": "SAN GENARO",
  "package_reception": true,
  "pickup_availability": true
}
```

`agency_id` es el valor que después va en `agencyId` al crear un envío. Muchos campos vienen `null` (`open_hours`, `maximum_package_dimensions`, `volumetric_capacity`, `status`) — **todos los tipos deben ser nullable**.

### 5.5 `POST /v1/orders` — crear envío

```json
{
  "sellerId": "<agreement>",
  "trackingNumber": "",
  "order": {
    "senderData": {
      "businessName": "...", "areaCodePhone": "", "phoneNumber": "",
      "areaCodeCellphone": "", "cellphoneNumber": "", "email": "", "observation": "",
      "address": {
        "streetName": "", "streetNumber": "", "cityName": "",
        "floor": "", "department": "", "state": "B", "zipCode": ""
      }
    },
    "shippingData": { "name": "...", "...": "misma forma que senderData" },
    "parcels": [{
      "dimensions": { "height": "5", "width": "10", "depth": "15" },
      "productWeight": "100",
      "productCategory": "Sellos",
      "declaredValue": "1000"
    }],
    "deliveryType": "homeDelivery",
    "agencyId": "",
    "saleDate": "2026-09-18T10:30:00-03:00",
    "serviceType": "CP",
    "shipmentClientId": ""
  }
}
```

**Reglas duras a codificar como validación zod antes de llamar:**

| Campo | Regla |
|---|---|
| **Todos los valores** | Van como **string**, incluso los numéricos |
| `trackingNumber` | Opcional. Si va vacío, Correo lo genera y lo devuelve. **Dejarlo vacío.** Máx 30 chars, único para siempre |
| `sellerId` | Si no se manda, completar con el `agreement` |
| `parcels` | Array, pero **solo se procesa el primer elemento**. Validar que tenga largo 1 y advertir si trae más |
| `productWeight` | Entero, **en gramos**, máx 5 dígitos (99999). Sin decimales ni comas |
| `dimensions.*` | Enteros, máx 3 dígitos, en cm. Los tres obligatorios |
| `declaredValue` | Entero, obligatorio |
| `deliveryType` | Solo `homeDelivery` \| `agency` \| `locker`. Case-sensitive |
| `agencyId` | Obligatorio si `deliveryType !== 'homeDelivery'`. Vacío si es a domicilio |
| `saleDate` | Formato exacto `YYYY-MM-DDTHH:mm:ss-03:00` |
| `serviceType` | Máx 2 letras. Usar `CORREO_SERVICE_TYPE` |
| `address.state` | Código de **1 letra** (ver 5.9). Ojo: distinto formato que `stateId` de `/agencies` |
| `address.zipCode` | **Correo valida CP contra provincia.** Si no coinciden → 400 |
| `shipmentClientId` | Documentado como **no funcional**. Mandar vacío y no depender de él |

Si `deliveryType !== 'homeDelivery'`, del destinatario solo se requiere `name`; la dirección no se valida.

`areaCodeCellphone` **se concatena** a `cellphoneNumber`. No duplicar el área dentro del número.

**Respuesta 200:** eco del pedido **+ el `trackingNumber` asignado**. Extraerlo y persistirlo en el registry inmediatamente.

### 5.6 `POST /v1/labels` — etiquetas

Query param `labelFormat`: `10x15` (térmica) | `label` | ausente (formato viejo). Aplica a **todo el lote**.

Body: array de `{ sellerId, trackingNumber }`.

Respuesta: array paralelo.

```json
[{ "trackingNumber": "...", "fileBase64": "JVBERi0x...", "fileName": "...pdf", "result": "OK" }]
```

⚠️ **Errores parciales.** HTTP 200 no garantiza que todas salieron. **Hay que revisar `result` de cada ítem** (`"OK"` vs `"ERROR: ..."`). Devolver un resultado por TN, nunca un booleano global.

⚠️ **El manual se contradice** sobre los nombres exactos (`fileName` vs `filename`, aparece también un campo `status`). **Guardar la respuesta cruda en `artifacts/responses/` y ajustar los tipos a lo que realmente devuelva.** Parsear de forma tolerante: aceptar ambas grafías.

### 5.7 `GET /v1/tracking`

⚠️ **Es un GET que lleva body** — un array de `{ trackingNumber }`. El `fetch` de Node **no permite** body en GET y tira error.

Implementarlo con `node:https` crudo, que sí lo permite. Si Correo lo rechaza, probar en este orden y **documentar en el README cuál funcionó**:

1. GET con body (lo que dice el manual)
2. GET con los TN como query params
3. POST al mismo path

Param opcional `extClient`: exactamente 3 caracteres numéricos, se concatena al agreement.

Respuesta: un objeto por TN con `quantity` y `event[]`. **`quantity: 0` con `event: []` significa "sin datos", no es un error.** Validar por ítem.

⚠️ Las fechas vienen inconsistentes: el spec dice ISO (`2017-06-27T10:00:00-03:00`) pero los ejemplos reales muestran `"28-06-2022 11:53"`. **Parsear ambos formatos.**

### 5.8 `PATCH /v1/orders/{trackingNumber}/cancel`

Sin body. El TN va en la URL (encodearlo). Solo funciona si el envío **no fue impuesto todavía**.

Respuesta 200 con forma distinta al resto: `{"codigo": 200, "mensaje": "..."}`.

### 5.9 Códigos de provincia (1 letra)

```
A Salta          B Buenos Aires    C CABA            D San Luis
E Entre Ríos     F La Rioja        G Sgo. del Estero H Chaco
J San Juan       K Catamarca       L La Pampa        M Mendoza
N Misiones       P Formosa         Q Neuquén         R Río Negro
S Santa Fe       T Tucumán         U Chubut          V Tierra del Fuego
W Corrientes     X Córdoba         Y Jujuy           Z Santa Cruz
```

No existen I, Ñ ni O. Exponer en `provinces.ts` como const tipada + helper `nombreProvincia(codigo)` y `codigoProvincia(nombre)`.

### 5.10 Errores

Forma común a 400 / 401 / 403:

```json
{ "timestamp": "...", "status": 400, "error": "Bad request", "message": "...", "path": "/v1/orders" }
```

- **400** — datos inválidos. `message` puede ser descriptivo en español, un error crudo de SQL Server, o **venir vacío**.
- **401** — API-Key inválida.
- **403** — el agreement no tiene permiso sobre ese servicio o sucursal.

`errors.ts` debe exponer una clase `CorreoApiError` que guarde **status, body crudo y path**, y un helper que traduzca los casos conocidos a español claro, con fallback genérico decente. **Nunca mostrar el `message` crudo como único texto.**

---

## 6. Módulos a implementar

### `http-client.ts`

Transporte de bajo nivel sobre `node:https`. Responsabilidades:

- Inyectar los dos headers de auth en toda llamada.
- Soportar **body en GET** (por eso no se usa `fetch`).
- Timeout por `CORREO_TIMEOUT_MS`.
- Devolver `{ status, headers, rawBody }` sin interpretar.
- **Volcar cada request/response a `artifacts/responses/<timestamp>-<endpoint>.json`**, con la API-Key redactada. Esto es lo que va a permitir entender la API de verdad.
- Lanzar `CorreoApiError` en status >= 400.
- Manejar 204 sin body sin romper.

**No agregar reintentos automáticos en esta fase.** Para aprender la API queremos ver el primer error tal cual, no que se lo trague un retry.

### `registry.ts`

`artifacts/registry.json` — array de:

```ts
{ trackingNumber: string; createdAt: string; deliveryType: string;
  destinatario: string; cancelled: boolean; cancelledAt: string | null; notes?: string }
```

Funciones: `registrarAlta()`, `marcarCancelado()`, `listarPendientes()`. Escritura atómica (archivo temporal + rename) para no corromperlo.

### `domain/build-order.ts`

Toma un objeto de negocio legible y devuelve el payload de la API. Acá vive **toda** la conversión y validación: kilos→gramos, número→string, provincia→código, fecha→formato de Correo. Validar con zod **antes** de llamar y fallar con un mensaje que diga qué campo está mal.

### `correo/*.ts`

Una función por operación, tipada, que usa `http-client` y devuelve tipos del dominio. Sin lógica de CLI, sin `console.log`.

---

## 7. Los scripts CLI

Todos: leer args con `node:util parseArgs`, imprimir un resumen legible (no JSON crudo por pantalla), guardar el detalle en `artifacts/`, y salir con exit code distinto de 0 si falló.

### `auth:check` 🟢

Sin args. Llama `/v1/auth`. Imprime OK si es 204, o el error traducido. **Este es el primer script que tiene que funcionar.**

### `agencies:list` 🟢

```bash
npm run agencies:list -- --provincia=B --retiro=true
```

Guarda el JSON completo en `artifacts/agencies/` y muestra por consola una tabla con `agency_id`, nombre, localidad, CP y si permite retiro. Al final imprime el total y **cuántas tienen `pickup_availability: true`** — ese es el número que importa para el selector de sucursal.

### `order:create` 🔴

```bash
npm run order:create -- --tipo=homeDelivery --nombre="Juan Perez" \
  --calle="Av Siempreviva" --altura=742 --localidad="Springfield" \
  --provincia=B --cp=1425 --confirmar
```

Flujo obligatorio:

1. Armar el payload y **validarlo con zod**.
2. Imprimir el payload completo, formateado.
3. Si falta `--confirmar` o `CORREO_ALLOW_WRITES !== 'true'` → imprimir
   `⚠️ NO SE ENVIÓ NADA (falta --confirmar o CORREO_ALLOW_WRITES=true)` y salir con 0.
4. Si está confirmado → llamar a la API.
5. **Escribir el TN en el registry ANTES de imprimir nada.**
6. Mostrar el TN bien visible y recordar: `para cancelarlo: npm run order:cancel -- --tn=<TN> --confirmar`.

Con `--tipo=agency` o `--tipo=locker`, exigir `--sucursal=<agency_id>` y no pedir dirección.

### `label:get` 🟢

```bash
npm run label:get -- --tn=XXXX --tn=YYYY --formato=10x15
```

Decodifica cada base64 a PDF en `artifacts/labels/<TN>.pdf`. Imprime una línea por TN con OK/ERROR y el motivo. **Verificar que el archivo empiece con `%PDF`** — si no, el base64 vino mal y hay que reportarlo, no guardar basura.

### `tracking:get` 🟢

```bash
npm run tracking:get -- --tn=XXXX
```

Muestra los eventos en orden cronológico. Si `quantity` es 0, decir *"sin movimientos todavía"*, no tratarlo como error.

### `order:cancel` 🔴

```bash
npm run order:cancel -- --tn=XXXX --confirmar
```

Mismo doble candado que `order:create`. Al cancelar OK, marcar `cancelled: true` en el registry.

### `cleanup` 🔴

Lista los TN pendientes del registry, los muestra, y **con `--confirmar`** los cancela uno por uno informando el resultado de cada uno. Es la red de seguridad para no dejar envíos reales colgados después de una sesión de pruebas.

---

## 8. Orden de implementación

Implementar y **verificar corriendo** en este orden. No avanzar al siguiente paso sin que el anterior funcione:

1. **Andamiaje** — `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `config.ts`.
2. **`http-client.ts` + `errors.ts`** — con el volcado a `artifacts/responses/`.
3. **`auth:check`** → 🎯 **primer hito real: confirmar que las credenciales funcionan.**
4. **`agencies:list`** → 🎯 **segundo hito: primeros datos reales.** Guardar el listado completo, es insumo directo para la Fase 2.
5. **`tracking:get`** — resolver acá el tema del GET-con-body, contra un TN inexistente (es lectura, no rompe nada). Documentar qué variante funcionó.
6. **`provinces.ts` + `build-order.ts` + validación zod.**
7. **`registry.ts`.**
8. **`order:create`** — primero **sin** `--confirmar` para revisar el payload. Solo cuando el payload se vea impecable, correrlo con confirmación.
9. **`label:get`** contra el TN recién creado → 🎯 **tercer hito: un PDF que se abre.**
10. **`tracking:get`** contra el TN real.
11. **`order:cancel`** sobre ese mismo TN → **cerrar el ciclo y no dejar el envío vivo.**
12. **`cleanup`.**
13. **`README.md`** con los hallazgos.

---

## 9. El README del worker (parte del entregable)

No es un README genérico. Tiene que documentar **lo que realmente pasó**, porque es lo que vamos a usar para diseñar la Fase 2:

- Cómo configurar y correr cada script.
- ⚠️ La advertencia de que son credenciales productivas.
- **Qué devolvió realmente cada endpoint** (respuestas reales, con datos personales tacheados).
- **Las discrepancias encontradas contra el manual** — nombres de campos, formatos de fecha, si el GET con body anduvo.
- **Los valores de `serviceType` que funcionaron** y los que dieron error.
- **Si el CP se cargó con 4 dígitos o en formato CPA largo.**
- **Los `statusId` de tracking observados.**
- Si el TN lo generó Correo o hubo que mandarlo.
- Los límites reales de peso y medidas que aceptó nuestro acuerdo.

---

## 10. Criterios de aceptación

- [ ] `npm run auth:check` devuelve OK contra producción.
- [ ] `npm run agencies:list` trae sucursales reales y las guarda en `artifacts/`.
- [ ] `npm run order:create` **sin `--confirmar` no hace ninguna llamada HTTP** (verificable: no aparece nada nuevo en `artifacts/responses/`).
- [ ] Con `CORREO_ALLOW_WRITES=false`, ningún script puede crear ni cancelar, aunque se pase `--confirmar`.
- [ ] Un envío creado aparece en `registry.json` **antes** de que el script imprima el TN.
- [ ] `npm run label:get` produce un PDF que abre correctamente y empieza con `%PDF`.
- [ ] `npm run tracking:get` muestra eventos y distingue "sin movimientos" de un error.
- [ ] `npm run order:cancel` cancela y actualiza el registry.
- [ ] `npm run cleanup` deja el registry sin pendientes.
- [ ] Un error 400 se muestra en español entendible, nunca como un volcado crudo.
- [ ] `npm run build` compila sin errores de TypeScript.
- [ ] **`git status` no muestra ningún archivo modificado fuera de `services/correo-worker/`.**
- [ ] `.env` y `artifacts/` están gitigorados. **Ninguna credencial commiteada.**

---

## 11. Trampas conocidas (no tropezar con estas)

1. **`fetch` de Node no soporta body en GET** → usar `node:https` para `/v1/tracking`.
2. **Todo va como string en el payload**, incluso números. Un `Number` ahí genera un 400 críptico.
3. **El peso es en gramos.** Si el dato de origen está en kilos, convertir. Cargar `2` pensando en kilos manda 2 gramos.
4. **`parcels` solo lee el primer elemento.** No intentar meter varios bultos en un envío.
5. **Provincia: 1 letra en `/orders`, ISO 3166-2 en `/agencies`.** Formatos distintos en endpoints distintos.
6. **`/v1/auth` devuelve 204 sin body.** Parsearlo como JSON revienta.
7. **`/v1/labels` tiene errores parciales.** HTTP 200 no significa éxito total.
8. **`message` de error puede venir vacío.** Loguear siempre el response completo.
9. **El TN es irrepetible.** Un envío cancelado no se "reactiva": se crea uno nuevo.
10. **El manual tiene inconsistencias reales** en la respuesta de `/labels` y en los formatos de fecha. **La fuente de verdad es lo que devuelve la API**, no el manual. Por eso guardamos todas las respuestas crudas.

---

## 12. Qué viene después (contexto, NO implementar ahora)

- **Fase 2:** servidor HTTP en el worker + tablas `envios_correo_ordenes`, `envios_correo_etiquetas`, `envios_correo_sucursales` (siguiendo el naming de `envios_andreani_*`), y cron de tracking.
- **Fase 3:** UI en la app, reutilizando los estados de envío que ya existen (`Sin envio` → `Hacer Etiqueta` → `Etiqueta Lista` → `Despachado` → `Seguimiento Enviado`).
- **Fase 4:** deprecar `micorreo-worker`.

El diseño funcional del flujo está en [`INTEGRACION_CORREO_ARGENTINO_FUNCIONAL.md`](./INTEGRACION_CORREO_ARGENTINO_FUNCIONAL.md).
