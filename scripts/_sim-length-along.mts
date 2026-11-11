import { accumulateLengthByPlanchuela, stampLengthAlongMm, validatePlanchuelaLengthLimit } from '../src/lib/programas/material';

const p38 = [
  { anchoFabricacionMm: 58.71, largoFabricacionMm: 36.48 },
  { anchoFabricacionMm: 53.29, largoFabricacionMm: 36.5 },
  { anchoFabricacionMm: 40, largoFabricacionMm: 34.66 },
  { anchoFabricacionMm: 70.94, largoFabricacionMm: 30.65 },
  { anchoFabricacionMm: 40, largoFabricacionMm: 25.66 },
  { anchoFabricacionMm: 30, largoFabricacionMm: 26.42 },
];
const lengths = accumulateLengthByPlanchuela(p38);
console.log('used P38 with 8mm cut loss/stamp', lengths[38]);
console.log('free vs 400', 400 - (lengths[38] || 0));
const bg = { anchoFabricacionMm: 55, largoFabricacionMm: 28.77 };
console.log('BG lengthAlong', stampLengthAlongMm(bg));
console.log(
  'validate',
  validatePlanchuelaLengthLimit({
    machine: 'C',
    tipoPlanchuela: 38,
    currentMm: lengths[38] || 0,
    extraMm: stampLengthAlongMm(bg),
  }),
);

const l2 = accumulateLengthByPlanchuela(p38.slice(0, 5));
console.log('used without SX', l2[38], 'free', 400 - (l2[38] || 0));
console.log(
  'validate without SX',
  validatePlanchuelaLengthLimit({
    machine: 'C',
    tipoPlanchuela: 38,
    currentMm: l2[38] || 0,
    extraMm: stampLengthAlongMm(bg),
  }),
);

// What free would show if UI did 400 - designOnly (no per-stamp cut)?
const designOnly = p38.reduce((s, x) => s + Math.max(x.anchoFabricacionMm, x.largoFabricacionMm), 0);
console.log('design only sum', designOnly, 'free design vs 400', 400 - designOnly);
console.log('design + 5*8 gaps', designOnly + 40, 'free', 400 - designOnly - 40);
