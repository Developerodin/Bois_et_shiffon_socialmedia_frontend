import { auth } from "@/auth";
import { problemResponse } from "@/server/api/http-error";
import { PERMISSIONS } from "@/server/auth/permissions.catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  return Response.json({
    permissions: PERMISSIONS.map(([key, category, description]) => ({ key, category, description })),
  });
}
