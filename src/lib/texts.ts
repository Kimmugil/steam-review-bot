import { unstable_cache } from "next/cache";
import { sql } from "./db";
import { TEXT_DEFS, type Texts } from "./text-defs";

export type { Texts };
const defaults: Texts = Object.fromEntries(TEXT_DEFS.map((t) => [t.key, t.def]));

const loadSaved = unstable_cache(
  async (): Promise<Texts> => {
    try {
      const rows = await sql`select key, value from ui_texts`;
      return Object.fromEntries(rows.map((r) => [r.key as string, r.value as string]));
    } catch {
      return {};
    }
  },
  ["ui-texts"],
  { tags: ["ui-texts"], revalidate: 60 },
);

/** 기본 문구 위에 관리자가 저장한 문구를 덮어서 돌려줍니다. (코드에 정의된 문구만 사용) */
export async function getTexts(): Promise<Texts> {
  const saved = await loadSaved();
  const out: Texts = { ...defaults };
  for (const k of Object.keys(defaults)) if (saved[k]) out[k] = saved[k];
  return out;
}

export async function getSavedKeys(): Promise<string[]> {
  const saved = await loadSaved();
  return Object.keys(defaults).filter((k) => saved[k]);
}

