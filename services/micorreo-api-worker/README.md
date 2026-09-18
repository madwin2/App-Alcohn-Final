# micorreo-api-worker — API MiCorreo (Correo Argentino)

Cliente HTTP + CLI local para la **API MiCorreo**: token JWT, `customerId`, sucursales, cotización e importación.

Fase 1: **sin servidor HTTP**. No toca el frontend, ni `services/micorreo-worker` (Playwright, productivo), ni tablas.

Reemplaza `PLAN_INTEGRACION_CORREO_API_FASE_1.md` (Paq.ar v2). Esa API pide API-Key + agreement. **Las credenciales que dio Correo son de esta API.**

---

## ⚠️ Escritura irreversible

`POST /shipping/import` crea un envío real en MiCorreo. **No hay endpoint para cancelar.** La baja es a mano en el portal.

`extOrderId` es único: reintentar el mismo da *"La orden ya fue importada con anterioridad"*. En pruebas se usa `TEST-<timestamp>`.

`/register` **no está implementado**.

`shipping:import` exige **las dos** cosas: `MICORREO_ALLOW_IMPORT=true` y `--confirmar`. Si falta alguna, imprime el payload y **no llama** a `/shipping/import`.

Cada import exitoso se anota en `artifacts/registry.json` antes de imprimir.

---

## Setup

```bash
cd services/micorreo-api-worker
cp .env.example .env
npm install
```

Hacen falta **dos pares** de credenciales:

| Variable | Qué es |
|---|---|
| `MICORREO_API_USER` / `MICORREO_API_PASSWORD` | Basic Auth de `/token`. Las que dio Correo (usuario API). |
| `MICORREO_ACCOUNT_EMAIL` / `MICORREO_ACCOUNT_PASSWORD` | Cuenta del **portal** MiCorreo, para `/users/validate`. **No son el usuario API.** Hipótesis: las mismas que `MICORREO_USER` / `MICORREO_PASSWORD` del worker Playwright. |

El `.env.example` apunta a **QA**. La cuenta de portal que usamos es de **producción**: hay que poner `MICORREO_API_BASE_URL=https://api.correoargentino.com.ar/micorreo/v1` y `MICORREO_ENV_LABEL=PROD`. Cada script imprime ambiente y host en la primera línea.

---

## Scripts

```bash
npm run token:get
npm run customer:resolve
npm run agencies:list -- --provincia=B --servicio=pickup_availability
npm run agencies:list -- --todas
npm run rates:quote -- --cp-destino=1704 --peso=100 --alto=5 --ancho=10 --largo=15
npm run shipping:import -- --tipo=D --nombre="Juan Perez" --email=juan@mail.com \
  --calle="Av Siempreviva" --altura=742 --ciudad="Springfield" \
  --provincia=B --cp=1425
npm run shipping:import -- --tipo=S --nombre="Juan Perez" --email=juan@mail.com \
  --sucursal=B0900 --provincia=B --cp=7600
```

Esta API **no genera etiquetas ni tracking number**. Importa el envío; el pago y el rótulo siguen en el portal (hoy: `micorreo-worker`).

---

## Resultados reales (2026-09-18)

### Token — `POST /token` 🎯

QA y PROD: **HTTP 200** con el mismo usuario API.

Body real:

```json
{ "expire": "2026-09-18 16:46:11", "token": "eyJ0eX…(redactado)" }
```

- El campo se llama **`expire`**, no `expires` como dice el manual. El cliente acepta ambos.
- `expire` viene **sin zona**: `YYYY-MM-DD HH:mm:ss`. Asumir `-03:00` coincide con el `exp` del JWT.
- **Duración medida: 150 minutos (2 h 30 min).** El JWT trae `exp - iat = 9000 s`.
- Claims del JWT (sin secretos): `sub` = usuario API, `aud` = `Correo Argentino`, `iss` = `CORASA`, `member of` = `ApiMiCorreoTest`. **No hay `customerId`.**
- El CLI imprime solo `eyJ0eX…xxxxxx`.
- Stack: JBoss-EAP/7 + Undertow + Imperva.

`fetch` de Node **no sirve** para este POST vacío: o se cuelga (sin `Content-Length`) o responde **415** (si manda `Content-Type: text/plain`). El cliente usa `node:https` y POST con `Content-Length: 0` sin Content-Type.

El caché de token (`artifacts/.token.json`) incluye `apiBaseUrl`. Un JWT de QA **no** sirve en PROD (reutilizarlo dio `ECONNRESET`).

### customerId — `POST /users/validate` 🎯

El usuario de API **no** es una cuenta de portal: `/users/validate` con ese usuario respondió **HTTP 406** `{ "code": 406, "message": "Usuario no valido o inexistente" }` (el manual documenta 404).

