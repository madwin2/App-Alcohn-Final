# Preguntas abiertas — Usuarios y permisos

### Q-USR-001
- **Módulo**: todos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién hace qué en el día a día (ventas, vectorización, programas, máquina, fotos, envíos, cobros)? ¿Una persona cubre varias áreas?
- **Contexto**: 7 usuarios; áreas en `usuario_area` solo para notificaciones; no hay permisos por pantalla.
- **Por qué importa**: para diseñar mejoras, SOPs y notificaciones hay que saber quién es el usuario real de cada pantalla.
- **Impacto**: alto.
- Respuesta: Ventas las manejan Cachi y Juli B. Yo a veces tambien ayudo. Vectorizacion principalmente Fede (lo pueden ayudar capaz, cuando hay mucha demanda de vectorizacion por ejemplo). Programas fede, maquina fede, fotos Juli B. Envios Cachi. Cobros Juli y Cachi.

### Q-USR-002
- **Módulo**: Economía, Gastos, Precios · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿La cuenta con acceso a Economía/Gastos y dueña de Precios es la única que debe verlos/editarlos? ¿Hay otras personas que deberían?
- **Evidencia**: email hardcodeado en `Sidebar.tsx` y en políticas RLS de `precios_*`.
- **Impacto**: medio.
- Respuesta: Economia y gastos son solo para mi Julian Moreno. Precios creo que todos pueden verla.

### Q-USR-003
- **Módulo**: Login · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo y quién aprueba hoy a un usuario nuevo (cambiando `solicitudes_registro.estado` en la base)? ¿Se quiere una pantalla de aprobación?
- **Evidencia**: `approveRegistrationRequest` sin uso; `/admin/registros` redirige a Pedidos.
- **Impacto**: medio (y de seguridad: ver AUD-SEC-001).
- Respuesta: Nose, supongo que desde supabase yo.

### Q-USR-004
- **Módulo**: Login · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se da de baja a alguien que deja la empresa?
- **Impacto**: medio (seguridad).
- Respuesta: Nose, por ahora no lo hacemos.

### Q-USR-005
- **Módulo**: todos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se necesitan permisos por rol/área (p. ej. que solo Ventas confirme pagos o edite montos, que Producción no vea Economía)?
- **Por qué importa**: hoy cualquier usuario puede cambiar montos, estados de venta o borrar pedidos.
- **Impacto**: alto.
- Respuesta: Por ahora no.
