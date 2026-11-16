import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { getShell } from "@/lib/server-fetch";

/** The platform admin console's frame: section navigation beside every page. A plain 404 for anyone but a platform admin, so the console's existence isn't revealed (each page's data comes from admin API routes that answer 404 too).
 * No side padding of its own: the app frame (MainArea) already pads every page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getShell()).isPlatformAdmin) notFound();
  return (
    <div className="mx-auto grid max-w-[96rem] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-2">
      <aside className="lg:border-r lg:border-border lg:pr-4">
        <AdminNav />
      </aside>
      <div className="flex min-w-0 flex-col gap-10">{children}</div>
    </div>
  );
}
