import { useEffect, useState } from 'react';
import { FresaChip } from '@/components/fresa/FresaChip';
import { FresaCheckDialog } from '@/components/fresa/FresaCheckDialog';
import { autoCorregir, type FresaFixResult, type FresaTarget } from '@/lib/fresa/chequeoFresa';
import { resumenOperaciones } from '@/lib/fresa/textos';
import { useFresaReport } from '@/lib/fresa/useFresaReport';

/** Diseño de muestra: letras "juntas", un ojo chico y una ranura (en mm). */
const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="12mm" viewBox="0 0 30 12">
  <path d="M1 1H6V11H1Z M2.6 4.6H3.0V5.0H2.6Z" fill-rule="evenodd"/>
  <path d="M6.3 1H11V11H6.3Z"/>
  <path d="M12 1H18V11H15.15V4H14.85V11H12Z"/>
  <path d="M19 1H29V11H19Z M22 3H26V9H22Z" fill-rule="evenodd"/>
</svg>`;

/**
 * Sandbox del chequeo de fresa. Abrí /dev/chequeo-fresa (solo en desarrollo).
 * Elegí un SVG y la medida a la que se fabrica.
 */
export default function ChequeoFresaSandboxPage() {
  const [svg, setSvg] = useState<string>(DEMO_SVG);
  const [name, setName] = useState('Muestra');
  const [longSide, setLongSide] = useState<string>('');
  const [open, setOpen] = useState(false);
  /** Lo que se usaría (como en Revisión): el original, la automática o una edición. */
  const [chosen, setChosen] = useState<{ label: string; svg: string } | null>(null);
  const [auto, setAuto] = useState<FresaFixResult | null | undefined>(undefined);
  const target: FresaTarget = Number(longSide) > 0 ? { mode: 'fabricacion', longSideMm: Number(longSide) } : { mode: 'declarado' };
  const report = useFresaReport(svg, target);
  const targetKey = JSON.stringify(target);

  // Como en Revisión: la corrección automática corre sola al cargar el vector.
  useEffect(() => {
    let alive = true;
    setAuto(undefined);
    setChosen(null);
    void autoCorregir(svg, JSON.parse(targetKey) as FresaTarget).then((r) => {
      if (!alive) return;
      setAuto(r.fix);
      if (r.fix) setChosen({ label: 'Automático', svg: r.fix.svg });
    });
    return () => {
      alive = false;
    };
  }, [svg, targetKey]);

  // ?src=<url>&largo=<mm>: cargar un SVG por URL (por ejemplo, un vector guardado).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const src = q.get('src');
    if (q.get('largo')) setLongSide(q.get('largo')!);
    if (!src) return;
    void fetch(src)
      .then((r) => r.text())
      .then((t) => {
        setSvg(t);
        setName(src.split('/').pop()?.replace(/\.svg$/i, '') ?? 'vector');
      });
  }, []);

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sandbox · /dev/chequeo-fresa</p>
          <h1 className="text-2xl font-semibold">Chequeo de fresa</h1>
          <p className="text-sm text-muted-foreground">
            Elegí un SVG. Sin medida, se usa la que declara el archivo; con medida, se escala el lado largo a ese valor
            (como hace el gadget con la medida de fabricación).
          </p>
        </header>
        <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Archivo SVG</span>
            <input
              type="file"
              accept=".svg,image/svg+xml"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setSvg(await f.text());
                setName(f.name.replace(/\.svg$/i, ''));
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Lado largo de fabricación (mm)</span>
            <input
              className="w-32 rounded border px-2 py-1"
              inputMode="decimal"
              placeholder="del archivo"
              value={longSide}
              onChange={(e) => setLongSide(e.target.value.replace(',', '.'))}
            />
          </label>
          <FresaChip report={report} onClick={() => setOpen(true)} />
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() => setOpen(true)}
          >
            Abrir chequeo
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {auto === undefined
            ? 'Corrigiendo y simplificando…'
            : auto
              ? `Automático: ${resumenOperaciones(auto.operations)}`
              : 'Automático: no hay nada para cambiar.'}{' '}
          Se usaría: <strong>{chosen?.label ?? 'Original'}</strong>.
        </p>
        <div className="flex h-64 items-center justify-center rounded-lg border bg-white p-4">
          <img
            alt=""
            className="max-h-full max-w-full"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(chosen?.svg ?? svg)}`}
          />
        </div>
      </div>
      <FresaCheckDialog
        open={open}
        onOpenChange={setOpen}
        title={name}
        svgText={svg}
        target={target}
        downloadName={name}
        initialFix={auto ?? null}
        onUseOriginal={() => setChosen({ label: 'Original', svg })}
        onApply={(next, fix) =>
          setChosen({ label: fix.operations.some((o) => o.kind === 'manual') ? 'A mano' : 'Automático', svg: next })
        }
        applyLabel="Usar el corregido"
        applyHint="En el sandbox solo cambia la vista previa de esta página."
      />
    </div>
  );
}
