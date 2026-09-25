import type { Program, ProgramStamp, ProgramMachineType, ProgramLifecycleState, FabricationState } from '@/lib/types/index';

const PLACEHOLDER_PREVIEW = '/changelog/sandbox/hero.jpg';

function stamp(
  partial: Partial<ProgramStamp> & Pick<ProgramStamp, 'id' | 'designName'>,
): ProgramStamp {
  return {
    widthMm: 25,
    heightMm: 40,
    stampType: 'CLASICO',
    tipoPlanchuela: 25,
    lengthAlongMm: 42,
    fabricationState: 'SIN_HACER',
    previewUrl: PLACEHOLDER_PREVIEW,
    ...partial,
  };
}

function baseProgram(
  overrides: Partial<Program> & Pick<Program, 'id' | 'name' | 'machine' | 'estadoPrograma'>,
): Program {
  const stamps = overrides.stamps ?? [];
  return {
    description: '',
    version: '1.0',
    status: 'active',
    category: 'PRODUCTION',
    stampCount: stamps.length,
    productionDate: '2026-09-22',
    fabricationState: 'SIN_HACER',
    isVerified: false,
    stamps,
    lengthUsed: 25,
    lengthByPlanchuela: stamps.length
      ? { 25: stamps.reduce((acc, s) => acc + (s.lengthAlongMm ?? 40), 0) }
      : {},
    bloqueado: false,
    dirty: false,
    createdAt: '2026-09-20T12:00:00Z',
    lastUpdated: '2026-09-22T12:00:00Z',
    createdBy: 'dev@alcohn',
    ...overrides,
  };
}

export type ProgramCardScenario = {
  id: string;
  title: string;
  description: string;
  /** Abrir expandido por defecto en el sandbox. */
  defaultExpanded?: boolean;
  program: Program;
};

const stampsC: ProgramStamp[] = [
  stamp({ id: 's1', designName: 'Chaverle', widthMm: 24.1, heightMm: 38, tipoPlanchuela: 25 }),
  stamp({ id: 's2', designName: 'La Herradura', widthMm: 38, heightMm: 50, tipoPlanchuela: 38, lengthAlongMm: 55 }),
  stamp({ id: 's3', designName: 'El Galpón', widthMm: 19, heightMm: 30, tipoPlanchuela: 19, lengthAlongMm: 35 }),
];

