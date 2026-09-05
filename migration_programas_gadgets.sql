-- Gadgets Aspire por máquina (C/G/XL).
-- Los .lua ya están en Storage (programas-base/{C|G|XL}/ArmarPrograma_*.lua).
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE programa_archivos_base
  ADD COLUMN IF NOT EXISTS archivo_gadget_url text;

COMMENT ON COLUMN programa_archivos_base.archivo_gadget_url IS
  'URL del gadget ArmarPrograma_*.lua para esa máquina (bucket programas-base)';

UPDATE programa_archivos_base
SET
  archivo_gadget_url = CASE maquina
    WHEN 'C' THEN 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/C/ArmarPrograma_Chica.lua'
    WHEN 'G' THEN 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/G/ArmarPrograma_Grande.lua'
    WHEN 'XL' THEN 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/XL/ArmarPrograma_XL.lua'
    ELSE archivo_gadget_url
  END,
  updated_at = now()
WHERE maquina IN ('C', 'G', 'XL');

-- Si aún no hay fila (no subieron .crv3d), crear solo el registro del gadget.
-- archivo_base_url queda apuntando al .lua como placeholder hasta que suban el .crv3d
-- (el service ignora base_url que no sea .crv3d/.crv al armar el ZIP).
INSERT INTO programa_archivos_base (maquina, archivo_base_url, archivo_gadget_url, updated_at)
SELECT v.maquina, v.gadget_url, v.gadget_url, now()
FROM (VALUES
  ('C', 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/C/ArmarPrograma_Chica.lua'),
  ('G', 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/G/ArmarPrograma_Grande.lua'),
  ('XL', 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/programas-base/XL/ArmarPrograma_XL.lua')
) AS v(maquina, gadget_url)
WHERE NOT EXISTS (
  SELECT 1 FROM programa_archivos_base p WHERE p.maquina = v.maquina
);
