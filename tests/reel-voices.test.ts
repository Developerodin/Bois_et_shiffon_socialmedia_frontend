import { describe, expect, it } from "vitest";
import { LIBRARY_FILTERS, type CloningInfo, type LibraryVoice, type ReelVoiceOption } from "@/shared";
import { ApiError } from "@/components/settings/api";
import type { ReelPlan } from "@/shared";
import { LIBRARY_WAIT_MS, isLatest, libraryWait, nextLibraryPage, planWithVoice, showLibraryError, GENDER_LABELS, LIBRARY_LABELS, LIBRARY_TITLES, TRAIT_TITLES, CHALLENGE_TTL_MS, type ChallengeEntry, canManageClone, cloneRetry, readableChallenge, reusableChallenge, defaultLibraryLanguage, isAbort, languageName, libraryNarrowed, libraryQuery, mergeLibraryPage, readingLanguage } from "@/components/reels/voices";

const lv = (id: string) => ({ id }) as LibraryVoice;
const voice = (over: Partial<ReelVoiceOption>): ReelVoiceOption => ({ id: "v", name: "V", gender: "clone", sampleUrl: null, clone: true, mine: false, ...over });

describe("libraryQuery", () => {
  it("keeps set, non-empty fields", () => {
    expect(libraryQuery({ language: "fr", gender: "", search: undefined, page: 0 })).toBe("language=fr");
    expect(libraryQuery({ language: "fr", page: 2 })).toContain("page=2");
  });
});
describe("mergeLibraryPage", () => {
  it("appends unseen ids", () => expect(mergeLibraryPage([lv("a")], [lv("a"), lv("b")]).map((v) => v.id)).toEqual(["a", "b"]));
});
describe("mergeLibraryPage within the page", () => {
  it("lists a voice once even when the new page repeats it", () => expect(mergeLibraryPage([lv("a")], [lv("b"), lv("b"), lv("a")]).map((v) => v.id)).toEqual(["a", "b"]));
});
describe("defaultLibraryLanguage", () => {
  it("uses the reel's base language when the library has it, else Any", () => {
    expect(defaultLibraryLanguage("pt-BR")).toBe("pt");
    expect(defaultLibraryLanguage("fr")).toBe("fr");
    expect(defaultLibraryLanguage("ja")).toBe("");
    expect(defaultLibraryLanguage(undefined)).toBe("");
  });
});
describe("libraryNarrowed", () => {
  const base = { language: "fr", gender: "", age: "", useCase: "", search: "" };
  it("is false at the start and true once anything differs", () => {
    expect(libraryNarrowed(base, "fr")).toBe(false);
    expect(libraryNarrowed({ ...base, language: "" }, "fr")).toBe(true);
    expect(libraryNarrowed({ ...base, search: "x" }, "fr")).toBe(true);
    expect(libraryNarrowed({ ...base, language: "" }, "")).toBe(false);
  });
});
describe("isAbort", () => {
  it("is true only for an AbortError", () => {
    expect(isAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbort(new Error("x"))).toBe(false);
    expect(isAbort(new ApiError(0, "x"))).toBe(false);
  });
});
describe("cloneRetry", () => {
  it("reuses the take only when there was no answer or it is still making", () => {
    expect(cloneRetry(new ApiError(0, "x"))).toBe("same-take");
    expect(cloneRetry(new ApiError(409, "x", "clone.stillMaking"))).toBe("same-take");
  });
  it("takes a new one for any other answer", () => {
    for (const s of [502, 503, 400, 410, 402]) expect(cloneRetry(new ApiError(s, "x"))).toBe("new-take");
    expect(cloneRetry(new ApiError(409, "x", "request.idTaken"))).toBe("new-take");
    expect(cloneRetry(new Error("x"))).toBe("new-take");
  });
});
describe("readingLanguage", () => {
  it("matches exactly, then by base, else English", () => {
    expect(readingLanguage(["fr-CA"], ["en", "fr"])).toBe("fr");
    expect(readingLanguage(["pt-BR", "en"], ["pt-BR", "pt"])).toBe("pt-BR");
    expect(readingLanguage(["xx"], ["en"])).toBe("en");
  });
});
describe("languageName", () => {
  it("names a language, and survives a bad code", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("not a code!")).toBe("not a code!");
  });
});
describe("canManageClone", () => {
  const cloning = (allowed: boolean) => ({ allowed }) as CloningInfo;
  it("needs a clone that is mine or an allowed manager", () => {
    expect(canManageClone(voice({ clone: false, mine: true }), cloning(true))).toBe(false);
    expect(canManageClone(voice({ mine: true }), null)).toBe(true);
    expect(canManageClone(voice({}), cloning(true))).toBe(true);
    expect(canManageClone(voice({}), cloning(false))).toBe(false);
    expect(canManageClone(voice({}), null)).toBe(false);
  });
});
describe("labels", () => {
  it("cover every library filter value", () => {
    for (const k of ["gender", "age", "useCase"] as const) for (const v of LIBRARY_FILTERS[k]) expect((LIBRARY_LABELS[k] as Record<string, string>)[v]).toBeTruthy();
    expect(LIBRARY_LABELS.useCase?.characters_animation).toBe("Characters & animation");
    expect(Object.keys(LIBRARY_TITLES).sort()).toEqual(["age", "gender", "language", "useCase"]);
    expect(Object.keys(TRAIT_TITLES)).toHaveLength(7);
    expect(GENDER_LABELS.clone).toBe("Cloned voice");
  });
});

