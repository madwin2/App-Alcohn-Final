import type {
  AbecedarioCase,
  AbecedarioExtraLetterCounts,
  ItemConfig,
  ItemType,
  Order,
  OrderItem,
} from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';

export const ABECEDARIO_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;

export type AbecedarioLetter = (typeof ABECEDARIO_LETTERS)[number];

export type AbecedarioFormFields = {
  abecedarioTipografia?: string;
  abecedarioAlturaMm?: number;
  abecedarioMayusculas?: number;
  abecedarioMinusculas?: number;
  abecedarioExtraLetterCounts?: AbecedarioExtraLetterCounts;
  abecedarioSpecialCharsCount?: number;
  abecedarioSpecialCharsDescription?: string;
  abecedarioCase?: AbecedarioCase;
  abecedarioExtraLetters?: string;
};

export function normalizeCount(value: number | undefined | null): number {
  if (value == null || Number.isNaN(value) || value < 0) return 0;
  return Math.floor(value);
}

export function compactExtraLetterCounts(
  counts: AbecedarioExtraLetterCounts | undefined,
): AbecedarioExtraLetterCounts {
  const next: AbecedarioExtraLetterCounts = {};
  if (!counts) return next;
  for (const [letter, raw] of Object.entries(counts)) {
    const n = normalizeCount(raw);
    if (n > 0) next[letter] = n;
  }
  return next;
}

export function deriveAbecedarioCase(
  mayusculas: number | undefined,
  minusculas: number | undefined,
): AbecedarioCase {
  const mayus = normalizeCount(mayusculas);
  const minus = normalizeCount(minusculas);
  if (mayus > 0 && minus > 0) return 'AMBAS';
  if (minus > 0) return 'MINUSCULA';
  return 'MAYUSCULA';
}

export function formatAbecedarioExtras(fields: {
  abecedarioExtraLetterCounts?: AbecedarioExtraLetterCounts;
  abecedarioSpecialCharsCount?: number;
  abecedarioSpecialCharsDescription?: string;
}): string {
  const counts = compactExtraLetterCounts(fields.abecedarioExtraLetterCounts);
  const letterParts = ABECEDARIO_LETTERS
    .filter((letter) => (counts[letter] ?? 0) > 0)
    .map((letter) => `${letter} (${counts[letter]})`);
  const extraKeys = Object.keys(counts).filter(
    (key) => !ABECEDARIO_LETTERS.includes(key as AbecedarioLetter),
  );
  extraKeys.sort();
  for (const key of extraKeys) {
    letterParts.push(`${key} (${counts[key]})`);
  }

  const specialCount = normalizeCount(fields.abecedarioSpecialCharsCount);
  const specialDesc = fields.abecedarioSpecialCharsDescription?.trim();
  if (specialCount > 0) {
    letterParts.push(
      specialDesc
        ? `Caracter especial (${specialCount}), ${specialDesc}`
        : `Caracter especial (${specialCount})`,
    );
  }

  return letterParts.join(', ');
}

export function writeAbecedarioFields(
  current: AbecedarioFormFields,
  patch: Partial<AbecedarioFormFields>,
  assign: <K extends keyof AbecedarioFormFields>(key: K, value: AbecedarioFormFields[K]) => void,
) {
  const next = applyAbecedarioPatch(current, patch);
  (Object.keys(next) as (keyof AbecedarioFormFields)[]).forEach((key) => {
    assign(key, next[key]);
  });
}

export function applyAbecedarioPatch(
  current: AbecedarioFormFields,
  patch: Partial<AbecedarioFormFields>,
): AbecedarioFormFields {
  const next: AbecedarioFormFields = {
    ...current,
    ...patch,
    abecedarioExtraLetterCounts: compactExtraLetterCounts(
      patch.abecedarioExtraLetterCounts ?? current.abecedarioExtraLetterCounts,
    ),
  };
  next.abecedarioMayusculas = normalizeCount(next.abecedarioMayusculas);
  next.abecedarioMinusculas = normalizeCount(next.abecedarioMinusculas);
  next.abecedarioSpecialCharsCount = normalizeCount(next.abecedarioSpecialCharsCount);
  next.abecedarioCase = deriveAbecedarioCase(next.abecedarioMayusculas, next.abecedarioMinusculas);
  next.abecedarioExtraLetters = formatAbecedarioExtras(next) || undefined;
  return next;
}

