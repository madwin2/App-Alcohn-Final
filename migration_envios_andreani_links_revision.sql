-- Revisión de links Andreani asignados (andreani-worker `check-links`).
-- ⚠️ NO aplicar sin permiso explícito del dueño (la base es producción y la comparte la tienda web).
--
-- El worker abre cada link asignado a un pedido sin seguimiento y guarda a nombre de quién
-- quedó el envío y con qué número de seguimiento. "Traer etiquetas" empareja primero por ese
-- seguimiento (exacto) y después por nombre. Ver docs/03-workflows/WF-07-envio-andreani.md.

ALTER TABLE public.envios_andreani_links
  ADD COLUMN IF NOT EXISTS revisado_en timestamptz,
  ADD COLUMN IF NOT EXISTS usado_en timestamptz,
  ADD COLUMN IF NOT EXISTS pedido_andreani_id text,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS tracking text;

COMMENT ON COLUMN public.envios_andreani_links.revisado_en IS
  'Última vez que el worker consultó el link en Andreani (check-links).';
COMMENT ON COLUMN public.envios_andreani_links.usado_en IS
  'Primera vez que el worker vio el link ya completado por el cliente. NULL = sin usar (a la fecha de revisado_en).';
COMMENT ON COLUMN public.envios_andreani_links.pedido_andreani_id IS
  'pedidoId que devuelve Andreani para el link completado.';
COMMENT ON COLUMN public.envios_andreani_links.destinatario IS
  'Nombre con el que el cliente completó el link (puede ser otra persona).';
COMMENT ON COLUMN public.envios_andreani_links.tracking IS
  'Número de seguimiento que muestra Andreani al abrir el link completado.';

CREATE INDEX IF NOT EXISTS envios_andreani_links_tracking_idx
  ON public.envios_andreani_links (tracking)
  WHERE tracking IS NOT NULL;

-- Un link que el cliente ya completó no sirve para otro pedido (Andreani muestra "¡Listo!"):
-- al liberarlo se descarta en vez de volver al pool, y conserva nombre y seguimiento.
CREATE OR REPLACE FUNCTION public.liberar_link_andreani(
  p_orden_id uuid,
  p_descartar boolean DEFAULT false,
  p_eliminar boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_updated int;
begin
  if p_orden_id is null then
    return false;
  end if;

  if p_eliminar then
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado';
  elsif p_descartar then
    update public.envios_andreani_links
    set estado = 'descartado'
    where orden_id = p_orden_id
      and estado = 'asignado';
  else
    -- Ya completado por el cliente → descartar (no se puede volver a usar).
    update public.envios_andreani_links
    set estado = 'descartado'
    where orden_id = p_orden_id
      and estado = 'asignado'
      and usado_en is not null;

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      return true;
    end if;

    -- Volver al pool. Si ya tiene >30h, se elimina.
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado'
      and creado_en < now() - interval '30 hours';

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      return true;
    end if;

    update public.envios_andreani_links
    set
      estado = 'disponible',
      orden_id = null,
      asignado_en = null,
      revisado_en = null
    where orden_id = p_orden_id
      and estado = 'asignado';
  end if;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;