describe("library request sequencing", () => {
  it("waits 300 ms only for a select change", () => {
    expect(libraryWait(false)).toBe(LIBRARY_WAIT_MS);
    expect(LIBRARY_WAIT_MS).toBe(300);
    expect(libraryWait(true)).toBe(0);
  });
  it("lets only the newest request land", () => {
    const a = {}, b = {};
    expect(isLatest(a, a)).toBe(true);
    expect(isLatest(b, a)).toBe(false);
    expect(isLatest(null, a)).toBe(false);
  });
  it("shows a failure only for the newest request and never an abort", () => {
    const a = {}, b = {};
    expect(showLibraryError(a, a, new Error("x"))).toBe(true);
    expect(showLibraryError(b, a, new Error("x"))).toBe(false);
    expect(showLibraryError(a, a, new DOMException("x", "AbortError"))).toBe(false);
  });
  it("asks for page 0 with nothing shown and the next page after", () => {
    expect(nextLibraryPage(null)).toBe(0);
    expect(nextLibraryPage({ page: 0 })).toBe(1);
    expect(nextLibraryPage({ page: 3 })).toBe(4);
  });
});
describe("planWithVoice", () => {
  const plan = { voice: "a", voiceName: "A", title: "t", scenes: [] } as unknown as ReelPlan;
  it("sets the voice and caps its name at 80", () => {
    const out = planWithVoice(plan, { id: "library:x", name: "n".repeat(100) });
    expect(out.voice).toBe("library:x");
    expect(out.voiceName).toHaveLength(80);
    expect(out.title).toBe("t");
  });
});

describe("clone challenges", () => {
  const entry = (over: Partial<ChallengeEntry> = {}): ChallengeEntry => ({ lang: "fr", challenge: { challengeId: "c", lang: "fr", sentences: ["a"] }, at: 1_000, ...over });
  it("reuses a kept challenge only for its language, unsent and under its life", () => {
    expect(reusableChallenge(entry(), "fr", 1_000 + CHALLENGE_TTL_MS - 1)).not.toBeNull();
    expect(reusableChallenge(entry(), "fr", 1_000 + CHALLENGE_TTL_MS)).toBeNull();
    expect(reusableChallenge(entry(), "de", 2_000)).toBeNull();
    expect(reusableChallenge(entry({ used: true }), "fr", 2_000)).toBeNull();
    expect(reusableChallenge(null, "fr", 2_000)).toBeNull();
  });
  it("reads a new one before recording once half its life is gone, or it was sent", () => {
    expect(readableChallenge(entry(), 1_000 + CHALLENGE_TTL_MS / 2)).toBe(true);
    expect(readableChallenge(entry(), 1_001 + CHALLENGE_TTL_MS / 2)).toBe(false);
    expect(readableChallenge(entry({ used: true }), 1_000)).toBe(false);
    expect(readableChallenge(null, 1_000)).toBe(false);
  });
});
