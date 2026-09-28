# SOP (esqueleto) · Control de calidad

> Frontera: [FR-04](../10-operational-boundaries/README.md#fr-04) · Preguntas: [Q-PROD-006](../14-open-questions/produccion-fabricacion.md#q-prod-006)

Lo que existe en Alcohn AI relacionado:
- Estado de fabricación **`Verificar`** (1 caso en la base) y **`Retocar`** (solo desde la revisión por sello de Programas, vista lista).
- Menú lateral **"Verificación"** deshabilitado (módulo no implementado).
- Flag `programa.verificado` y estado Aspire "Check".
- Rehacer con motivos: error en máquina, error de medida o vector, reclamos, daño en envío.

## Pasos

1. Fede **prueba cada sello en cuero** al sacarlo de la máquina, antes de marcar Hecho. `[REQUIERE INFORMACIÓN DEL EQUIPO: qué defectos se buscan]`
2. Defecto menor corregible → **Retocar**. Duda → **Verificar** (lo revisa Ventas). Defecto mayor → **Rehacer**.
3. No hay un control formal adicional ni módulo de Verificación por ahora.
4. **Alcohn AI**: registrar Rehacer con motivo desde Pedidos/Producción (así queda el historial y se avisa).
