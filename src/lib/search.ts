import { getGameInfo, parseAppId } from "./steam";

/** 스팀 상점 검색 (서버에서만). 이름·주소·App ID 모두 받습니다. */
export interface SteamHit { appid: number; name: string; meta: string; image: string | null }

const UA = { "User-Agent": "SteamThresher/4.0 (+https://github.com/Kimmugil/steam-review-bot)" };

export async function steamSearch(term: string): Promise<SteamHit[]> {
  const id = parseAppId(term);
  if (id) {
    const g = await getGameInfo(id).catch(() => null);
    return g ? [{ appid: id, name: g.name, meta: g.comingSoon ? "출시 예정" : g.releaseDate ? `출시 ${g.releaseDate.toISOString().slice(0, 10)}` : "스팀 상점", image: g.headerImage }] : [];
  }
  try {
    const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=koreana&cc=kr`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    return ((j.items ?? []) as { id: number; name: string; type?: string }[])
      .filter((i) => !i.type || i.type === "app")
      .slice(0, 8)
      .map((i) => ({ appid: i.id, name: i.name, meta: "스팀 상점", image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${i.id}/header.jpg` }));
  } catch {
    return [];
  }
}
