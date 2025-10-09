🔒 Arquitectura & Organización — Guardrails (NO romper)

Mantener la página Pedidos 100% modular. Nada de archivos gigantes. Cualquier ajuste nuevo debe respetar estas reglas.

1) Estructura fija (no mover sin motivo)
src/
  app|pages/pedidos/
    index.tsx                // orquestador de la vista (máx. ~150 líneas)
  components/pedidos/
    Sidebar/
      Sidebar.tsx
      SidebarItem.tsx
    Header/
      OrdersHeader.tsx
      StateChips.tsx
      PreviewsToggle.tsx
    Table/
      OrdersTable.tsx        // TanStack Table wrapper
      columns.tsx            // definición de columnas
      cells/                 // 1 archivo por celda compleja
        CellFecha.tsx
        CellCliente.tsx
        CellContacto.tsx
        CellDisenio.tsx
        CellTipo.tsx
        CellSena.tsx
        CellEnvio.tsx
        CellValor.tsx
        CellRestante.tsx
        CellFabricacion.tsx
        CellVenta.tsx
        CellEnvioEstado.tsx
        CellSeguimiento.tsx
        CellBase.tsx
        CellVector.tsx
        CellFoto.tsx
    Filters/
      FiltersDialog.tsx
      FiltersForm.tsx
    Sorter/
      SorterDialog.tsx
      SortCriteria.tsx
      FabricationOrderDnD.tsx
    NewOrder/
      NewOrderDialog.tsx
      NewOrderForm.tsx
  lib/
    state/orders.store.ts    // zustand (filtros/orden/previews)
    utils/format.ts          // money/date/phone
    mocks/orders.mock.ts     // datos de demo
    types/orders.ts          // enums + interfaces (si no están ya)

2) Reglas duras (MUST / MUST NOT)

MUST: 1 responsabilidad por componente.

MUST: tipado estricto (TS), props explícitas con interfaces.

MUST: celdas de tabla complejas en components/pedidos/Table/cells/*.

MUST: lógica de formato en utils/format.ts (no en los JSX).

MUST: estado UI en Zustand (orders.store.ts). Nada de useState globales desperdigados.

MUST: formularios con React Hook Form + Zod.

MUST: accesibilidad básica (roles, aria-*, foco en diálogos).

MUST: scroll horizontal si no entran columnas; headers sticky.

MUST NOT: archivos > 250 líneas (excepción: columns.tsx hasta ~350).

MUST NOT: lógica de negocio/formatos dentro del JSX.

MUST NOT: prop drilling profundo; si hace falta, crear context local o hook.

MUST NOT: duplicar enums o tipos. Importar desde types/orders.ts.

3) Patrones que quiero (Quality bar)

Hooks locales para piezas reutilizables:

useOrdersColumns() en Table/columns.tsx.

useFabricationBadges() para colores/labels.

useFilePreview() para miniaturas y toggles.

Funciones puras para sorting/filters en /lib/utils (testeables).

Presentational vs Container:

Container (OrdersTable.tsx) orquesta tabla y estados;

Presentational (Cell*.tsx) SOLO UI + eventos por props.

4) Accesibilidad & UX

Dialogs: focus trap, aria-labelledby, aria-describedby.

Controles: Tooltip con descripciones claras.

Teclado: navegación en tabla y cierre de diálogos con Esc.

Colores: contraste suficiente (tema oscuro).

5) Rendimiento

Evitar renders innecesarios: memorizar celdas (memo) y useCallback donde corresponda.

Virtualización si hay >100 filas (TanStack + react-virtual).

Imágenes de previews: tamaño fijo 40x40, loading="lazy".

6) Check de integridad antes de terminar (Acceptance)

 Sidebar expandible con labels + perfil abajo.

 Header con buscador, chips por estado, toggle de previews, Filtros, Ordenar, +Nuevo.

 Tabla TanStack: 16 columnas, hover fila, scroll horizontal, headers sticky.

 Celdas complejas en archivos separados (Cell*.tsx).

 Badges de SaleState: SEÑADO=amarillo, FOTO_ENVIADA=azul, TRANSFERIDO=verde, DEUDOR=rojo.

 FiltersDialog y SorterDialog usan Zustand.

 NewOrderDialog con RHF+Zod; calcula restante en tiempo real; subidas mock.

 Utilidades de formato centralizadas en utils/format.ts.

 Tipos y enums en types/orders.ts.

 Ningún archivo supera los límites indicados.

7) Estilo de código

ESLint + Prettier (semis consistentes, comillas simples o dobles uniformes).

Nombres de archivos PascalCase para componentes, camelCase para helpers.

Comentario 1–2 líneas al inicio de cada componente: qué hace y qué no hace.

8) Qué hacer si pedís un cambio grande

No metas todo en index.tsx.

Crear nuevo subcomponente o hook y conectarlo.

Si una celda crece, extraer subcomponentes internos (ej. CellEnvio/CarrierPill.tsx).

Instrucción final para el agente:
“Aplicá las correcciones solicitadas sin romper estos guardrails. Si alguna modificación requiere violarlos, proponé la refactorización necesaria (archivo nuevo o mover lógica) en un diff claro.”