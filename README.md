# App Interna - Página de Pedidos

Una aplicación interna para la gestión de pedidos con interfaz oscura, compacta y funcionalidades avanzadas.

## 🚀 Características

- **UI Oscura y Compacta**: Diseño moderno con tema oscuro optimizado para uso profesional
- **Tabla Densa**: Tabla con TanStack Table v8 con scroll horizontal y virtualización
- **Filtros Avanzados**: Sistema de filtros por fecha, estado de fabricación, venta y envío
- **Ordenamiento Inteligente**: Drag & drop para prioridad de fabricación y criterios múltiples
- **Modal de Nuevo Pedido**: Formulario completo con validación Zod
- **Sidebar Expandible**: Navegación colapsable con perfil de usuario
- **Previews de Archivos**: Miniaturas 40x40 para base, vector y foto sello
- **Búsqueda en Tiempo Real**: Búsqueda instantánea por cliente, email o diseño
- **Notificaciones Toast**: Feedback visual para todas las acciones

## 🛠️ Tech Stack

- **React 18** + **TypeScript**
- **Vite** (build tool)
- **TailwindCSS** (estilos)
- **shadcn/ui** (componentes UI)
- **TanStack Table v8** (tabla avanzada)
- **React Hook Form** + **Zod** (formularios y validación)
- **Zustand** (estado global)
- **Lucide React** (iconos)
- **@dnd-kit** (drag & drop)

## 📁 Estructura del Proyecto

```
src/
├── app/
│   └── pedidos/
│       └── index.tsx              # Página principal
├── components/
│   ├── pedidos/
│   │   ├── Sidebar/               # Sidebar expandible
│   │   ├── Header/                # Header con búsqueda y chips
│   │   ├── Table/                 # Tabla con celdas modulares
│   │   ├── Filters/               # Dialog de filtros
│   │   ├── Sorter/                # Dialog de ordenamiento
│   │   └── NewOrder/              # Modal de nuevo pedido
│   └── ui/                        # Componentes base shadcn/ui
├── lib/
│   ├── types/                     # Tipos TypeScript
│   ├── state/                     # Store Zustand
│   ├── utils/                     # Utilidades de formateo
│   └── mocks/                     # Datos de ejemplo
```

## 🎯 Componentes Principales

### Sidebar
- Navegación expandible/colapsable
- Perfil de usuario en la parte inferior
- Iconos de Lucide React

### Header
- Título con contador de pedidos activos
- Buscador en tiempo real
- Toggle para mostrar/ocultar previews
- Botones de acción (Ordenar, Filtros, Nuevo)
- Chips de estados con contadores

### Tabla
- 16 columnas con celdas modulares
- Scroll horizontal para pantallas pequeñas
- Hover effects y selección
- Dropdowns inline para cambios de estado
- Previews de archivos condicionales

### Filtros
- Rango de fechas
- Estados de fabricación (múltiple)
- Estados de venta (múltiple)
- Estados de envío (múltiple)

### Ordenamiento
- Drag & drop para prioridad de fabricación
- Criterios múltiples de ordenamiento
- Interfaz intuitiva

### Nuevo Pedido
- Formulario completo con validación
- Cálculo automático de restante
- Subida de archivos simulada
- Estados iniciales configurables

## 🚀 Instalación y Uso

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Ejecutar en desarrollo:**
   ```bash
   npm run dev
   ```

3. **Build para producción:**
   ```bash
   npm run build
   ```

4. **Linting:**
   ```bash
   npm run lint
   ```

## 📊 Datos Mock

El proyecto incluye datos de ejemplo con 8 pedidos que cubren todos los estados posibles:
- Estados de fabricación: Sin Hacer, Haciendo, Verificar, Hecho, Prioridad, Retocar, Rehacer
- Estados de venta: Señado, Foto Enviada, Transferido, Deudor
- Estados de envío: Sin Envío, Hacer Etiqueta, Etiqueta Lista, Despachado, Seguimiento Enviado
- Tipos de sello: 3MM, Alimento, Clásico, ABC, Lacre
- Transportistas: Andreani, Correo Argentino, Vía Cargo, Otro

## 🎨 Personalización

### Colores de Estados
Los colores de los estados están definidos en `src/lib/utils/format.ts`:
- **Señado**: Amarillo
- **Foto Enviada**: Azul
- **Transferido**: Verde
- **Deudor**: Rojo

### Tema Oscuro
El tema oscuro está configurado en `tailwind.config.js` y `src/index.css` con variables CSS personalizadas.

## 🔧 Configuración

### TypeScript
Configuración estricta en `tsconfig.json` con path mapping para imports limpios.

### TailwindCSS
Configuración personalizada con colores del sistema de diseño y animaciones.

### ESLint + Prettier
Configuración para código limpio y consistente.

## 📱 Responsive Design

- **Desktop**: Todas las funcionalidades visibles
- **Tablet**: Sidebar colapsable, tabla con scroll horizontal
- **Mobile**: Optimizado para pantallas pequeñas

## 🎯 Próximas Mejoras

- [ ] Integración con backend real
- [ ] Paginación para grandes volúmenes de datos
- [ ] Exportación a Excel/PDF
- [ ] Notificaciones push
- [ ] Modo offline
- [ ] Temas personalizables
- [ ] Dashboard con métricas

## 📄 Licencia

Proyecto interno - Todos los derechos reservados.
