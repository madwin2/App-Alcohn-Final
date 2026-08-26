# Flujo portal Pymes Andreani (creación de link de pago)

Capturado manualmente (Ago 2026). Selectores en `src/andreani/*.ts` siguen estos pasos.

## Pasos

1. **Login** — Azure B2C (`andreanib2c.b2clogin.com`)
   - Email + Contraseña → "Iniciar sesión"
   - Sin Google SSO en el worker (solo user/pass)

2. **Home** — `pymes.andreani.com`
   - CTA **"Hacer un envío"** → es un **`<button>`** del hero
   - ⚠️ No clickear el link del footer (mismo texto) → `andreanionline.com` / `corporativo.andreani.com`

3. **¿Qué vas a enviar?**
   - Card **"Andreani envíos"**  
     _(El destinatario completa sus datos y abona)_

4. **¿Desde dónde vas a hacer tus envíos?**
   - Buscar: `ANDREANI_SUCURSAL_DESPACHO` = `Alberti 1254, Mar Del Plata`  
     _(No usar solo "Independencia" → cae en Córdoba)_
   - Elegir card `ANDREANI_SUCURSAL_NOMBRE` = **Sucursal Mar Del Plata** (av Independencia; fallback: Última seleccionada / Más cercana)
   - Click **Siguiente** (obligatorio; sin esto no avanza el formulario)

5. **Completá la información de tu envío**
   - Modal opcional **"Evitá demoras… → Entendido"** (no siempre sale; cerrar si aparece)
   - Servicio: Estandar
   - Alto / Ancho / Largo / Peso (grs)
   - Valor declarado + código descuento (`ANDREANI20`)
   - **"Finalizar"**

6. **Compartí tu link de envío** — `pymes.andreani.com/link-envio`
   - URL: `https://pymes.andreani.com/completa-tu-envio/...`
   - Botón **Copiar**
   - Para el siguiente: **"Hacer otro envío"**

## Paquete estándar (sello)

| Campo | Valor default |
|-------|---------------|
| Alto | 25 cm |
| Ancho | 8 cm |
| Largo | 8 cm |
| Peso | 1000 grs |
| Valor declarado | 40000 |
| Descuento | ANDREANI20 |

## Sesión

Playwright guarda `storageState` en `data/storage-state.json` tras login OK.
Si el portal pide 2FA/captcha, hacer un login manual visible (`ANDREANI_HEADLESS=false`) y reintentar.
