import { aiSchema, focusSchema } from "./interpret";
import type { AiRaw } from "./types";

export const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiError extends Error {}

export type GeminiUsage = { input: number | null; output: number | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(body: unknown, key: string): Promise<{ text: string; usage: GeminiUsage; finish: string }> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // API 키는 주소가 아니라 헤더로 보냅니다 (주소는 로그에 남기 쉬움)
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      if (res.status === 429 || res.status >= 500) { last = `상태 ${res.status}`; await sleep(4000 * (attempt + 1)); continue; }
      if (!res.ok) throw new GeminiError(`Gemini 거절 (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const j = await res.json();
      const cand = j?.candidates?.[0];
      const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      if (!text) { last = `빈 응답 (${cand?.finishReason ?? "?"})`; await sleep(2000); continue; }
      return { text, finish: String(cand?.finishReason ?? ""), usage: { input: j?.usageMetadata?.promptTokenCount ?? null, output: j?.usageMetadata?.candidatesTokenCount ?? null } };
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      last = e instanceof Error ? e.message : String(e);
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new GeminiError(`Gemini 응답을 받지 못했습니다 (${last})`);
}

/** 형식을 강제한 해석 요청. 응답이 형식에 안 맞거나 도중에 잘리면, 더 짧게 써 달라고 하며 한 번 더 시도합니다. */
export async function interpret(prompt: string, langCodes: string[] = []): Promise<{ raw: AiRaw; usage: GeminiUsage }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.");
  const shorter = "\n\n[분량 주의] 직전 응답이 너무 길어 잘렸다. 이번에는 모든 summary 를 1문장으로, language_notes 는 표본이 많은 상위 5개 언어만, themes 는 최대 6개로 줄여서 써라.";
  let lastErr = "";
  for (let i = 0; i < 2; i++) {
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt + (i > 0 ? shorter : "") }] }],
      generationConfig: {
        temperature: 0.3, maxOutputTokens: 16384, responseMimeType: "application/json", responseSchema: aiSchema(langCodes),
        thinkingConfig: { thinkingBudget: 0 },   // 비용·시간 절약 (표본 해석에는 긴 사고가 필요 없음)
      },
    };
    const { text, usage, finish } = await call(body, key);
    try {
      const raw = JSON.parse(text) as AiRaw;
      if (raw && typeof raw === "object" && Array.isArray(raw.themes)) return { raw, usage };
      lastErr = "필수 항목 누락";
    } catch {
      lastErr = finish === "MAX_TOKENS" ? "응답이 길어서 잘림" : "JSON 해석 실패";
    }
  }
  throw new GeminiError(`AI 응답 형식이 맞지 않았습니다 (${lastErr}). 잠시 뒤 다시 시도해 주세요.`);
}

/** 주목 언어만 따로 해석하는 요청. 실패해도 분석 전체를 멈추지 않도록 호출하는 쪽에서 처리합니다. */
export async function interpretFocus(prompt: string, langCodes: string[] = []): Promise<{ raw: { notes: { language_code: string; summary: string; review_ids: string[] }[] }; usage: GeminiUsage }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: focusSchema(langCodes), thinkingConfig: { thinkingBudget: 0 } },
  };
  const { text, usage } = await call(body, key);
  try { return { raw: JSON.parse(text), usage }; } catch { throw new GeminiError("주목 언어 해석 응답 형식이 맞지 않았습니다."); }
}
