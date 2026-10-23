import HomeClient from "@/components/HomeClient";
import { plain, type Row } from "@/lib/db";
import { listDone, reapStuck, usageToday } from "@/lib/repo";
import { sql } from "@/lib/db";
import { getTexts } from "@/lib/texts";

export const revalidate = 30;
export const maxDuration = 30;

export default async function HomePage() {
  const [texts, data] = await Promise.all([
    getTexts(),
    (async () => {
      try {
        await reapStuck().catch(() => 0);
        const [usage, done, active] = await Promise.all([
          usageToday(),
          listDone(200),
          sql`select id, app_id, game_name, header_image, status, step, requested_at from analyses where status in ('queued','running') order by requested_at desc`,
        ]);
        // 같은 게임은 가장 최근 리포트 하나만 카드로 보여 주고, 몇 번 분석했는지 같이 보여 줍니다.
        const seen = new Map<number, { card: Row; count: number }>();
        for (const r of done) {
          const k = Number(r.app_id);
          const e = seen.get(k);
          if (e) e.count++; else seen.set(k, { card: r, count: 1 });
        }
        return { usage, cards: [...seen.values()].map((e) => ({ ...e.card, runs: e.count })), active: plain(active as unknown as Row[]), error: false };
      } catch {
        return { usage: { day: "", used: 0, limit: 0 }, cards: [], active: [], error: true };
      }
    })(),
  ]);
  return <HomeClient texts={texts} data={data} />;
}
