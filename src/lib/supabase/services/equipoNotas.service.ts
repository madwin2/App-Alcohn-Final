import { supabase } from '../client';

export interface NotaPersonal {
  id: string;
  userId: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  createdAt: string;
  updatedAt: string;
}

type NotaRow = {
  id: string;
  user_id: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT = 'id, user_id, titulo, contenido, fijada, created_at, updated_at';

function mapNota(row: NotaRow): NotaPersonal {
  return {
    id: row.id,
    userId: row.user_id,
    titulo: row.titulo,
    contenido: row.contenido,
    fijada: row.fijada,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getNotasPersonales(): Promise<NotaPersonal[]> {
  const { data, error } = await supabase
    .from('notas_personales')
    .select(SELECT)
    .order('fijada', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data as NotaRow[] | null) ?? []).map(mapNota);
}

export async function crearNotaPersonal(): Promise<NotaPersonal> {
  const { data, error } = await supabase
    .from('notas_personales')
    .insert({ titulo: '', contenido: '', fijada: false })
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapNota(data as NotaRow);
}

export async function actualizarNotaPersonal(input: {
  id: string;
  titulo?: string;
  contenido?: string;
  fijada?: boolean;
}): Promise<NotaPersonal> {
  const patch: Record<string, unknown> = {};
  if (input.titulo !== undefined) patch.titulo = input.titulo;
  if (input.contenido !== undefined) patch.contenido = input.contenido;
  if (input.fijada !== undefined) patch.fijada = input.fijada;

  const { data, error } = await supabase
    .from('notas_personales')
    .update(patch)
    .eq('id', input.id)
    .select(SELECT)
    .single();

  if (error) throw error;
  return mapNota(data as NotaRow);
}

export async function borrarNotaPersonal(id: string): Promise<void> {
  const { error } = await supabase.from('notas_personales').delete().eq('id', id);
  if (error) throw error;
}
