"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  SHELL_COOKIE_BRAND,
  SHELL_COOKIE_MAX_AGE,
  SHELL_COOKIE_WORKSPACE,
} from "@/lib/shell-cookies";
import { requireBrandAccess, requireWorkspaceMember } from "@/server/auth/access";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function setActiveWorkspace(workspaceId: string) {
  const userId = await requireUserId();
  await requireWorkspaceMember(workspaceId, userId);

  const cookieStore = await cookies();
  cookieStore.set(SHELL_COOKIE_WORKSPACE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SHELL_COOKIE_MAX_AGE,
  });
  cookieStore.delete(SHELL_COOKIE_BRAND);
  revalidatePath("/", "layout");
}

export async function setActiveBrand(workspaceId: string, brandId: string) {
  const userId = await requireUserId();
  await requireBrandAccess(workspaceId, brandId, userId, {
    allowArchived: true,
  });

  const cookieStore = await cookies();
  cookieStore.set(SHELL_COOKIE_WORKSPACE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SHELL_COOKIE_MAX_AGE,
  });
  cookieStore.set(SHELL_COOKIE_BRAND, brandId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SHELL_COOKIE_MAX_AGE,
  });
  revalidatePath("/", "layout");
}
