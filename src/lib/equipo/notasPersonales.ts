export type NotaOrdenable = {
  id: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  updatedAt: string;
};

/** Fijadas arriba; después por última edición (desc). Opcional: filtro por título/contenido. */
export function filtrarYOrdenarNotas(notas: NotaOrdenable[], query: string): NotaOrdenable[] {
  const q = query.trim().toLowerCase();
  let list = notas;
  if (q) {
    list = notas.filter(
      (n) => n.titulo.toLowerCase().includes(q) || n.contenido.toLowerCase().includes(q),
    );
  }
  return [...list].sort((a, b) => {
    if (a.fijada !== b.fijada) return a.fijada ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
