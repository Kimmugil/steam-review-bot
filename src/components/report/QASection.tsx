"use client";

import { useState } from "react";
import type { QAItem } from "@/lib/types";
import { Send } from "lucide-react";

interface Props {
  uuid: string;
  initialQA?: QAItem[];
  placeholder?: string;
  btnLabel?: string;
}

export default function QASection({ uuid, initialQA = [], placeholder, btnLabel }: Props) {
  const [history, setHistory] = useState<QAItem[]>(initialQA);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askQuestion = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "질문 처리 실패");
      setHistory([...history, { q: question.trim(), a: data.answer }]);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-heading">🙋‍♀️ AI에게 추가 질문하기</h3>
        <p className="text-sm text-slate-500 mb-4">
          현재 작성된 분석 리포트를 기반으로 궁금한 점을 물어보세요.
        </p>
      </div>

      {/* Q&A History */}
      {history.length > 0 && (
        <div className="space-y-4 mb-5">
          {history.map((qa, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">Q</span>
                <p className="text-sm font-semibold text-slate-800 pt-0.5">{qa.q}</p>
              </div>
              <div className="flex items-start gap-3 ml-0">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">AI</span>
                <div className="card bg-slate-50 p-4 flex-1">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{qa.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="card p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && askQuestion()}
            placeholder={placeholder ?? "예: 그래픽 관련 부정적인 여론이 있어?"}
            disabled={loading}
            className="flex-1 text-sm border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-800 disabled:bg-slate-100 transition"
          />
          <button
            onClick={askQuestion}
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition flex items-center gap-1.5"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {loading ? "분석 중..." : (btnLabel ?? "질문하기")}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
