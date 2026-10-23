import { redirect } from "next/navigation";
import AdminClient from "@/components/AdminClient";
import { getAdminData } from "@/lib/admin-data";
import { isAdmin } from "@/lib/auth";
import { reapStuck } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  await reapStuck().catch(() => 0);
  const data = await getAdminData();
  return <AdminClient data={data} githubConnected={!!(process.env.GITHUB_PAT ?? process.env.GH_PAT ?? process.env.GITHUB_TOKEN)} />;
}
