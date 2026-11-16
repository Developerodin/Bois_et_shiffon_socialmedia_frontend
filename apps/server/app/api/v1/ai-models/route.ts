import { invalidBody, settingsError } from "@/server/api/ai-model-route";
import { platformAdmin } from "@/server/auth/platform-admin";
import { listAiModels, ModelInput, saveAiModel } from "@/server/services/ai-models";

/** Platform admin → AI models: every model with its price and flags, and each tier's model and backup. */
export async function GET(request: Request) {
  const admin = await platformAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json(await listAiModels());
}

/** Adds a model (its name is checked with OpenAI) or updates one. */
export async function PUT(request: Request) {
  const admin = await platformAdmin(request);
  if (admin instanceof Response) return admin;
  const body = ModelInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidBody(body.error);
  try {
    await saveAiModel(admin, body.data);
    return Response.json(await listAiModels());
  } catch (error) {
    return settingsError(error);
  }
}
