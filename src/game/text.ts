// SPDX-License-Identifier: AGPL-3.0-only
import strings from '../data/strings.en.json';

export type StringKey = keyof typeof strings;
export type Vars = Record<string, string>;

export interface Line {
  key: StringKey;
  vars?: Vars;
  caption?: StringKey;
}

export function fmt(key: StringKey, vars: Vars = {}): string {
  return strings[key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
