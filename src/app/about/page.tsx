import Link from "next/link";
import { Bullets } from "@/components/Rich";
import { LANG_MAP } from "@/lib/config";
import { fill } from "@/lib/format";
import { getTexts } from "@/lib/texts";

export async function generateMetadata() {
  const t = await getTexts();
  return { title: `${t.nav_about} · ${t.site_title}` };
}

export default async function AboutPage() {
  const t = await getTexts();
  const langs = Object.values(LANG_MAP).join(" · ");
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Link href="/" className="back">{t.back_list}</Link>
      <div className="hero"><h1>{t.about_title}</h1><p>{t.about_intro}</p></div>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div key={n} className="card method">
          <h2>{t[`about_${n}_title`]}</h2>
          <Bullets text={fill(t[`about_${n}_body`], { languages: langs })} />
        </div>
      ))}
    </div>
  );
}
