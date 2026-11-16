import { requestUserId } from "@/server/auth/request-user";
import { problemResponse } from "@/server/api/http-error";
import { PERMISSIONS, permissionScope } from "@/server/auth/permissions.catalog";

export async function GET(request: Request) {
  if (!(await requestUserId(request))) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  return Response.json({
    permissions: PERMISSIONS.map(([key, category, description]) => ({ key, category, description, scope: permissionScope(key) })),
  });
}
