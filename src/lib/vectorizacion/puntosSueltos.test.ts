// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectarPuntosSueltos } from './puntosSueltos';
import { applyPhysicalSize, declaredSizeMm } from './svgSize';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800">${body}</svg>`;
const rect = (x: number, y: number, w: number, h: number) => `<path d="M${x} ${y}h${w}v${h}h${-w}Z"/>`;

// Logo de 400 × 400 arriba; el lienzo de la imagen llega hasta 800 de alto.
const logo = rect(0, 0, 400, 180) + rect(0, 220, 400, 180);

describe('detectarPuntosSueltos', () => {
  it('punto colgado abajo, lejos del logo → se detecta y se quita', () => {
    const conPunto = svg(logo + rect(200, 780, 4, 4));
    const r = detectarPuntosSueltos(conPunto);
    expect(r?.cantidad).toBe(1);
    // Sin el punto, el archivo guardado queda cuadrado (como lo pedido), no 1:2.
    const antes = declaredSizeMm(applyPhysicalSize(conPunto, 40, 40))!;
    const despues = declaredSizeMm(applyPhysicalSize(r!.limpio, 40, 40))!;
    expect(antes.heightMm / antes.widthMm).toBeGreaterThan(1.9);
    expect(despues.widthMm).toBeCloseTo(40, 3);
    expect(despues.heightMm).toBeCloseTo(40, 3);
  });

  it('punto cerca del diseño (un punto final, el de una i) → no se toca', () => {
    expect(detectarPuntosSueltos(svg(logo + rect(200, 405, 4, 4)))).toBeNull();
  });

  it('punto adentro del diseño → no se toca', () => {
    expect(detectarPuntosSueltos(svg(logo + rect(200, 200, 4, 4)))).toBeNull();
  });

  it('pieza grande lejos (parte del diseño) → no se toca', () => {
    expect(detectarPuntosSueltos(svg(logo + rect(100, 700, 200, 60)))).toBeNull();
  });

  it('muchos puntos chicos lejos (un renglón, un patrón) → no se tocan', () => {
    const renglon = Array.from({ length: 10 }, (_, k) => rect(10 + k * 30, 760, 8, 8)).join('');
    expect(detectarPuntosSueltos(svg(logo + renglon))).toBeNull();
  });

  it('SVG sin nada suelto → null', () => {
    expect(detectarPuntosSueltos(svg(logo))).toBeNull();
  });
});
