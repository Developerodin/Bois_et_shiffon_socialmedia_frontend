import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { reelRecording: { findMany: m.findMany } } }));

import { planProblems, ReelPlan, reelSeconds } from "@/server/reels/plan";
import { isM4a, recordingProblems, saysTheScript, settleRecordings } from "@/server/reels/recordings";

const scene = (voiceText: string, over: object = {}) => ({ photoKey: "w1/b1/table.jpg", shot: "s", direction: "d", onScreenText: "o", voiceText, ...over });
const plan = (scenes: object[]) => ReelPlan.parse({ title: "T", presenter: "none", template: "", voice: "coral", caption: "", hashtags: [], scenes });
const row = { id: "rec1", contentItemId: "i1", seconds: 7.25, text: "Une table pensée pour durer.", transcript: "Une table pensée pour durer longtemps." };

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([row]);
});

describe("recording uploads", () => {
  it("accepts only an MP4/M4A container by its bytes", () => {
    const head = (brand: string) => new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftyp" + brand), 0, 0]);
    expect(isM4a(head("M4A "))).toBe(true);
    expect(isM4a(head("isom"))).toBe(true);
    expect(isM4a(head("qt  "))).toBe(false);
    expect(isM4a(new Uint8Array(Buffer.from("RIFF....WAVEfmt ")))).toBe(false);
  });

  it("tells a take that says the script from one that doesn't", () => {
    expect(saysTheScript("Une table pensée pour durer.", "une table pensee pour durer")).toBe(true);
    expect(saysTheScript("Une table pensée pour durer.", "Un buffet en manguier massif, livré chez vous.")).toBe(false);
    expect(saysTheScript("Une table pensée pour durer.", "")).toBe(false);
  });
});

describe("recordings follow their text", () => {
  it("keeps a recording on its text (or what was heard), with the row's seconds, whatever the phone sent", async () => {
    const { plan: p, dropped } = await settleRecordings(plan([scene(row.transcript, { recordingId: "rec1", recordingSeconds: 1 }), scene("Autre.")]), undefined, "i1", false);
    expect(p.scenes[0]).toMatchObject({ recordingId: "rec1", recordingSeconds: 7.25 });
    expect(dropped).toEqual([]);
    // On the asked text, a take is kept only if it says that text.
    const asked = await settleRecordings(plan([scene(row.text, { recordingId: "rec1" }), scene("Autre.")]), undefined, "i1", false);
    expect(asked.plan.scenes[0].recordingId).toBe("rec1"); // "pensée pour durer" ≈ "pensée pour durer longtemps"
    m.findMany.mockResolvedValue([{ ...row, transcript: "Un buffet en manguier massif, livré chez vous." }]);
    const differs = await settleRecordings(plan([scene(row.text, { recordingId: "rec1" }), scene("Autre.")]), undefined, "i1", false);
    expect(differs.plan.scenes[0].recordingId).toBeUndefined();
  });

  it("drops a recording whose scene text changed, saying so", async () => {
    const { plan: p, dropped, notices } = await settleRecordings(plan([scene("Un autre texte.", { recordingId: "rec1" }), scene("Autre.")]), undefined, "i1", false);
    expect(p.scenes[0].recordingId).toBeUndefined();
    expect(dropped).toEqual([1]);
    expect(notices).toEqual(["Scene 1: recording removed, the text changed."]);
  });

  it("follows the text through a chat revision, wherever the scene moved", async () => {
    const previous = plan([scene(row.text, { recordingId: "rec1", recordingSeconds: 7.25 }), scene("Autre.")]);
    const revised = plan([scene("Nouveau début."), scene(row.text)]);
    const { plan: p } = await settleRecordings(revised, previous, "i1", true);
    expect(p.scenes.map((s) => s.recordingId)).toEqual([undefined, "rec1"]);
  });

  it("refuses another reel's recording", async () => {
    m.findMany.mockResolvedValue([]); // the query is scoped to this reel
    const { plan: p } = await settleRecordings(plan([scene(row.text, { recordingId: "rec-other" }), scene("Autre.")]), undefined, "i1", false);
    expect(p.scenes[0].recordingId).toBeUndefined();
    expect(m.findMany).toHaveBeenCalledWith({ where: { id: { in: ["rec-other"] }, contentItemId: "i1" } });
  });
});

describe("recorded scenes in the plan", () => {
  it("are priced by their measured length and skip the word rule", () => {
    const long = "mot ".repeat(40);
    const p = plan([scene(long, { recordingId: "rec1", recordingSeconds: 7.25 }), scene("un deux")]);
    expect(reelSeconds(p)).toBe(8 + 3);
    expect(planProblems(p, { workspaceId: "w1", brandId: "b1" })).toEqual([]);
  });

  it("must match their row before a render is charged", async () => {
    expect(await recordingProblems(plan([scene(row.text, { recordingId: "rec1", recordingSeconds: 7.25 }), scene("x")]), "i1")).toEqual([]);
    expect(await recordingProblems(plan([scene(row.text, { recordingId: "rec1", recordingSeconds: 3 }), scene("x")]), "i1")).toEqual(["Scene 1's recording is missing. Record it again."]);
  });
});
