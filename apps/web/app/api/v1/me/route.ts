import { auth } from "@/auth";
import { problemResponse } from "@/server/api/http-error";
import { listUserWorkspaces } from "@/server/services/brands";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Sign in required",
    });
  }

  const workspaces = await listUserWorkspaces(session.user.id);

  return Response.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
    workspaces,
  });
}
