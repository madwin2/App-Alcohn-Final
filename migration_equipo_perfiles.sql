-- Perfil laboral de cada integrante (1 fila por usuario). Datos personales: RLS obligatorio.
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Tras aplicar: verificar que el INSERT de bootstrap trajo 1 fila (email julian.475@hotmail.com).
-- Si trajo 0, frenar y avisar: el email está confirmado (D20), así que habría otro problema.

CREATE TABLE IF NOT EXISTS public.perfiles_equipo (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  puesto text,                                   -- texto libre: "Ventas y logística", "Producción"...
  area_principal text CHECK (area_principal IS NULL OR area_principal IN ('ventas','logistica','produccion','administracion')),
  fecha_ingreso date,
  fecha_nacimiento date,                         -- se muestra sin el año
  color text NOT NULL DEFAULT '#9CA3AF' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),  -- color en el corcho y el calendario
  dias_vacaciones_anuales int NOT NULL DEFAULT 10 CHECK (dias_vacaciones_anuales BETWEEN 0 AND 60),
  -- Saldo de vacaciones conocido a una fecha (D19). Desde ahí la app suma 10 cada 1/1 y resta lo cargado.
  vacaciones_saldo_base numeric(5,1) NOT NULL DEFAULT 0,
  vacaciones_saldo_base_fecha date NOT NULL DEFAULT CURRENT_DATE,
  vacaciones_sin_limite boolean NOT NULL DEFAULT false,   -- D19b: el dueño
  es_admin boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,          -- false = ya no está en el equipo (no se borra)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.perfiles_equipo IS
  'Perfil laboral de cada integrante del equipo (puesto, área, vacaciones, color, admin). Página /perfil.';

-- ¿El usuario actual es admin? SECURITY DEFINER para poder usarla dentro de políticas sin recursión.
CREATE OR REPLACE FUNCTION public.es_admin_equipo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles_equipo WHERE user_id = auth.uid() AND es_admin AND activo);
$$;
REVOKE ALL ON FUNCTION public.es_admin_equipo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.es_admin_equipo() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at_perfiles_equipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_perfiles_equipo ON public.perfiles_equipo;
CREATE TRIGGER trg_set_updated_at_perfiles_equipo
  BEFORE UPDATE ON public.perfiles_equipo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_perfiles_equipo();

ALTER TABLE public.perfiles_equipo ENABLE ROW LEVEL SECURITY;

-- Todo el equipo lee los perfiles (hace falta para el calendario: nombre, color, cumpleaños).
DROP POLICY IF EXISTS perfiles_equipo_select ON public.perfiles_equipo;
CREATE POLICY perfiles_equipo_select ON public.perfiles_equipo
  FOR SELECT TO authenticated USING (true);

-- Solo el admin crea / edita / desactiva perfiles (incluido es_admin).
DROP POLICY IF EXISTS perfiles_equipo_admin_insert ON public.perfiles_equipo;
CREATE POLICY perfiles_equipo_admin_insert ON public.perfiles_equipo
  FOR INSERT TO authenticated WITH CHECK (public.es_admin_equipo());

DROP POLICY IF EXISTS perfiles_equipo_admin_update ON public.perfiles_equipo;
CREATE POLICY perfiles_equipo_admin_update ON public.perfiles_equipo
  FOR UPDATE TO authenticated USING (public.es_admin_equipo()) WITH CHECK (public.es_admin_equipo());

-- Sin DELETE: se desactiva con activo = false.

-- Bootstrap: el dueño es el primer admin (mismo email que Economía/Precios).
INSERT INTO public.perfiles_equipo (user_id, es_admin, area_principal, puesto, vacaciones_sin_limite)
SELECT id, true, 'administracion', 'Dueño / administración', true
FROM auth.users WHERE lower(email) = 'julian.475@hotmail.com'
ON CONFLICT (user_id) DO UPDATE SET es_admin = true, vacaciones_sin_limite = true;

-- Verificación manual post-migración:
--   SELECT pe.user_id, u.email, pe.es_admin, pe.vacaciones_sin_limite
--   FROM public.perfiles_equipo pe
--   JOIN auth.users u ON u.id = pe.user_id
--   WHERE pe.es_admin;
-- Debe devolver exactamente 1 fila con julian.475@hotmail.com.
