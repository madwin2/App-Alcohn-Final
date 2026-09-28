# Preguntas abiertas — Producción y fabricación física

### Q-PROD-001
- **Módulo**: Producción · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo cambia la fabricación según el tipo de sello (Clásico, 3 mm, Lacre, Alimento, ABC): profundidad, fresa, máquina, material?
- **Evidencia**: plantillas `roughing_/profile_<tipo>`, capa `VECTOR 3MM`.
- **Impacto**: medio.
- Respuesta: Respondi antes. ABC es un abecedario, son todas las letras individuales y un contenedor de las letras. Es el unico que no es un sello.

### Q-PROD-002
- **Módulo**: Producción/Programas · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué significan "Retocar" y "Verificar"? ¿Quién los usa y qué pasa después?
- **Evidencia**: `Retocar` solo desde `DoneReviewDialog`; `Verificar` 1 caso; Producción los mapea distinto.
- **Impacto**: medio.
- Respuesta: Retocar es si salio algun detalle mal que se puede corregir sin rehacer. Verificar es si produccion no esta seguro si salio bien y se lo deja a ventas para que chequee.

### Q-PROD-003
- **Módulo**: Producción · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se sigue marcando a mano el estado Aspire (G/C/XL y Check) en Producción, o ya lo hace solo Programas? ¿Qué significaba "Check"?
- **Impacto**: medio (puede limpiarse la UI).
- Respuesta: Lo hace solo el programa.

### Q-PROD-004
- **Módulo**: Programas/Rehacer · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Rehacer desde el menú del programa (sin motivo) es un atajo aceptado o debería pedir motivo como en Pedidos/Producción?
- **Impacto**: medio (trazabilidad de fallas).
- Respuesta: Deberia pedir motivo tambien. Asi le asigna el error a los sellos dentro del programa.

### Q-PROD-005
- **Módulo**: Abecedarios · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se fabrica un abecedario (máquina, programa `ABC`, uso de la hoja de fabricación)? ¿Y soldadores, bases y mangos?
- **Impacto**: medio.
- Respuesta: Se fabrica en la maquian grande en un programa especial. Los soldadores se adaptan a mano. Las bases vieenn hechas y los mangos tambien.

### Q-PROD-006
- **Módulo**: Verificación (no implementado) · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué debería ser el módulo "Verificación" del menú? ¿Existe un control de calidad formal?
- **Impacto**: medio.
- Respuesta: Por ahora nada.

### Q-CNC-001
- **Módulo**: Aspire/CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cuántas máquinas y PCs hay, dónde están, y quién opera Aspire y la máquina? ¿Es la misma persona que arma el programa en Alcohn AI?
- **Impacto**: alto (diseño de Programas).
- Respuesta: Hay dos pc, una para cada cnc. Dos cnc. Tenemos un operario, Fede, el se encarga de preparar maquinas y armar programas.

### Q-CNC-002
- **Módulo**: CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se guardan, agrupan y llevan las trayectorias a la máquina (postprocesador, archivos, pendrive/red)?
- **Evidencia**: plan F3 §5.8; `programa_trayectorias` sin uso.
- **Impacto**: alto.
- Respuesta: Por ahora se guardan de manera manual en un pendrive. Objetivo a futuro, que se carguen directo a la app, y que logueados en las pc de la cnc se descarguen directo y listo.

### Q-CNC-003
- **Módulo**: CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cuánto dura una corrida típica y cuántas se hacen por día/máquina? (El plan menciona ~2 programas por día.)
- **Impacto**: medio.
- Respuesta: En la maquina chica lo ideal es que dure 24 horas y que se ponga uno por dia. En la grande, duran menos 10-12 horas o menos. Uno por dia tambien.

### Q-CNC-004
- **Módulo**: CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se prepara el material (planchuelas de bronce, largo real disponible, recortes) y qué pasa cuando no alcanza?
- **Evidencia**: "borrados por falta de material" en el gadget.
- **Impacto**: medio.
- Respuesta: Las planchuelas vienen cortadas ya para colocar en el cnc. Cuando no alcanza se espera a que llegue el nuevo. Se avisa, se compra y se pide a buenos aires, 2-3 dias de demora.

### Q-CNC-005
- **Módulo**: CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién marca "Haciendo" y "Hecho" y en qué momento exacto (al iniciar la corrida, al cortar, al armar)?
- **Impacto**: medio (métricas y notificaciones).
- Respuesta: Fede. Cuando termina de armamr la maquina y lo deja corriendo, ahi lo pone como haciendo. Y hecho una vez que ya corto todos los sellos, los saco de la maquina y los probo en cuero. Asi los marca como hecho asi Juli uno de los vendedores saca las fotos y se las envia a los clientes.

### Q-CNC-006
- **Módulo**: CNC · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se arma el sello después del mecanizado (mango, tubo, varilla, prisionero, tuerca) y quién lo hace?
- **Impacto**: bajo.
- Respuesta: Se le enrosca una varilla m6 de 130mm de largo con una tuerca. Se le enrosca el mango de madera a la varilla y se le pega un rpisionero a la varilla m6 tmb. Lo hace cachi al momento de hacer los envios.

### Q-CNC-007
- **Módulo**: Programas / máquinas · **Estado**: pendiente
- **Pregunta**: Físicamente hay **dos CNC** (una PC cada una), pero el sistema tiene **tres máquinas** (Chica `C`, Grande `G`, `XL`, cada una con su gadget y su `.crv3d` base). ¿XL es la Grande trabajando con planchuela de 63 mm? ¿Hay tres máquinas o dos?
- **Por qué importa**: define cuántos programas por día caben, cómo se muestran las columnas en Programas y si XL compite con la Grande por el mismo tiempo de máquina.
- **Impacto**: medio.

### Q-PROD-007
- **Módulo**: Programas / abecedarios · **Estado**: pendiente
- **Pregunta**: Los abecedarios se fabrican en la **Grande** en un programa especial armado a mano, pero en el sistema existe una "máquina" `ABC` separada (sin paquete ni gadget) y los ítems ABECEDARIO no pueden entrar a programas. ¿Se usa esa máquina `ABC` en la app o el programa del abecedario no se registra en Alcohn AI?
- **Impacto**: bajo.
