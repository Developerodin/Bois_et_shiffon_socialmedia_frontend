import { Zip, ZipPassThrough } from "fflate";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { PublishingError } from "@/server/services/publishing";
import { storyPackage } from "@/server/stories/by-hand";
import { stepsText } from "@espanda/shared";

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

const HEADERS = { "Cache-Control": "no-store" };

/**
 * An approved story's frames and link for posting it by hand (`?format=zip`: the frames and steps.txt, with the link, in one zip).
 * 20 per person per hour. The zip is stored without compression and streamed one frame at a time.
 */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    const { contentId: itemId } = await context.params;
    if (!(await hitRateLimit(`story-package:${scope.userId}`, 20, 3600_000)).allowed) {
      throw new PublishingError("Too many downloads. Try again later.", 429, "story.rateLimited");
    }
    const pack = await storyPackage(scope, itemId);
    const zip = new URL(request.url).searchParams.get("format") === "zip";
    await prisma.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.package.download", entityType: "ContentItem", entityId: itemId, metadata: { format: zip ? "zip" : "json" } },
    });
    if (!zip) return Response.json(pack, { headers: HEADERS });
    return new Response(zipStream(pack), { headers: { ...HEADERS, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="story-${itemId}.zip"` } });
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}

// ponytail: chunks are enqueued without waiting for the reader; a 100 MB clip sits in memory if the client is slow.
function zipStream(pack: Awaited<ReturnType<typeof storyPackage>>) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        for (const f of pack.frames) {
          const res = await fetch(f.url, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok || !res.body) throw new Error(`frame ${f.n} unavailable`);
          const file = new ZipPassThrough(`frame-${f.n}.${f.kind === "video" ? "mp4" : "jpg"}`);
          zip.add(file);
          reader = res.body.getReader();
          for (let r = await reader.read(); !r.done; r = await reader.read()) file.push(r.value);
          file.push(new Uint8Array(0), true);
        }
        const steps = new ZipPassThrough("steps.txt");
        zip.add(steps);
        steps.push(new TextEncoder().encode(stepsText(pack.link)), true);
        zip.end();
      } catch (e) {
        await reader?.cancel().catch(() => null);
        controller.error(e);
      }
    },
  });
}
