# Documentación de Base de Datos - Alcohn AI

## Descripción General
Esta base de datos está diseñada para gestionar un sistema de fabricación y venta de sellos personalizados, incluyendo gestión de clientes, órdenes, producción y envíos.

## Tablas

### 1. CLIENTES
Almacena información de los clientes del sistema.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único del cliente | PRIMARY KEY, DEFAULT gen_random_uuid() |
| nombre | VARCHAR(100) | Nombre del cliente | NOT NULL |
| apellido | VARCHAR(100) | Apellido del cliente | NOT NULL |
| medio_contacto | VARCHAR(20) | Medio de contacto preferido | CHECK (medio_contacto IN ('Whatsapp', 'Facebook', 'Instagram', 'Mail')) |
| telefono | VARCHAR(20) | Número de teléfono | NOT NULL |
| dni | VARCHAR(20) | Documento Nacional de Identidad | UNIQUE |
| mail | VARCHAR(255) | Dirección de correo electrónico | UNIQUE |
| created_at | TIMESTAMP | Fecha de creación del registro | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de última actualización | DEFAULT NOW() |

### 2. DIRECCIONES
Almacena direcciones de envío de los clientes.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único de la dirección | PRIMARY KEY, DEFAULT gen_random_uuid() |
| cliente_id | UUID | Referencia al cliente | FOREIGN KEY REFERENCES clientes(id) ON DELETE CASCADE |
| activa | BOOLEAN | Si la dirección está activa | DEFAULT true |
| codigo_postal | VARCHAR(10) | Código postal | NOT NULL |
| provincia | VARCHAR(100) | Provincia | NOT NULL |
| localidad | VARCHAR(100) | Localidad | NOT NULL |
| domicilio | VARCHAR(255) | Dirección del domicilio | NOT NULL |
| nombre | VARCHAR(100) | Nombre del destinatario | NOT NULL |
| apellido | VARCHAR(100) | Apellido del destinatario | NOT NULL |
| telefono | VARCHAR(20) | Teléfono del destinatario | |
| dni | VARCHAR(20) | DNI del destinatario | |
| created_at | TIMESTAMP | Fecha de creación | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de actualización | DEFAULT NOW() |

### 3. ORDENES
Gestiona las órdenes de pedidos de sellos.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único de la orden | PRIMARY KEY, DEFAULT gen_random_uuid() |
| cliente_id | UUID | Referencia al cliente | FOREIGN KEY REFERENCES clientes(id) ON DELETE CASCADE |
| direccion_id | UUID | Referencia a la dirección de envío | FOREIGN KEY REFERENCES direcciones(id) |
| empresa_envio | VARCHAR(50) | Empresa de envío | CHECK (empresa_envio IN ('Andreani', 'Correo Argentino', 'Via Cargo', 'Retiro')) |
| tipo_envio | VARCHAR(20) | Tipo de envío | CHECK (tipo_envio IN ('Domicilio', 'Sucursal', 'Retiro')) |
| cantidad_sellos | INTEGER | Cantidad total de sellos (calculado automáticamente) | DEFAULT 0 |
| senia_total | DECIMAL(10,2) | Seña total (calculado automáticamente) | DEFAULT 0.00 |
| valor_total | DECIMAL(10,2) | Valor total (calculado automáticamente) | DEFAULT 0.00 |
| restante | DECIMAL(10,2) | Restante a pagar (calculado automáticamente) | DEFAULT 0.00 |
| seguimiento | VARCHAR(100) | Número de seguimiento | |
| estado_orden | VARCHAR(30) | Estado de la orden | CHECK (estado_orden IN ('Señado', 'Hecho', 'Foto', 'Transferido', 'Hacer Etiqueta', 'Etiqueta Lista', 'Despachado', 'Seguimiento Enviado')) |
| fecha | DATE | Fecha de la orden | DEFAULT CURRENT_DATE |
| estado_envio | VARCHAR(30) | Estado del envío | CHECK (estado_envio IN ('Sin envio', 'Hacer Etiqueta', 'Etiqueta Lista', 'Despachado', 'Seguimiento Enviado')) |
| created_at | TIMESTAMP | Fecha de creación | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de actualización | DEFAULT NOW() |

