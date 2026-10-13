# Preguntas abiertas — Inicio

### Q-INI-001
- **Módulo**: Inicio (Home nueva, `/dev/home`) · **Estado**: pendiente (2026-10-08)
- **Pregunta**: ¿Qué cuenta como **"Pedido especial"** en el cuadrado "Especiales" de la Home nueva?
- **Contexto**: la Home nueva muestra cinco cuadrados con el conteo de sellos (Prioritarios, Para enviar, Foto pendiente, Especiales, Para vectorizar). Los demás ya tienen criterio; "Especiales" no.
- **Evidencia**: en Economía, el grupo `especiales` son los sellos `3mm`, `Lacre` y `Alimento` (`src/lib/economia/productCategory.ts`). Otras opciones posibles: sumar abecedarios, o los pedidos Prueba / Regalo aparte.
- **Ya definido**: un especial cuenta hasta que el envío llega a `Seguimiento enviado` (dueño, 2026-10-08).
- **Por qué importa**: sin la definición, el cuadrado queda en "Sin definir" y no cuenta nada.
- **Impacto**: bajo (solo la Home nueva).

### Q-INI-002
- **Módulo**: Inicio (Home nueva, `/dev/home`) · **Estado**: ✅ respondida (2026-10-12)
- **Pregunta**: ¿Qué ve **de base** cada persona en su Inicio, y hay algo que **no** se pueda apagar?
- **Contexto**: cada uno puede elegir qué ve desde "Personalizar" (cuadrados, áreas, stock y apps del escritorio). Hace falta la vista con la que arranca cada rol. Se ve en `/dev/home/fede`, `/dev/home/juli-b` y `/dev/home/lautaro`.
- **Propuesta** (armada con los roles de `docs/01-product/equipo.md`, `src/components/home-nueva/vista.ts`):
  - **Fede** (producción): Prioritarios, Especiales, Para vectorizar · Producción y Equipo · Stock · apps Producción, Programas, Pedidos, Corcho, Mi perfil.
  - **Juli B** (ventas y fotos): Prioritarios, Foto pendiente, Especiales · Ventas y Equipo · sin Stock · apps Pedidos, Envíos, Corcho, Mi perfil.
  - **Cachi** (ventas y logística): Prioritarios, Para enviar, Especiales · Ventas, Logística y Equipo · Stock · apps Pedidos, Envíos, Corcho, Mi perfil.
  - **Dueño**: todo.
- **Por qué importa**: hoy todo se puede apagar; si algo tiene que verse sí o sí (por ejemplo Prioritarios), hay que bloquearlo.
- **Impacto**: bajo (solo la Home nueva). Lo elegido se guarda en el navegador; pasarlo a la base es un paso aparte.
- **Respuesta** (dueño, 2026-10-12): la propuesta está bien así. Nada queda bloqueado: cada uno puede apagar o prender lo que quiera y volver a la base.
