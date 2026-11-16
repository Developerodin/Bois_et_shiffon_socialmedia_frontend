import { problemResponse } from "@/server/api/http-error";
import { requestUserId } from "@/server/auth/request-user";
import { prisma } from "@/server/db/prisma";
import { listUserWorkspaces } from "@/server/services/brands";

export async function GET(request: Request) {
  const userId = await requestUserId(request);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, image: true } }) : null;
  if (!user) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Sign in required",
    });
  }

  const workspaces = await listUserWorkspaces(user.id);

  return Response.json({ user, workspaces });
}
