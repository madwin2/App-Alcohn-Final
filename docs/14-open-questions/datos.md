# Preguntas abiertas — Datos

### Q-DAT-001
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se quiere normalizar los datos históricos (órdenes con `estado_orden='Seguimiento Enviado'`, sin empresa de envío, sellos con `programa_nombre` sin programa, estado `Prioridad`)?
- **Impacto**: medio (reportes, stock, automatizaciones).
- Respuesta: Creo que no. Por lo menos no por ahora.

### Q-DAT-002
- **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Hay clientes duplicados (mismo teléfono con distintos formatos, o distintas personas con el mismo teléfono)? ¿Cuál es la clave de cliente para el negocio?
- **Evidencia**: `telefono` sin UNIQUE; búsqueda por variantes.
- **Impacto**: medio.
- Respuesta: Puede ser, no creo. Pero esto no seria un problema. No es muy necesario darle bola ahora.
