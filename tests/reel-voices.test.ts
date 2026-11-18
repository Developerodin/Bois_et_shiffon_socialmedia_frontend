import { describe, expect, it } from "vitest";
import { LIBRARY_FILTERS, type CloningInfo, type LibraryVoice, type ReelVoiceOption } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { GENDER_LABELS, LIBRARY_LABELS, LIBRARY_TITLES, TRAIT_TITLES, canManageClone, cloneRetry, languageName, libraryQuery, mergeLibraryPage, readingLanguage } from "@/components/reels/voices";

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
