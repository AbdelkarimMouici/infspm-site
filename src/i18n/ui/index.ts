import { ar } from './ar';
import { fr } from './fr';
import type { Locale } from '../config';

/** Arabic is the reference: every other language must define exactly the same keys. */
export type UIKey = keyof typeof ar;
export type UIStrings = Record<UIKey, string>;

export const ui: Record<Locale, UIStrings> = { ar, fr };
