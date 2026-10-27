# ADR-029 · Revisión de links Andreani

Fecha: 2026-10-27. Estado: **implementada** (migración aplicada y worker desplegado en `/opt/andreani-worker`, 2026-10-27).

## Problema

Con Andreani el cliente completa sus datos y paga en el link que le manda la app ([WF-07](../03-workflows/WF-07-envio-andreani.md)). A veces lo completa **a nombre de otra persona** y no avisa. "Traer etiquetas" empareja por nombre (cliente o dirección de envío), así que esa etiqueta queda huérfana y hay que asignarla a mano. En los 30 días al 2026-10-27, 38 de 112 etiquetas se asignaron después de bajarlas (🔶 inferido por `asignado_en` posterior a `creado_en`). Caso real: pedido "Eleo Mendoza", etiqueta "Eleonora Mendoza".

## Hallazgos (verificados 2026-10-27)

- `GET https://pymes-api.andreani.com/api/v1/AndreaniEnvio?token=<token del link>` es público: link sin usar → `pedidoId: null` ("Link de envio pendiente"); completado → `pedidoId`.
- Abrir un link completado, **sin iniciar sesión**, redirige a `andreani.com/cuenta/hacer-envio/estado-pedido/<pedidoId>` ("¡Listo!"), con nombre, dirección, DNI, mail, celular y **número de seguimiento**.
- El `jti` del token no es el `pedidoId`.

## Decisión (acordada con el dueño, 2026-10-27)

- Guardar en el link **el seguimiento**, además del nombre: así la etiqueta se empareja por número exacto y el nombre deja de importar (BR-AND-008). El nombre se muestra en el pedido.
- No se guardan DNI, mail ni celular de la otra persona: no hacen falta para emparejar.
- La revisión la hace el **andreani-worker** (`check-links`): API para saber si se usó; Playwright para leer la página solo de los usados (~7 s cada uno). Solo revisa links `asignado` de pedidos sin seguimiento y sin `Seguimiento Enviado`, y no vuelve a abrir los que ya dieron su seguimiento.
- **Cuándo**: solo como primer paso de "Traer etiquetas" (el túnel está abierto seguro y es cuando se empareja). La revisión por horario quedó **apagada** (2026-10-27, [Q-AND-005](../14-open-questions/envios.md#q-and-005)): el túnel se abre a mano y a veces se cae. El worker la mantiene opcional (`ANDREANI_CHECK_LINKS_HOURS`).
- Si el seguimiento ya estaba como huérfano, se asigna solo con `asignar_etiqueta_andreani` (mismas validaciones que el botón). Si está asignado a **otro** pedido, no se toca: se informa.
- Un link ya completado no vuelve al pool al liberarlo: se descarta (BR-AND-009).

## Alternativas descartadas

- **Guardar solo el nombre y emparejar por nombre**: sigue fallando con apodos ("Eleo"/"Eleonora") y homónimos.
- **Programado (2–3 veces por día)**: era el pedido original, pero depende del túnel de oficina, que se abre a mano y a veces se cae (Q-AND-002, Q-AND-005). Correrlo antes de "Traer etiquetas" asegura que el dato esté al emparejar.
- **Consultar desde Supabase o Vercel sin túnel**: no probado. Que los links y la API sean públicos solo evita el login; Andreani bloquea por IP, y el worker ya documenta que bloquea IPs de datacenter (también `pymes-api`).

## Consecuencias

- Nuevas columnas en `envios_andreani_links` y nueva versión de `liberar_link_andreani`.
- Worker: `check-links-service.ts`, `check-links-schedule.ts`, `andreani/check-link.ts`, `link-revision.ts`, `POST /check-links`; `sync-labels` usa `matchEtiqueta`.
- App: tooltip del link en Pedidos (columna Empresa) y sugerencia de pedido en Huérfanos.
- Queda registrado AUD-INC-029 (reasignar un link vencido no mira si el cliente ya lo completó).
