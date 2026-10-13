/**
 * Corcho de fondo de toda la página, fijo mientras se scrollea (las notas "se mueven"
 * sobre el tablero). Va dentro de un contenedor con `isolate`.
 */
export function CorchoFondo() {
  return (
    <>
      {/* Textura un poco más apagada y suave: que no compita con el texto de las notas. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[#b9814b] bg-cover bg-center"
        style={{
          backgroundImage: "url('/texturas/corcho.webp')",
          filter: 'blur(0.6px) saturate(0.85) brightness(0.9) contrast(0.88)',
          transform: 'scale(1.01)',
        }}
      />
      {/* Velo cálido parejo + viñeta para dar profundidad y que las notas resalten. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255,236,205,0.10) 0%, transparent 55%), radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(50,25,8,0.42) 100%), rgba(70,38,12,0.12)',
        }}
      />
    </>
  );
}
