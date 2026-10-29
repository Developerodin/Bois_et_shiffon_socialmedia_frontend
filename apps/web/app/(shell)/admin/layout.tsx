import { AdminNav } from "@/components/admin/admin-nav";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";

/** The platform admin console's frame: section navigation beside every page. Each page also guards itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdminPage();
  return (
    <div className="mx-auto grid max-w-[96rem] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-8 2xl:px-10">
      <aside className="lg:border-r lg:border-border lg:pr-4">
        <AdminNav />
      </aside>
      <div className="flex min-w-0 flex-col gap-10">{children}</div>
    </div>
  );
}
