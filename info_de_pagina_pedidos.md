# 📘 Documento Técnico – Página “Pedidos”

## 🧩 Descripción General
La página **Pedidos** es el panel central de gestión de la empresa.  
Desde aquí se pueden visualizar, filtrar, crear y administrar todas las órdenes de compra con sus sellos asociados, además de seguir el estado de fabricación, venta y envío.

Cada **fila principal** representa una **Orden de compra** (que puede incluir uno o varios sellos).  
Al hacer clic en la fila, se **despliega** el detalle de los **sellos** que pertenecen a esa orden (en caso de tener solo un sello, no se despliega nada).

---

## 🧱 Estructura de la Tabla

| Nº | Columna | Tipo / Elemento | Descripción |
|----|----------|----------------|--------------|
| 1 | **Tareas del Pedido** | Subtabla / Lista | Conjunto de tareas internas del pedido. Cada tarea tiene estado (**Pendiente**, **En Progreso**, **Completado**). |
|   | **Fecha Límite** | Fecha | Fecha en la que debe estar listo el sello. Calcula los **días restantes** automáticamente. |
| 2 | **Fecha del Pedido** | Fecha | Fecha de creación de la orden. |
| 3 | **Cliente** | Texto | Muestra **nombre** arriba y **apellido** abajo. |
| 4 | **Contacto** | Ícono + texto | Ícono del **canal de contacto** (WhatsApp, Instagram, etc.) seguido del número. |
| 5 | **Tipo de Sello** | Ícono SVG | Muestra ícono del tipo de sello. Si es **Clásico**, no se muestra. |
| 6 | **Diseño** | Texto | Nombre del diseño arriba, **medida y notas** debajo. |
| 7 | **Empresa de Envío** | Select | Empresa encargada del envío. El valor del envío se **suma automáticamente** al total. |
| 8 | **Seña** | Numérico | Monto abonado por el cliente como adelanto. |
| 9 | **Valor** | Numérico | Precio del sello (sin envío). |
| 10 | **Restante** | Cálculo automático | (**Valor + Envío**) – **Seña**. |
| 11 | **Prioridad** | Booleano | Indica si el pedido es prioritario. |
| 12 | **Fabricación** | Select | Estado del proceso: *Pendiente*, *En Progreso*, *Hecho*. Al marcar **Hecho**, se habilita el campo siguiente (**Venta**). |
| 13 | **Venta** | Select | Estado comercial: *Pendiente*, *Transferido*, etc. Al marcar **Transferido**, se habilita el campo siguiente (**Envío**). |
| 14 | **Envío** | Select | Estado del envío: *Pendiente*, *Etiqueta Lista*, *Enviado*, *Entregado*. |
| 15 | **Seguimiento** | Texto | Número de guía del envío. |
| 16 | **Archivo Base** | Archivo | Imagen enviada por el cliente antes de vectorizar. |
| 17 | **Vector** | Archivo | Logo vectorizado (SVG/AI/PDF). |
| 18 | **Foto del Sello** | Archivo | Imagen final del sello terminado. |

---

## ⚙️ Lógica General
- Los **estados** se encadenan:  
  - “Venta” editable solo si “Fabricación” = **Hecho**.  
  - “Envío” editable solo si “Venta” = **Transferido**.
- **Restante** se calcula automáticamente al modificar valor, seña o transportista.  
- **Fecha límite** muestra contador de días.  
- Los íconos y datos se actualizan dinámicamente según tipo y canal.  
- Los archivos se asocian al ID del sello.

---

## 🧾 Relación Jerárquica de Datos

### Entidades
1. **Cliente** → persona o empresa.  
2. **Orden de compra** → agrupador de pedido (puede tener varios sellos).  
3. **Sello** → cada diseño/medida solicitada dentro de la orden.

> Una **Orden** puede tener **uno o varios Sellos**.  
> Al hacer clic en la fila de la orden, se despliega la subtabla con los sellos asociados.

---

## 👁️‍🗨️ Vista en Tabla

### Fila principal (Orden)
- Fecha, Cliente, Contacto, Estados, Tipo (resumen), Totales, Prioridad y Archivos.  
- Al hacer clic, se expande el detalle de los sellos.

### Fila expandida (Sellos)
- Subtabla con: Diseño, Medida, Tipo, Notas, Estado, Archivos y Valor.  
- Permite editar o eliminar sellos individuales.

