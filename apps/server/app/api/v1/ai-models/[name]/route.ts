import { settingsError } from "@/server/api/ai-model-route";
import { platformAdmin } from "@/server/auth/platform-admin";
import { deleteAiModel, listAiModels } from "@/server/services/ai-models";

/** Removes a model no tier uses. */
export async function DELETE(request: Request, context: { params: Promise<{ name: string }> }) {
  const admin = await platformAdmin(request);
  if (admin instanceof Response) return admin;
  try {
    await deleteAiModel(admin, decodeURIComponent((await context.params).name));
    return Response.json(await listAiModels());
  } catch (error) {
    return settingsError(error);
  }
}