export function buildAbecedarioItemConfig(
  fields: AbecedarioFormFields,
  extras?: Pick<ItemConfig, 'soldadorPower'>,
): ItemConfig {
  const next = applyAbecedarioPatch({}, fields);
  const extraCounts = next.abecedarioExtraLetterCounts;
  return {
    ...extras,
    abecedarioTipografia: next.abecedarioTipografia || undefined,
    abecedarioAlturaMm: next.abecedarioAlturaMm || undefined,
    abecedarioMayusculas: next.abecedarioMayusculas || undefined,
    abecedarioMinusculas: next.abecedarioMinusculas || undefined,
    abecedarioExtraLetterCounts:
      extraCounts && Object.keys(extraCounts).length > 0 ? extraCounts : undefined,
    abecedarioSpecialCharsCount: next.abecedarioSpecialCharsCount || undefined,
    abecedarioSpecialCharsDescription: next.abecedarioSpecialCharsDescription?.trim() || undefined,
    abecedarioCase: next.abecedarioCase,
    abecedarioExtraLetters: next.abecedarioExtraLetters,
  };
}

export function itemConfigFromForm(
  itemType: ItemType | undefined,
  fields: AbecedarioFormFields & { soldadorPower?: ItemConfig['soldadorPower'] },
): ItemConfig {
  if (itemType === 'ABECEDARIO') {
    return buildAbecedarioItemConfig(fields, { soldadorPower: fields.soldadorPower });
  }
  return { soldadorPower: fields.soldadorPower };
}

export function resolveAbecedarioSets(config: ItemConfig | undefined): {
  mayusculas: number;
  minusculas: number;
} {
  if (!config) return { mayusculas: 0, minusculas: 0 };
  const hasCounts =
    config.abecedarioMayusculas != null || config.abecedarioMinusculas != null;
  if (hasCounts) {
    return {
      mayusculas: normalizeCount(config.abecedarioMayusculas),
      minusculas: normalizeCount(config.abecedarioMinusculas),
    };
  }
  switch (config.abecedarioCase) {
    case 'MINUSCULA':
      return { mayusculas: 0, minusculas: 1 };
    case 'AMBAS':
      return { mayusculas: 1, minusculas: 1 };
    case 'MAYUSCULA':
      return { mayusculas: 1, minusculas: 0 };
    default:
      return { mayusculas: 0, minusculas: 0 };
  }
}

export function formatAbecedarioSummary(config: ItemConfig | undefined): string | undefined {
  if (!config) return undefined;
  const { mayusculas, minusculas } = resolveAbecedarioSets(config);
  const parts = [
    config.abecedarioTipografia?.trim() || undefined,
    config.abecedarioAlturaMm ? `${config.abecedarioAlturaMm}mm` : undefined,
    mayusculas > 0 ? `${mayusculas} may.` : undefined,
    minusculas > 0 ? `${minusculas} min.` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' • ') : undefined;
}

export function extraLettersButtonLabel(fields: AbecedarioFormFields): string {
  const summary = formatAbecedarioExtras(fields);
  return summary || 'Letras extras (opcional)';
}

export function extraLettersCount(fields: AbecedarioFormFields): number {
  const counts = compactExtraLetterCounts(fields.abecedarioExtraLetterCounts);
  const letters = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return letters + normalizeCount(fields.abecedarioSpecialCharsCount);
}

export function isAbecedarioItem(item: Pick<OrderItem, 'itemType'>): boolean {
  return item.itemType === 'ABECEDARIO';
}

export function getAbecedarioItems(order: Order): OrderItem[] {
  return order.items.filter(isAbecedarioItem);
}

export function abecedarioPreviewUrl(item: Pick<OrderItem, 'files'>): string | undefined {
  return item.files?.baseUrl || item.files?.vectorPreviewUrl || item.files?.photoUrl || undefined;
}

export function formatElementosExtraLines(order: Order, abcItem: OrderItem): string[] {
  const others = order.items.filter((item) => item.id !== abcItem.id);
  if (others.length === 0) return ['Solo abecedario'];

  return others.map((item) => formatElementoExtraLine(item));
}

export function formatElementoExtraLine(item: Pick<OrderItem, 'itemType' | 'designName' | 'itemConfig'>): string {
  const type = (item.itemType ?? 'SELLO') as ItemType;
  switch (type) {
    case 'SELLO':
      return `Sello - ${item.designName?.trim() || 'sin nombre'}`;
    case 'MANGO_GOLPE':
      return 'Accesorio - Mango de golpe';
    case 'BASE_REMACHADORA':
      return 'Accesorio - Base remachadora';
    case 'SOLDADOR':
      return `Accesorio - Soldador ${item.itemConfig?.soldadorPower || ''}`.trim();
    case 'ABECEDARIO':
      return 'Abecedario';
    default:
      return getOrderItemDisplayName(item);
  }
}