---

## 🔢 Reglas de Cálculo

### Totales
- **Valor total (orden)** = suma de valores de los sellos.  
- **Restante (orden)** = (Valor total + Envío) – Seña.

### Estados
- **Fabricación (orden)** = estado más atrasado de los sellos.  
  - Si todos están *Hecho*, la orden se marca *Hecho*.  
- **Venta / Envío** = gestionados a nivel orden.

---

## 🧠 Botones y Modales

### ➕ Botón “Nuevo Pedido”
Abre un modal dividido en **2 pasos**.

#### Paso 1 – Cliente
- Campos: Nombre, Apellido, Contacto, Canal de contacto.  
- Si el número ya existe: se **autocompletan** los datos.

#### Paso 2 – Detalles del pedido / sello
- Campos: Nombre del diseño, Medida, Tipo de sello, Notas, Valor, Seña, Restante (auto), Transportista, Estado inicial, Prioridad, Fecha límite, Archivos.  
- Botones:
  - **Agregar Pedido** → crea cliente, orden y sello.  
  - **Agregar otro sello** → repite el paso 2 y suma a la misma orden.

---

## 🔍 Modal de Filtro
Permite buscar pedidos según múltiples criterios.

**Filtros disponibles:**
- Rango de fecha  
- Estado de fabricación  
- Estado de venta  
- Estado de envío  
- Tipo de sello  
- Medio de contacto  
- Quién lo subió (usuario creador)

**Comportamiento:**
- Los filtros se **guardan por usuario** y se mantienen al cerrar la página.  
- Al volver, se restauran automáticamente.  
- Se pueden limpiar manualmente (resetea el estado).  
- Visualización con **chips** sobre la tabla e indicador “Filtros (n)”.
- Si se cambia el orden de las columnas o el tamaño de las columnas tambien se guarda.

---

## ↕️ Modal de Ordenar

### Criterios de ordenamiento
- Campos disponibles: **Fecha**, **Cliente**, **Fabricación**, **Venta**, **Envío**, **Valor**, **Restante**.  
- Se puede agregar más de un criterio.  
- Dirección: **Ascendente** o **Descendente**.  
- El orden define la **prioridad** (primero el criterio superior).

### Prioridad de fabricación
- Lista arrastrable de estados internos:  
  - Sin Hacer  
  - Haciendo  
  - Verificar  
  - Hecho  
  - Retocar  
  - Rehacer
- Permite definir en qué orden aparecen en la grilla.

### Botones
- **Cancelar**  
- **Aplicar ordenamiento**

---

## 🖱️ Menú secundario por fila

### En Orden
- **Editar:** abre modal para modificar datos generales (cliente, envío, seña, fecha límite, prioridad).  
- **Eliminar:** elimina la orden y todos sus sellos asociados. Confirmación previa.

### En Sello
- **Editar:** permite ajustar datos del sello individual.  
- **Eliminar:** si hay más sellos, borra solo ese; si es único, sugiere borrar la orden completa.

---

## 🧭 UX / Interacciones
- Indicador de expansión (▶ / ▼).  
- Chips de estado y badges de tipo.  
- Tooltip “Múltiples” cuando hay varios tipos.  
- Acceso rápido: “Agregar otro sello a esta orden”.  
- Confirmaciones antes de eliminar.  
- Toasts y feedback visual en cambios importantes (orden aplicada, filtros activos, etc.).

---

## 🧪 Casos límite
- No se permite crear una orden sin sellos.  
- Estados mixtos → la orden refleja el más atrasado.  
- Si se cambia el cliente, advertir posibles efectos en historial.  
- Archivos faltantes → mostrar contadores visuales (p.ej. “2/3 archivos cargados”).  

---

## 🧾 Resumen general

| Nivel | Entidad | Contiene | Estados principales | Acciones |
|-------|----------|-----------|---------------------|-----------|
| 🧍 Cliente | Datos de contacto | Órdenes | — | Crear / Reutilizar |
| 📦 Orden | Agrupa sellos | Sellos, envío, seña, fecha límite | Fabricación / Venta / Envío | Editar / Eliminar / Expandir |
| 🪶 Sello | Diseño individual | Archivos, medidas, tipo, valor | Fabricación | Editar / Eliminar |
