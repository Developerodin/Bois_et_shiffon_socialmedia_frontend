/** Idempotent seed (Postgres on Neon). Re-run safe via upsert. */
import { PrismaClient, WorkspaceRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureSystemRoles } from "../server/auth/permissions";
import { LEGACY_ROLE_SLUG } from "../server/auth/permissions.catalog";

const prisma = new PrismaClient();

function loadSeedFixture() {
  const pathFromEnv = process.env.SEED_BRANDS_PATH;
  const fixturePath =
    pathFromEnv ?? join(process.cwd(), "prisma", "seeds", "bc-brand.json");
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as {
    workspace: { name: string; slug: string };
    brand: { slug: string; displayName: string };
    profile: {
      websiteUrl?: string;
      voiceSummary?: string;
      pillars?: string[];
      locales?: string[];
    };
    seedUser: { email: string; name: string; passwordEnv: string };
  };
}

async function main() {
  const fixture = loadSeedFixture();
  const password =
    process.env[fixture.seedUser.passwordEnv] ??
    process.env.SEED_OWNER_PASSWORD ??
    "changeme-dev-only";
  if (process.env.NODE_ENV === "production" && (password === "changeme-dev-only" || password.length < 12)) {
    throw new Error("Refusing to seed a weak owner password in production (set SEED_OWNER_PASSWORD)");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: fixture.seedUser.email },
    update: { name: fixture.seedUser.name, passwordHash },
    create: {
      email: fixture.seedUser.email,
      name: fixture.seedUser.name,
      passwordHash,
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: fixture.workspace.slug },
    update: { name: fixture.workspace.name },
    create: {
      name: fixture.workspace.name,
      slug: fixture.workspace.slug,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    update: { role: WorkspaceRole.OWNER },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });

  const brand = await prisma.brand.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: fixture.brand.slug,
      },
    },
    update: { displayName: fixture.brand.displayName },
    create: {
      workspaceId: workspace.id,
      slug: fixture.brand.slug,
      displayName: fixture.brand.displayName,
    },
  });

  await prisma.brandProfile.upsert({
    where: { brandId: brand.id },
    update: {
      workspaceId: workspace.id,
      websiteUrl: fixture.profile.websiteUrl,
      voiceSummary: fixture.profile.voiceSummary,
      pillars: fixture.profile.pillars,
      locales: fixture.profile.locales,
    },
    create: {
      workspaceId: workspace.id,
      brandId: brand.id,
      websiteUrl: fixture.profile.websiteUrl,
      voiceSummary: fixture.profile.voiceSummary,
      pillars: fixture.profile.pillars,
      locales: fixture.profile.locales,
    },
  });

  // RBAC: system roles in every workspace, then move legacy enum roles onto DB roles.
  for (const ws of await prisma.workspace.findMany({ select: { id: true } })) {
    await ensureSystemRoles(ws.id, prisma);
    const roles = await prisma.role.findMany({ where: { workspaceId: ws.id, isSystem: true } });
    for (const m of await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id, roleId: null } })) {
      const role = roles.find((r) => r.slug === LEGACY_ROLE_SLUG[m.role]);
      if (role) await prisma.workspaceMember.update({ where: { id: m.id }, data: { roleId: role.id } });
    }
  }

  // Admin user (owner of the seeded workspace). Credentials come from env only.
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  let adminId: string | null = null;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
    const ownerRole = await prisma.role.findUniqueOrThrow({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: "owner" } },
    });
    const adminHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash: adminHash, status: "ACTIVE", deletedAt: null },
      create: {
        email: adminEmail,
        name: process.env.SEED_ADMIN_NAME ?? "Platform Admin",
        passwordHash: adminHash,
        status: "ACTIVE",
      },
    });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
      update: { role: WorkspaceRole.OWNER, roleId: ownerRole.id },
      create: { workspaceId: workspace.id, userId: admin.id, role: WorkspaceRole.OWNER, roleId: ownerRole.id },
    });
    adminId = admin.id;
    await prisma.workspace.updateMany({ where: { id: workspace.id, ownerUserId: null }, data: { ownerUserId: admin.id } });
  } else {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — admin user skipped");
  }

  console.log("Seed complete:", {
    workspaceId: workspace.id,
    brandId: brand.id,
    userId: user.id,
    adminUserId: adminId,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
