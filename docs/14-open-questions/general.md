# Preguntas abiertas — General

### Q-GEN-001
- **Módulo**: toda la app · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿"Alcohn AI" es el nombre oficial de la aplicación? ¿Debería reemplazar a "Alcohn AI" en el título y la documentación?
- **Contexto**: el equipo la llama Alcohn AI; el código dice "Alcohn AI" (`index.html`) y `pedidos-app` (`package.json`).
- **Por qué importa**: consistencia en manuales y en cómo los agentes interpretan el término.
- **Impacto**: bajo.
- Respuesta: Alcohn Ai es el nombre de la app. Alcohn AI debe haber sido un error cuando me escucho claude, que puso Alcohn AI en vez de alcohn. 

### Q-GEN-002
- **Módulo**: producto · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué productos vende Alcohn además de los modelados (sellos clásico/3 mm/lacre/alimento/ABC, abecedarios, soldadores, mangos de golpe, bases de remachadora)? ¿Hay productos que se venden por fuera de Alcohn AI?
- **Evidencia**: `sellos.item_type`, `sellos.tipo`, `catalogo_items`, `precios_accesorio`.
- **Por qué importa**: define el alcance real de Alcohn AI y si hay procesos sin registro.
- **Impacto**: medio.
- Respuesta: No, solo esos.

### Q-GEN-003
- **Módulo**: producto · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué son físicamente los tipos de sello "3mm", "Lacre" y "Alimento" y en qué se diferencian en fabricación?
- **Evidencia**: `sellos.tipo`; el gadget usa capas distintas para 3 mm y plantillas de trayectoria por tipo.
- **Por qué importa**: reglas de máquina, material y precio podrían depender del tipo.
- **Impacto**: medio. (Relacionada: Q-PROD-001.)
- Respuesta: La diferencia es que los de 3mm son la profundidad del grabado. El clasico tiene un desbaste con fresa de 6mm recta y grabado conico de 1.7mm. En cambio el de 3mm tiene desbaste con 6mm recta de 3mm de profundidad y ademas un grabado conico de 3mm de profundidad. Son para pedidos especiales. Lacre es por el uso, que se usan cabezales especiales torneados (cabezal de lacre), Alimento es que son de 3mm de profundidad pero ademas van cortados con la forma del diseño, cuestion de uso para que la base del sello no marque la superficie.

### Q-GEN-004
- **Módulo**: Inicio · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Las metas "200 ventas por mes" y "10 por día" del Inicio son vigentes? ¿Cuentan ítems o pedidos? ¿Quién las define y deberían ser configurables?
- **Evidencia**: `MONTHLY_GOAL`, `DAILY_GOAL` en `src/app/home/index.tsx`.
- **Por qué importa**: se muestran a todo el equipo como objetivo.
- **Impacto**: bajo.
- Respuesta: Podrian ser configurables. Las defini yo, son vigentes. Aunque en algun momento me gustaria mejorarlo (ir subiendo la cantidad, definir puntos medios, cantidad minima de equilibrio, cantidad buena, objetivo grandioso)
