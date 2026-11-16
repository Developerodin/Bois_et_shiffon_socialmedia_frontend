import type { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { AiModelSettingsError } from "@/server/services/ai-models";

/** Platform admin → AI models: one error shape for every route. */
export function settingsError(error: unknown) {
  if (error instanceof AiModelSettingsError) {
    return problemResponse({ type: "https://api.brandpilot/errors/ai-model-settings", title: "Can't save that", status: error.status, detail: error.message });
  }
  console.error("[ai-models]", error);
  return problemResponse({ type: "https://api.brandpilot/errors/internal", title: "Something went wrong", status: 500 });
}

export const invalidBody = (error: z.ZodError) =>
  problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 422, detail: error.issues[0]?.message ?? "Check the fields and try again." });
