"use client";

import { useState, useEffect, useRef } from "react";
import type { QAItem } from "@/lib/types";
import { Send } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface Props {
  uuid: string;
  initialQA?: QAItem[];
  placeholder?: string;
  btnLabel?: string;
}

export default function QASection({ uuid, initialQA = [], placeholder, btnLabel }: Props) {
  const [history, setHistory] = useState<QAItem[]>(initialQA);
  const [question, setQuestion] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [history]);

  const askQuestion = async () => {
    if (!question.trim() || loading) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "질문 처리 실패");
      setHistory(prev => [...prev, {
        qa_uuid: data.qa_uuid,
        q: question.trim(),
        a: data.answer,
        asked_at: data.asked_at ?? new Date().toISOString(),
      }]);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-heading">🙋 AI에게 추가 질문하기</h3>
        <p className="text-sm" style={{ color: "#4A4A4A", marginBottom: 16, lineHeight: 1.6 }}>
          현재 작성된 분석 리포트를 기반으로 궁금한 점을 물어보세요.
          질문과 답변은 모든 방문자가 볼 수 있도록 누적 저장됩니다.
        </p>
      </div>

      {/* 입력창 */}
      <div className="neo-input-wrap">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && askQuestion()}
          placeholder={placeholder ?? "예: 그래픽 관련 부정적인 여론이 있어?"}
          disabled={loading}
          className="flex-1 bg-transparent text-sm focus:outline-none px-3"
          style={{ color: "#1A1A1A", minWidth: 0 }}
        />
        <button
          onClick={askQuestion}
          disabled={loading || !question.trim()}
          className="neo-button flex-shrink-0 px-4 py-2 text-sm"
          style={{ backgroundColor: "#FFD600", color: "#1A1A1A" }}
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1A1A1A", borderTopColor: "transparent" }} />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {loading ? "분석 중..." : (btnLabel ?? "질문하기")}
        </button>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-xl"
          style={{ background: "#FFF5F5", border: "2px solid #FF6B6B", color: "#C0392B" }}>
          {error}
        </p>
      )}

      {/* Q&A 히스토리 */}
      {history.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-black" style={{ color: "#9CA3AF" }}>💬 질문 히스토리</p>
            <span
              className="text-xs font-black px-2 py-0.5 rounded-full"
              style={{ background: "#F0EFEC", border: "2px solid #1A1A1A", color: "#4A4A4A" }}
            >
              {history.length}건
            </span>
          </div>
          <div className="space-y-4">
            {history.map((qa, i) => (
              <div key={qa.qa_uuid ?? i} className="card p-4 space-y-3">
                {/* 질문 */}
                <div className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                    style={{ background: "#1A1A1A", color: "#FFFFFF", border: "2px solid #1A1A1A" }}
                  >Q</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm leading-snug" style={{ color: "#1A1A1A" }}>{qa.q}</p>
                    {qa.asked_at && (
                      <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{formatDateTime(qa.asked_at)}</p>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #E2E8F0" }} />
                {/* 답변 */}
                <div className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                    style={{ background: "#56D0A0", color: "#1A1A1A", border: "2px solid #1A1A1A" }}
                  >AI</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#1A1A1A" }}>{qa.a}</p>
                    {qa.qa_uuid && (
                      <p className="text-xs mt-2 font-mono" style={{ color: "#9CA3AF" }}>#{qa.qa_uuid.slice(0, 8)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
