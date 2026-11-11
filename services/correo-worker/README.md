# correo-worker — API Correo Argentino (Paq.ar v2)

Cliente HTTP + CLI local para probar la API de Correo Argentino **de punta a punta**, sin tocar la app.

Esta carpeta es la Fase 1: **no levanta servidor**. No hay tablas nuevas, no hay frontend. El mismo paquete se convierte después en el worker con HTTP y cron.

---

## ⚠️ Credenciales de PRODUCCIÓN

No hay entorno de test. **Cada envío que se cree es un envío real**, con posible impacto de facturación.

| Operación | Riesgo | Cómo está protegida |
|---|---|---|
| `auth:check`, `agencies:list`, `label:get`, `tracking:get` | Lectura | Se pueden correr sin ceremonia |
| `order:create`, `order:cancel`, `cleanup` | **Escritura real** | Requieren **las dos** cosas: `CORREO_ALLOW_WRITES=true` en `.env` **y** `--confirmar` en la línea de comandos |

Si falta cualquiera de las dos, el script **no llama a la API**, imprime el payload que hubiera enviado y sale 0. No hay modo simulación ni respuestas inventadas.

Todo envío creado se escribe en `artifacts/registry.json` **antes** de imprimir el TN. `npm run cleanup -- --confirmar` cancela los pendientes.

---

## Setup

```bash
cd services/correo-worker
cp .env.example .env
# Completar CORREO_API_KEY, CORREO_AGREEMENT y los datos del remitente
npm install
```

`CORREO_API_KEY` y `CORREO_AGREEMENT` son obligatorias: sin ellas cualquier script falla al arrancar.

Headers en todas las llamadas:

```
Authorization: Apikey <CORREO_API_KEY>
agreement: <CORREO_AGREEMENT>
```

La ruta base es `https://api.correoargentino.com.ar/paqar/v1/<endpoint>`.

Cada request/response se vuelca (con la API-Key tachada) en `artifacts/responses/`. `.env` y `artifacts/` están gitignorados.

---

## Scripts

```bash
npm run auth:check
npm run agencies:list -- --provincia=B --retiro=true
npm run tracking:get -- --tn=XXXX
npm run order:create -- --tipo=homeDelivery --nombre="Juan Perez" \
  --calle="Av Siempreviva" --altura=742 --localidad="Springfield" \
  --provincia=B --cp=1425
# recién cuando el payload se vea bien:
# CORREO_ALLOW_WRITES=true npm run order:create -- ... --confirmar

npm run label:get -- --tn=XXXX --formato=10x15
npm run order:cancel -- --tn=XXXX --confirmar
npm run cleanup -- --confirmar
```

Con `--tipo=agency` o `--tipo=locker` hace falta `--sucursal=<agency_id>` y no se pide dirección.

Paquetes de prueba: peso/medidas/valor salen de `CORREO_TEST_*` (mínimos). El peso es **en gramos**. `--peso-kg` se convierte.

---

## Resultados reales de las pruebas

> Datos personales tachados. Fecha: 2026-09-18.

### Auth — `GET /v1/auth`

La URL de producción responde. Con una API-Key dummy:

- HTTP **401**
- Body (igual al manual):

```json
{
  "timestamp": "2026-09-18T13:52:03-03:00",
  "status": 401,
  "error": "Account not found by apiKey",
  "message": "Account not found by apiKey",
  "path": "/v1/auth"
}
```

- `Content-Type: application/json;charset=ISO-8859-1`
- Delante hay **Imperva** (`x-cdn: Imperva`).
- El CLI traduce: *Credenciales inválidas (HTTP 401). La API-Key no fue reconocida. Revisá CORREO_API_KEY. Correo dijo: «Account not found by apiKey»*.

Falta correr `auth:check` con las credenciales reales (todavía no hay `.env` cargado). Éxito esperado: **HTTP 204 sin body**.

### Agencies — `GET /v1/agencies`

Pendiente (requiere API-Key válida). Anotar:

- si `stateId` acepta `AR-B` (ISO 3166-2) o la letra suelta `B`
- cuántas sucursales vuelven y cuántas tienen `pickup_availability: true`
- campos que vienen `null`

El CLI reintenta con la letra de 1 carácter si `AR-X` da 400.

### Tracking — `GET /v1/tracking`

El manual pide GET **con body**. `fetch` de Node no lo permite; el cliente usa `node:https`. Orden de prueba:

1. GET con body
2. GET con los TN como query params
3. POST al mismo path

El CLI imprime cuál variante funcionó. Probar primero contra un TN inexistente (es lectura).

Fechas: parsear ISO (`2017-06-27T10:00:00-03:00`) y el formato real (`28-06-2022 11:53`). `quantity: 0` + `event: []` = *sin movimientos todavía*, no es error.

Pendiente de correr con credenciales reales.

### Crear envío — `POST /v1/orders`

**Verificado en seco (2026-09-18):** `order:create` sin `--confirmar` arma el payload (todos los números van como string, `trackingNumber` vacío, `saleDate` en `YYYY-MM-DDTHH:mm:ss-03:00`) y **no hace ninguna llamada HTTP**. Idem con `--confirmar` si `CORREO_ALLOW_WRITES` no es `true`. `artifacts/responses/` no se tocó en esos corridos.

Anotar cuando se corra con confirmación:

- si el TN lo generó Correo (lo mandamos vacío) o hubo que enviarlo
- si el CP se aceptó con 4 dígitos o hace falta CPA largo
- qué `serviceType` funcionó (`CP` es el default)
- límites reales de peso y medidas de nuestro acuerdo

Ojo: el ejemplo `--provincia=B --cp=1425` **puede fallar** porque 1425 es CABA (`C`), no provincia de Buenos Aires (`B`). Correo valida CP contra provincia. Para una prueba real usar un par coherente (ej. Mar del Plata `7600` + `B`).

### Etiquetas — `POST /v1/labels`

Pendiente contra un TN real. El parser acepta `fileName`/`filename` y `result`/`status`. Cada ítem se evalúa por separado: HTTP 200 no significa que todos salieron. El PDF se guarda solo si los bytes empiezan con `%PDF`.

### Cancelar — `PATCH /v1/orders/{tn}/cancel`

Verificado en seco: sin el doble candado no llama a la API. Respuesta esperada en vivo: `{"codigo": 200, "mensaje": "..."}`. Solo funciona en preimposición.

---

## Discrepancias encontradas contra el manual

- Auth 401: el shape del error coincide con el manual. `path` en el body es `/v1/auth` (sin el prefijo `/paqar`).
- Respuestas JSON vienen en `charset=ISO-8859-1` (el manual no lo menciona). Con mensajes ASCII no rompe el parseo.
- (pendiente) GET `/v1/tracking` con body
- (pendiente) nombres de campos en `/v1/labels`
- (pendiente) formato de fechas de tracking
- (pendiente) `stateId` de `/v1/agencies`

---

## Criterios de esta fase

- Lectura contra producción: `auth:check` y `agencies:list`
- Escritura bloqueada por defecto
- Registry atómico para no perder TNs
- `npm run build` compila
- Nada de esto toca `src/app/envios`, ni `micorreo-worker`, ni tablas de Supabase