Con la cuenta del portal, en **PROD**: **HTTP 200**, `customerId` **`0000879709`**, `createdAt` **2020-11-21**.

La misma cuenta en **QA** da 406. Es una cuenta de producción.

Con `MICORREO_CUSTOMER_ID` cargado, los scripts de sucursales / cotización / import no vuelven a llamar a `/users/validate`.

### Agencies — `GET /agencies` 🎯

Query params **funcionan**: `customerId` + `provinceCode` (obligatorios) y `services=pickup_availability`.

Provincia **B** (Buenos Aires), pickup: **1317 sucursales**, todas con `pickupAvailability: true`. El `postalCode` de cada sucursal viene en **CPA** (ej. `B7600GTQ`), no en 4 dígitos.

Mar del Plata: código **`B0900`** (nombre MAR DEL PLATA).

`POST /agencies` → **405**. Es GET.

La primera GET a veces vuelve HTML `Loading` (challenge de Imperva). El cliente reintenta una vez; con `User-Agent: AlcohnMiCorreoCli/0.1` la segunda suele ser 200.

`--todas` (24 provincias) **no se corrió**.

### Rates — `POST /rates` 🎯

HTTP **202** (no 200) con body JSON. El cliente trata cualquier 2xx como éxito.

Enteros en gramos y cm. CP de **4 dígitos aceptado** (origen `7600`, destino `1704` o `7600`).

Origen 7600 → destino 1704, 100 g, 5×10×15 cm (PROD, 2026-09-18):

| deliveredType | productType | productName | precio | plazo |
|---|---|---|---|---|
| S | CP | Correo Argentino Clasico | $ 6.480 | 2–5 días |
| S | EP | Correo Argentino Expreso | $ 8.915 | 1–3 días |
| D | CP | Correo Argentino Clasico | $ 8.955 | 2–5 días |
| D | EP | Correo Argentino Expreso | $ 12.314 | 1–3 días |

Misma ciudad (7600 → 7600) sale más barato. Si no se manda `deliveredType`, Correo devuelve **D y S**.

`validTo` **no es una ventana de cotización**. Coincide con el instante de la respuesta (`Date` GMT `17:25:12` ↔ `validTo` `2026-09-18T14:25:12.908-03:00`). Para Fase 2: cotizar e importar en el mismo momento; no cachear la tarifa.

`POST /rates` a veces corta con `socket hang up`. Reintentar.

### Import — dry-run (sin `--confirmar`) 🎯

`MICORREO_ALLOW_IMPORT=false`. El CLI armó el payload y **no llamó** a `POST /shipping/import` (no hay dump de import).

- `extOrderId` = `TEST-<timestamp>`
- `sender` y `originAddress` van **todos en null** (primera prueba, como pide el plan)
- domicilio: `agency: null` y `address` completo
- `productType` default **CP**
- peso/medidas: enteros (100 g, 5×10×15)

Sucursal dry-run (`--tipo=S --sucursal=B0900`, sin `--con-direccion`): `agency: "B0900"` y `address: null`. Origen=destino 7600, sucursal: CP $ 5.347 / EP $ 5.882.

**No se importó ningún envío real.** Cómo se ve en el portal: pendiente, hace falta `--confirmar` + `MICORREO_ALLOW_IMPORT=true`.

---

## Discrepancias contra el manual

- Token: `expire` vs `expires`.
- `/users/validate` usuario inexistente: **406**, no 404.
- POST `/token` es muy sensible a headers de body (ver arriba).
- `/agencies` es **GET con query params**. POST → 405. El CPA de sucursal es largo (`B7600GTQ`).
- `/rates` responde **HTTP 202**. `productType` real: `CP` / `EP`. CP de 4 dígitos alcanza. `validTo` ≈ ahora, no TTL.
- `sender` en null se arma en el payload; **no se confirmó** si Correo lo acepta al importar de verdad.
- sucursal con `address: null` y `agency: B0900`: payload OK; **sin POST real**.
- Imperva puede devolver HTML `Loading` o cortar el socket.
- (pendiente) cómo se ve el envío en el portal

---

## Criterios de esta fase

- [x] `token:get` obtiene JWT, informa vencimiento, no lo imprime completo
- [x] `customer:resolve` → `0000879709` en PROD (QA 406)
- [x] `agencies:list` GET query params, 1317 sucursales en B
- [x] `rates:quote` precios reales CP/EP, D/S
- [x] `shipping:import` sin `--confirmar` imprime payload y no importa
- [x] `MICORREO_ALLOW_IMPORT=false` por defecto
- [x] `npm run build` compila
- [x] `.env`, `artifacts/` y `.token.json` gitignorados
- [ ] import real (doble lock) — no se hace salvo pedido explícito
