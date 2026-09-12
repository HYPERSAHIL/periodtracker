import { HI } from './i18n.hi';

export type Lang = 'en' | 'hi';

/**
 * Minimal literal-key i18n: the English source string IS the key.
 * Hindi overrides live in i18n.hi.ts; anything missing falls back to English,
 * so untranslated screens keep working instead of rendering blanks.
 * Use {placeholders} for interpolation: tx(lang, 'Hello {name}', { name }).
 */
export function tx(lang: string | null | undefined, key: string, vars?: Record<string, string | number>): string {
  let s = lang === 'hi' ? (HI[key] ?? key) : key;
  if (vars) {
    // replacer fn: values containing $&/$'/etc stay literal
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, () => String(v));
  }
  return s;
}

/** Display-layer lookup by stable id: falls back to the passed English label. */
export function txd(lang: string | null | undefined, key: string, fallback: string): string {
  if (lang !== 'hi') return fallback;
  return HI[key] ?? fallback;
}

/** Normalize a stored lang value from any source (local, backup, cloud). */
export function normLang(v: unknown): Lang {
  try {
    return String(v ?? '')
      .toLowerCase()
      .startsWith('hi')
      ? 'hi'
      : 'en';
  } catch {
    return 'en';
  }
}
