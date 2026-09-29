import { describe, expect, it } from 'vitest';
import { renderCentroMarkdown } from './markdown';

describe('renderCentroMarkdown', () => {
  it('envuelve tablas y deja celdas con bordes vía clase wrap', () => {
    const html = renderCentroMarkdown('| Estado | Qué es |\n|---|---|\n| **Hecho** | Listo |');
    expect(html).toContain('centro-table-wrap');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('<td>');
  });

  it('convierte avisos ⚠️ y 🤖 en callouts con etiqueta', () => {
    const warn = renderCentroMarkdown('⚠️ Sin seña no se toma un trabajo.');
    expect(warn).toContain('centro-callout--warn');
    expect(warn).toContain('Atención');
    expect(warn).toContain('Sin seña');

    const auto = renderCentroMarkdown('🤖 Al cliente le llega un WhatsApp.');
    expect(auto).toContain('centro-callout--auto');
    expect(auto).toContain('Automático');
  });

  it('saca el enlace Volver al índice del comienzo', () => {
    const html = renderCentroMarkdown('[← Volver al índice](/centro/articulos/x)\n\nHola mundo.');
    expect(html).not.toContain('Volver al índice');
    expect(html).toContain('Hola mundo');
  });
});
