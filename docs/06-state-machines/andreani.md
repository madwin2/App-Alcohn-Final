# Máquinas de estado — Andreani

## Link (`envios_andreani_links.estado`)

```mermaid
stateDiagram-v2
  [*] --> disponible: worker genera
  disponible --> asignado: asignar_link_andreani (FIFO, ≤30 h)
  disponible --> [*]: purga (>30 h)
  asignado --> asignado: reusar si ≤30 h
  asignado --> descartado: vencido al reasignar / liberar con descartar
  asignado --> disponible: liberar (≤30 h)
  asignado --> [*]: liberar (>30 h) / eliminar
```

## Etiqueta (`envios_andreani_etiquetas.estado`)

```mermaid
stateDiagram-v2
  [*] --> huerfano: sync-labels sin match / PDF manual
  [*] --> asignada: sync-labels con match
  huerfano --> asignada: asignar_etiqueta_andreani
  asignada --> huerfano: liberar (orden → Sin envio o Seguimiento Enviado)
  huerfano --> erronea: marcar errónea
  erronea --> huerfano: restaurar
  asignada --> [*]: eliminar
  huerfano --> [*]: eliminar
```

Control: **DB** (funciones con validaciones y `FOR UPDATE`). Ver [BR-AND-*](../04-business-rules/envios.md).
