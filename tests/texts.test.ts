import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { TEXT_DEFS } from "../src/lib/text-defs";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });
const keys = new Set(TEXT_DEFS.map((t) => t.key));
const src = [...walk("src/components"), ...walk("src/app")].filter((f) => !/TextsClient\.tsx$|[\\/]api[\\/]/.test(f)).map((f) => [f, readFileSync(f, "utf8")] as const);

test("문구 키는 중복되지 않는다", () => assert.equal(keys.size, TEXT_DEFS.length));

test("화면 코드가 쓰는 t.키 는 모두 문구 목록에 있다", () => {
  const missing: string[] = [];
  for (const [f, s] of src) for (const m of s.matchAll(/\bt\.([a-z][a-z0-9_]*)\b/g)) if (!keys.has(m[1]) && !["length"].includes(m[1])) missing.push(`${f}: ${m[1]}`);
  assert.deepEqual(missing, []);
});

test("동적 키(t[`...`])의 모든 경우가 문구 목록에 있다", () => {
  for (const k of ["sum", "lang", "play", "chg", "how"]) assert.ok(keys.has(`tab_${k}`), `tab_${k}`);
  for (const k of ["tiny", "small", "medium", "large"]) assert.ok(keys.has(`size_${k}`), `size_${k}`);
  for (const k of ["game_info", "stats", "segments", "news", "reviews", "ai", "saving"]) assert.ok(keys.has(`step_${k}`), `step_${k}`);
  for (let n = 1; n <= 6; n++) { assert.ok(keys.has(`about_${n}_title`)); assert.ok(keys.has(`about_${n}_body`)); }
});

test("목록의 모든 문구가 화면 코드에서 실제로 쓰인다", () => {
  const all = src.map(([, s]) => s).join("\n");
  const dyn = /^(tab_|size_|step_|about_\d_)/;
  const unused = TEXT_DEFS.filter((t) => !dyn.test(t.key) && !new RegExp(String.raw`\bt\.${t.key}\b`).test(all)).map((t) => t.key);
  assert.deepEqual(unused, []);
});

import { noEmoji } from "../src/lib/format";
import { stripEmoji } from "../src/lib/interpret";
test("이모지는 AI 글과 화면 이름에서 모두 지워진다", () => {
  assert.equal(stripEmoji("좋아요 👍 최고 🇰🇷"), "좋아요 최고 ");
  assert.equal(noEmoji("🇺🇸 영어"), "영어");
  assert.equal(noEmoji("🏰 서유럽 언어권"), "서유럽 언어권");
  assert.equal(noEmoji("한국어 (ko) 1,234건"), "한국어 (ko) 1,234건");
});