export const PROGRAM_CARD_SCENARIOS: ProgramCardScenario[] = [
  {
    id: 'borrador-vacio',
    title: 'Borrador vacío',
    description: 'Programa recién creado, sin sellos.',
    program: baseProgram({
      id: 'p-borrador-vacio',
      name: '22 SEP x0 C',
      machine: 'C',
      estadoPrograma: 'BORRADOR',
      stamps: [],
      stampCount: 0,
    }),
  },
  {
    id: 'borrador-con-sellos',
    title: 'Borrador con sellos',
    description: 'Todavía no se descargó el paquete.',
    defaultExpanded: true,
    program: baseProgram({
      id: 'p-borrador-sellos',
      name: '22 SEP x3 C',
      machine: 'C',
      estadoPrograma: 'BORRADOR',
      stamps: stampsC,
      stampCount: 3,
      // ~25% de capacidad C (4×400 = 1600 → 400mm)
      lengthByPlanchuela: { 25: 100, 38: 100, 19: 100, 12: 100 },
    }),
  },
  {
    id: 'listo',
    title: 'Listo',
    description: 'Paquete generado, sin cambios pendientes.',
    program: baseProgram({
      id: 'p-listo',
      name: '21 SEP x5 G',
      machine: 'G',
      estadoPrograma: 'LISTO',
      dirty: false,
      archivoZipUrl: 'https://example.com/fake.zip',
      archivoZipGeneradoAt: '2026-09-21T18:00:00Z',
      stamps: [
        stamp({ id: 'g1', designName: 'Norte' }),
        stamp({ id: 'g2', designName: 'Sur', tipoPlanchuela: 38, widthMm: 38, lengthAlongMm: 50 }),
      ],
      stampCount: 2,
      lengthByPlanchuela: { 25: 42, 38: 50 },
    }),
  },
  {
    id: 'listo-dirty',
    title: 'Listo · ZIP desactualizado',
    description: 'Se editó después de la última descarga (dirty).',
    program: baseProgram({
      id: 'p-dirty',
      name: '20 SEP x4 C',
      machine: 'C',
      estadoPrograma: 'LISTO',
      dirty: true,
      archivoZipUrl: 'https://example.com/fake.zip',
      stamps: stampsC.slice(0, 2),
      stampCount: 2,
      lengthByPlanchuela: { 25: 42, 38: 55 },
    }),
  },
  {
    id: 'bloqueado',
    title: 'Bloqueado',
    description: 'Candado manual: no se edita ni se agregan sellos.',
    defaultExpanded: true,
    program: baseProgram({
      id: 'p-bloqueado',
      name: '19 SEP x7 XL',
      machine: 'XL',
      estadoPrograma: 'BLOQUEADO',
      bloqueado: true,
      stamps: [
        stamp({ id: 'x1', designName: 'Acero' }),
        stamp({ id: 'x2', designName: 'Bronce', tipoPlanchuela: 38, widthMm: 38 }),
        stamp({ id: 'x3', designName: 'Cobre', tipoPlanchuela: 12, widthMm: 12, heightMm: 20, lengthAlongMm: 25 }),
      ],
      stampCount: 3,
      lengthByPlanchuela: { 25: 42, 38: 50, 12: 25 },
      archivoAspireUrl: 'https://example.com/fake.crv3d',
      archivoAspireNombre: '19 SEP x7 XL.crv3d',
    }),
  },
  {
    id: 'en-fabricacion',
    title: 'En fabricación',
    description: 'Programa en curso en máquina.',
    program: baseProgram({
      id: 'p-fab',
      name: '22 SEP x6 C',
      machine: 'C',
      estadoPrograma: 'EN_FABRICACION',
      fabricationState: 'HACIENDO',
      stamps: stampsC.map((s) => ({ ...s, fabricationState: 'HACIENDO' as FabricationState })),
      stampCount: 3,
      lengthByPlanchuela: { 25: 42, 38: 55, 19: 35 },
      syncAt: '2026-09-22T10:00:00Z',
      syncOrigen: 'GADGET',
      archivoAspireUrl: 'https://example.com/prog.crv3d',
      archivoAspireNombre: '22 SEP x6 C.crv3d',
      previewUrl: PLACEHOLDER_PREVIEW,
    }),
  },
  {
    id: 'finalizado',
    title: 'Finalizado',
    description: 'Todo hecho / programa cerrado.',
    program: baseProgram({
      id: 'p-fin',
      name: '15 SEP x4 G',
      machine: 'G',
      estadoPrograma: 'FINALIZADO',
      fabricationState: 'HECHO',
      isVerified: true,
      bloqueado: true,
      stamps: [
        stamp({ id: 'f1', designName: 'Cerrado A', fabricationState: 'HECHO' }),
        stamp({ id: 'f2', designName: 'Cerrado B', fabricationState: 'HECHO', tipoPlanchuela: 38, widthMm: 38 }),
      ],
      stampCount: 2,
      lengthByPlanchuela: { 25: 42, 38: 50 },
      archivoAspireUrl: 'https://example.com/done.crv3d',
      archivoAspireNombre: '15 SEP x4 G.crv3d',
      previewUrl: PLACEHOLDER_PREVIEW,
    }),
  },
  {
    id: 'no-importados',
    title: 'Sellos no entraron al Aspire',
    description: 'Alerta sync_payload.sellos_no_importados (ej. .eps).',
    defaultExpanded: true,
    program: baseProgram({
      id: 'p-no-imp',
      name: '22 SEP x5 C',
      machine: 'C',
      estadoPrograma: 'EN_FABRICACION',
      stamps: stampsC,
      stampCount: 3,
      lengthByPlanchuela: { 25: 42, 38: 55, 19: 35 },
      syncOrigen: 'GADGET',
      syncAt: '2026-09-22T11:00:00Z',
      syncPayload: {
        sellos_no_importados: [
          {
            sello_id: 's-eps-1',
            diseno: 'Vector Viejo',
            motivo: 'el vector esta en .eps, re-vectorizalo.',
          },
          {
            sello_id: 's-eps-2',
            diseno: 'Logo Cliente',
            motivo: 'no se pudo importar el vector',
          },
        ],
      },
    }),
  },
  {
    id: 'otra-planchuela',
    title: 'Otra planchuela',
    description: 'sellos_en_otra_planchuela (ej. Chaverle en 38).',
    program: baseProgram({
      id: 'p-otra',
      name: '22 SEP x3 C',
      machine: 'C',
      estadoPrograma: 'EN_FABRICACION',
      stamps: stampsC,
      stampCount: 3,
      lengthByPlanchuela: { 25: 42, 38: 55, 19: 35 },
      syncPayload: {
        sellos_en_otra_planchuela: [
          {
            sello_id: 's1',
            diseno: 'Chaverle',
            planificada: 25,
            real: 38,
          },
        ],
      },
      previewUrl: PLACEHOLDER_PREVIEW,
    }),
  },
  {
    id: 'alertas-combinadas',
    title: 'Todas las alertas',
    description: 'ZIP stale + no importados + otra planchuela + preview + Aspire.',
    defaultExpanded: true,
    program: baseProgram({
      id: 'p-combo',
      name: '18 SEP x8 XL',
      machine: 'XL',
      estadoPrograma: 'LISTO',
      dirty: true,
      archivoZipUrl: 'https://example.com/old.zip',
      archivoAspireUrl: 'https://example.com/combo.crv3d',
      archivoAspireNombre: '18 SEP x8 XL.crv3d',
      previewUrl: PLACEHOLDER_PREVIEW,
      description: 'Prioridad del día + correcciones pendientes.',
      stamps: [
        ...stampsC,
        stamp({ id: 'p1', designName: 'Prioritario', isPriority: true, notes: 'Sale hoy' }),
        stamp({ id: 'p2', designName: 'Mini', tipoPlanchuela: 12, widthMm: 12, heightMm: 18, lengthAlongMm: 22 }),
      ],
      stampCount: 5,
      lengthByPlanchuela: { 25: 84, 38: 55, 19: 35, 12: 22 },
      syncPayload: {
        sellos_no_importados: [
          { sello_id: 'bad1', diseno: 'EPS Roto', motivo: 'formato .eps no soportado' },
        ],
        sellos_en_otra_planchuela: [
          { sello_id: 's1', diseno: 'Chaverle', planificada: 25, real: 38 },
          { sello_id: 'p2', diseno: 'Mini', planificada: 12, real: 19 },
        ],
      },
    }),
  },
  {
    id: 'abc',
    title: 'Máquina ABC',
    description: 'Sin descarga ZIP (canDownloadPackage = false).',
    program: baseProgram({
      id: 'p-abc',
      name: '22 SEP x2 ABC',
      machine: 'ABC' as ProgramMachineType,
      estadoPrograma: 'BORRADOR',
      stamps: [
        stamp({ id: 'a1', designName: 'Letra A', stampType: 'ABC', widthMm: 20, heightMm: 20 }),
        stamp({ id: 'a2', designName: 'Letra B', stampType: 'ABC', widthMm: 20, heightMm: 20 }),
      ],
      stampCount: 2,
      lengthByPlanchuela: { 25: 40 },
    }),
  },
  {
    id: 'sin-preview-con-aspire',
    title: 'Aspire sin preview 2D',
    description: 'Archivo subido pero sin miniatura.',
    program: baseProgram({
      id: 'p-aspire-only',
      name: '17 SEP x3 G',
      machine: 'G',
      estadoPrograma: 'EN_FABRICACION',
      stamps: stampsC.slice(0, 2),
      stampCount: 2,
      lengthByPlanchuela: { 25: 42, 38: 55 },
      archivoAspireUrl: 'https://example.com/no-preview.crv3d',
      archivoAspireNombre: 'programa.crv3d',
      syncOrigen: 'ARCHIVO_SUBIDO',
      syncAt: '2026-09-17T16:00:00Z',
    }),
  },
  {
    id: 'lifecycle-matrix',
    title: 'Badge lifecycle (LISTO dirty)',
    description: 'Caso específico del badge “Editado, falta regenerar”.',
    program: baseProgram({
      id: 'p-badge',
      name: '16 SEP x1 C',
      machine: 'C',
      estadoPrograma: 'LISTO' as ProgramLifecycleState,
      dirty: true,
      stamps: [stamp({ id: 'one', designName: 'Único' })],
      stampCount: 1,
      lengthByPlanchuela: { 25: 42 },
      archivoZipUrl: 'https://example.com/z.zip',
    }),
  },
];
