import { invalidBody, settingsError } from "@/server/api/ai-model-route";
import { platformAdmin } from "@/server/auth/platform-admin";
import { listAiModels, saveAiTier, TierInput } from "@/server/services/ai-models";

/** Sets a tier's model and backup. */
export async function PUT(request: Request) {
  const admin = await platformAdmin(request);
  if (admin instanceof Response) return admin;
  const body = TierInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidBody(body.error);
  try {
    await saveAiTier(admin, body.data);
    return Response.json(await listAiModels());
  } catch (error) {
    return settingsError(error);
  }
}