### 4. SELLOS
Gestiona los sellos individuales.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único del sello | PRIMARY KEY, DEFAULT gen_random_uuid() |
| orden_id | UUID | Referencia a la orden | FOREIGN KEY REFERENCES ordenes(id) ON DELETE CASCADE |
| programa_id | UUID | Referencia al programa | FOREIGN KEY REFERENCES programa(id) |
| fecha | DATE | Fecha del sello | DEFAULT CURRENT_DATE |
| tipo | VARCHAR(20) | Tipo de sello | CHECK (tipo IN ('Clasico', '3mm', 'Lacre', 'Alimento', 'ABC')) |
| senia | DECIMAL(10,2) | Seña del sello | DEFAULT 0.00 |
| fecha_limite | DATE | Fecha límite de entrega | |
| diseno | TEXT | Descripción del diseño | |
| nota | TEXT | Notas adicionales | |
| valor | DECIMAL(10,2) | Valor del sello | NOT NULL |
| restante | DECIMAL(10,2) | Restante a pagar (calculado automáticamente) | DEFAULT 0.00 |
| estado_fabricacion | VARCHAR(20) | Estado de fabricación | CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Rehacer', 'Retocar', 'Prioridad', 'Verificar')) |
| estado_venta | VARCHAR(20) | Estado de venta | CHECK (estado_venta IN ('Señado', 'Foto', 'Transferido')) |
| archivo_base | TEXT | Link al archivo base en el bucket | |
| foto_sello | TEXT | Link a la foto del sello en el bucket | |
| tipo_planchuela | INTEGER | Tipo de planchuela | CHECK (tipo_planchuela IN (100, 63, 38, 25, 19, 12)) |
| tiempo | INTEGER | Tiempo estimado en minutos | |
| maquina | VARCHAR(10) | Máquina asignada | CHECK (maquina IN ('C', 'G', 'XL', 'ABC', 'Circular')) |
| largo_real | DECIMAL(8,2) | Largo real del sello | |
| ancho_real | DECIMAL(8,2) | Ancho real del sello | |
| created_at | TIMESTAMP | Fecha de creación | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de actualización | DEFAULT NOW() |

### 5. PROGRAMA
Gestiona los programas de fabricación.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único del programa | PRIMARY KEY, DEFAULT gen_random_uuid() |
| fecha | DATE | Fecha del programa | DEFAULT CURRENT_DATE |
| nombre | VARCHAR(100) | Nombre del programa | NOT NULL |
| cantidad_sellos | INTEGER | Cantidad de sellos (calculado automáticamente) | DEFAULT 0 |
| maquina | VARCHAR(10) | Máquina asignada | CHECK (maquina IN ('C', 'G', 'XL', 'ABC', 'Circular')) |
| estado_fabricacion | VARCHAR(20) | Estado de fabricación | CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Verificado', 'Rehacer')) |
| tiempo_maximo | INTEGER | Tiempo máximo en minutos | |
| largo_usado_63 | DECIMAL(8,2) | Largo usado de planchuela 63 | DEFAULT 0.00 |
| largo_usado_38 | DECIMAL(8,2) | Largo usado de planchuela 38 | DEFAULT 0.00 |
| largo_usado_25 | DECIMAL(8,2) | Largo usado de planchuela 25 | DEFAULT 0.00 |
| largo_usado_19 | DECIMAL(8,2) | Largo usado de planchuela 19 | DEFAULT 0.00 |
| largo_usado_12 | DECIMAL(8,2) | Largo usado de planchuela 12 | DEFAULT 0.00 |
| verificado | BOOLEAN | Si el programa está verificado | DEFAULT false |
| created_at | TIMESTAMP | Fecha de creación | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de actualización | DEFAULT NOW() |

### 6. COSTOS_DE_ENVIO
Gestiona los costos de envío por empresa.

| Campo | Tipo | Descripción | Restricciones |
|-------|------|-------------|---------------|
| id | UUID | Identificador único del costo | PRIMARY KEY, DEFAULT gen_random_uuid() |
| empresa | VARCHAR(50) | Empresa de envío | CHECK (empresa IN ('Andreani', 'Correo Argentino', 'Via Cargo')) |
| servicio | VARCHAR(20) | Tipo de servicio | CHECK (servicio IN ('Domicilio', 'Sucursal')) |
| costo | DECIMAL(10,2) | Costo del envío | NOT NULL |
| activo_desde | DATE | Fecha desde la cual está activo | DEFAULT CURRENT_DATE |
| activo | BOOLEAN | Si el costo está activo | DEFAULT true |
| created_at | TIMESTAMP | Fecha de creación | DEFAULT NOW() |
| updated_at | TIMESTAMP | Fecha de actualización | DEFAULT NOW() |

## Relaciones

1. **CLIENTES → DIRECCIONES**: Un cliente puede tener múltiples direcciones (1:N)
2. **CLIENTES → ORDENES**: Un cliente puede tener múltiples órdenes (1:N)
3. **DIRECCIONES → ORDENES**: Una dirección puede ser usada en múltiples órdenes (1:N)
4. **ORDENES → SELLOS**: Una orden puede tener múltiples sellos (1:N)
5. **PROGRAMA → SELLOS**: Un programa puede tener múltiples sellos (1:N)

## Campos Calculados Automáticamente

### En la tabla ORDENES:
- `cantidad_sellos`: Suma de todos los sellos asociados a la orden
- `senia_total`: Suma de todas las señas de los sellos
- `valor_total`: Suma de todos los valores de los sellos
- `restante`: valor_total - senia_total

### En la tabla SELLOS:
- `restante`: valor - senia

### En la tabla PROGRAMA:
- `cantidad_sellos`: Cuenta de sellos asociados al programa

## Triggers y Funciones

Se implementarán triggers para mantener actualizados los campos calculados automáticamente cuando se modifiquen los datos relacionados.

## Índices Recomendados

1. `idx_clientes_dni` en `clientes(dni)`
2. `idx_clientes_mail` en `clientes(mail)`
3. `idx_ordenes_cliente_id` en `ordenes(cliente_id)`
4. `idx_sellos_orden_id` en `sellos(orden_id)`
5. `idx_sellos_programa_id` en `sellos(programa_id)`
6. `idx_direcciones_cliente_id` en `direcciones(cliente_id)`

