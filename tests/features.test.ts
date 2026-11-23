import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ notFound: vi.fn() }));
vi.mock("next/navigation", () => nav);

import { WEB_FEATURE_LIST, featureOn, featuresOn, requireFeature } from "@/lib/features";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WEB_FEATURES", "");
  vi.stubEnv("WEB_FEATURE_WORKSPACES", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("featureOn", () => {
  it("is off when nothing is set", () => {
    expect(featureOn("reels", "w1")).toBe(false);
  });

  it("opens a feature for everyone from WEB_FEATURES, trimming entries", () => {
    vi.stubEnv("WEB_FEATURES", " reels, photoshoot");
    expect(featureOn("reels", "w1")).toBe(true);
    expect(featureOn("photoshoot", null)).toBe(true);
    expect(featureOn("inbox", "w1")).toBe(false);
  });

  it("opens a feature for one workspace from WEB_FEATURE_WORKSPACES", () => {
    vi.stubEnv("WEB_FEATURE_WORKSPACES", "inbox:w1");
    expect(featureOn("inbox", "w1")).toBe(true);
    expect(featureOn("inbox", "w2")).toBe(false);
    expect(featureOn("inbox", null)).toBe(false);
  });
});

describe("featuresOn", () => {
  it("lists the features that are on, in list order", () => {
    vi.stubEnv("WEB_FEATURES", "reels, inbox");
    expect(featuresOn("w1")).toEqual(["reels", "inbox"]);
  });

  it("ignores a misspelt flag", () => {
    vi.stubEnv("WEB_FEATURES", "reel");
    expect(featuresOn("w1")).toEqual([]);
  });

  it("scopes WEB_FEATURE_WORKSPACES to its workspace", () => {
    vi.stubEnv("WEB_FEATURE_WORKSPACES", "library:w1");
    expect(featuresOn("w1")).toEqual(["library"]);
    expect(featuresOn("w2")).toEqual([]);
    expect(featuresOn(null)).toEqual([]);
  });
});

describe("WEB_FEATURE_LIST", () => {
  it("features list includes tasks", () => {
    expect(WEB_FEATURE_LIST).toContain("tasks");
    vi.stubEnv("WEB_FEATURE_WORKSPACES", "tasks:w1");
    expect(featureOn("tasks", "w1")).toBe(true);
  });
});

describe("requireFeature", () => {
  it("calls notFound when the feature is off", () => {
    requireFeature("plans", "w1");
    expect(nav.notFound).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the feature is on", () => {
    vi.stubEnv("WEB_FEATURES", "plans");
    requireFeature("plans", "w1");
    expect(nav.notFound).not.toHaveBeenCalled();
  });
});
