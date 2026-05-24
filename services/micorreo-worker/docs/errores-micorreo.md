# Catálogo de errores MiCorreo (error lab)

Pruebas controladas para ver **qué responde el portal** y qué debería hacer la app Alcohn.

**Última corrida:** 2026-05-24

## Mapeo worker → app

| `status` worker | HTTP | Estado en Alcohn | Cuándo |
|-----------------|------|------------------|--------|
| `ok` | 200 | **Etiqueta Lista** | Importación + Guardar OK |
| `data_error` | 422 | **Error Etiqueta** | Datos del CSV/envío rechazados |
| `system_error` | 503 | **Hacer Etiqueta** | Login caído, portal caído, timeout |

La app debería mostrar al operador `result.message` (texto literal de MiCorreo) cuando hay `data_error`.

## Qué valida MiCorreo (y qué no)

| Validación | ¿MiCorreo rechaza? | Mensaje típico |
|------------|-------------------|----------------|
| Código sucursal inexistente | **Sí** | `Verifique la sucursal de destino (Fila N)` |
| Código provincia inválido | **Sí** | `Provincia DESTINO XX no valida (Fila N)` |
| CP inexistente en padrón | **Sí** | `Ingrese CP de destino valido (CP:99999) (Fila N)` |
| CP no coincide con provincia | **No** | Acepta el envío (`Envíos procesados con éxito.`) |
| Localidad no coincide con provincia | **No** | Acepta el envío |
| CP de otra provincia + localidad MDP | **No** | Probado CP 7600 (Córdoba) + provincia B → OK |

**Implicación para Alcohn:** la coherencia CP / provincia / localidad hay que validarla **en la app antes** de llamar al worker. MiCorreo solo chequea que el CP exista, no que encaje con la provincia elegida.

## Escenarios probados

| ID | Archivo | Worker | Mensaje MiCorreo |
|----|---------|--------|------------------|
| `sucursal-invalida` | `error-sucursal-invalida.csv` | `data_error` | `El archivo contiene errores… Verifique la sucursal de destino (Fila 2)` |
| `domicilio-cp-provincia` | `error-domicilio-cp-provincia.csv` | `ok` ⚠️ | `Envíos procesados con éxito.` — **no es error en MiCorreo** |
| `cp-inexistente` | `error-cp-inexistente.csv` | `data_error` | `…Ingrese CP de destino valido (CP:99999) (Fila 2)` |
| `provincia-invalida` | `error-provincia-invalida.csv` | `data_error` | `…Provincia DESTINO ZZ no valida (Fila 2)` |

Pruebas adicionales (solo CLI, no en `scenarios.json`):

| Archivo | Worker | Notas |
|---------|--------|-------|
| `error-domicilio-localidad-provincia.csv` (Córdoba en prov. B) | `ok` | MiCorreo no valida localidad vs provincia |
| `error-cp-7600-provincia-b.csv` (CP Córdoba en prov. B) | `ok` | Mismo hallazgo |

## Respuesta JSON del worker (para la app)

### Sucursal inválida → Error Etiqueta

```json
{
  "status": "data_error",
  "message": "El archivo contiene errores, a continuación se visualiza el detalle:\nVerifique la sucursal de destino (Fila 2)",
  "httpStatus": 422,
  "details": {
    "portalText": "…",
    "rowCount": 1
  }
}
```

### CP inexistente → Error Etiqueta

```json
{
  "status": "data_error",
  "message": "El archivo contiene errores, a continuación se visualiza el detalle:\nIngrese CP de destino valido (CP:99999) (Fila 2)",
  "httpStatus": 422
}
```

### CP/provincia inconsistente → MiCorreo dice OK

```json
{
  "status": "ok",
  "message": "CSV aceptado por MiCorreo",
  "httpStatus": 200,
  "details": {
    "portalText": "Envíos procesados con éxito."
  }
}
```

La app **no puede confiar** en MiCorreo para detectar este caso. Validar en `/envios` con el padrón de localidades/CP.

## Cómo correr

Un escenario:

```powershell
cd services\micorreo-worker
npm run upload:test -- --file fixtures/errors/error-sucursal-invalida.csv
```

Todos del lab (solo los de `scenarios.json`):

```powershell
npm run upload:test:errors
```

Solo uno:

```powershell
npm run upload:test:errors -- --only sucursal-invalida
npm run upload:test:errors -- --only cp-inexistente
```

El reporte JSON queda en `artifacts/error-lab/report-*.json`.

## Integración sugerida en la app

1. **Antes del worker:** validar sucursal (código en padrón), CP vs provincia/localidad, campos obligatorios.
2. **POST al worker** con CSV ya validado.
3. **Según `status`:**
   - `ok` → `ETIQUETA_LISTA`
   - `data_error` → `ERROR_ETIQUETA` + toast/modal con `message` de MiCorreo
   - `system_error` → `HACER_ETIQUETA` (fallback manual en portal)

Patrón común en mensajes de error: prefijo fijo `El archivo contiene errores, a continuación se visualiza el detalle:` + detalle por fila `(Fila N)`.
