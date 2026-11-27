import { describe, expect, it } from "vitest";
import { crmAccess } from "@/components/crm/crm-link";
import { crmTabs, defaultCrmTab } from "@/components/crm/crm-tabs";
import { mergeMoves } from "@/components/crm/customers/customer-admin";
import { shownSummary, suggestionPatch } from "@/components/crm/follow-ups/conversation-ai";
import { FOLLOW_UP_STATE_LABEL, followUpChips, localDateTime, sentAtOf, stateTone } from "@/components/crm/follow-ups/labels";
import { messageBody, newMessageDraft } from "@/components/crm/follow-ups/log-message";

describe("the follow-up queue", () => {
  it("names each state, with overdue a badge of its own", () => {
    expect(FOLLOW_UP_STATE_LABEL).toEqual({ NEEDS_REPLY: "Needs reply", WAITING: "Waiting on customer", CLOSED: "Closed" });
    expect(stateTone("NEEDS_REPLY")).toBe("warn");
    expect(stateTone("WAITING")).toBe("info");
    expect(stateTone("CLOSED")).toBe("muted");
  });

  it("puts the counts on the chips that have one", () => {
    const chips = followUpChips({ needsReply: 3, overdue: 1, waiting: 2, mine: 4 });
    expect(chips.map((c) => [c.filter, c.count])).toEqual([["open", null], ["mine", 4], ["needsReply", 3], ["overdue", 1], ["waiting", 2], ["closed", null]]);
    // Counts that failed to load: the chips still filter, without numbers.
    expect(followUpChips(null).every((c) => c.count === null)).toBe(true);
  });

  it("is a tab for inbox.read, opened first only without crm.manage", () => {
    const inboxOnly = crmTabs(crmAccess(["inbox.read"], []));
    expect(inboxOnly).toEqual(["follow-ups"]);
    expect(defaultCrmTab(inboxOnly)).toBe("follow-ups");
    expect(defaultCrmTab(crmTabs(crmAccess(["inbox.read", "crm.manage"], [])))).toBe("customers");
  });
});

describe("logging a message", () => {
  it("defaults to now, from the customer, by email", () => {
    const d = newMessageDraft(new Date(2026, 10, 27, 9, 5));
    expect(d).toEqual({ fromCustomer: true, medium: "EMAIL", when: "2026-11-27T09:05", text: "" });
  });

  it("sends the local time as an instant, and nothing without text or a full date", () => {
    expect(sentAtOf("2026-11-27T09:05")).toBe(new Date(2026, 10, 27, 9, 5).toISOString());
    expect(sentAtOf("2026-11-27")).toBeNull();
    expect(sentAtOf("")).toBeNull();
    expect(localDateTime(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04");
    const d = { fromCustomer: false, medium: "PHONE" as const, when: "2026-11-27T09:05", text: "  Called back  " };
    expect(messageBody(d)).toEqual({ fromCustomer: false, medium: "PHONE", text: "Called back", sentAt: new Date(2026, 10, 27, 9, 5).toISOString() });
    expect(messageBody({ ...d, text: " " })).toBeNull();
    expect(messageBody({ ...d, when: "" })).toBeNull();
  });
});

describe("merging customers", () => {
  it("says what moves, conversations uncounted for a role that can't read them", () => {
    const other = { identities: [{ id: "i", kind: "EMAIL" as const, value: "a@b.c" }], notes: [], quotes: [], deals: [], conversations: null };
    expect(mergeMoves(other)).toBe("1 contact detail, 0 notes, 0 quotes, 0 deals and their conversations");
    expect(mergeMoves({ ...other, conversations: [] })).toBe("1 contact detail, 0 notes, 0 quotes, 0 deals and 0 conversations");
  });
});

describe("the conversation's AI help", () => {
  const fresh = { summary: "Wants samples in linen.", nextStep: "Send the linen samples", nextActionDue: "2026-12-01", cached: false };
  it("shows a fresh summary over the saved one, and marks the saved one when stale", () => {
    expect(shownSummary({ summary: "Old", summaryStale: true }, null)).toEqual({ text: "Old", stale: true });
    expect(shownSummary({ summary: "Old", summaryStale: true }, fresh)).toEqual({ text: "Wants samples in linen.", stale: false });
    expect(shownSummary({ summary: null, summaryStale: false }, null)).toBeNull();
  });
  it("offers the next step as a next action only when there is one, cut to its limit", () => {
    expect(suggestionPatch(fresh)).toEqual({ nextAction: "Send the linen samples", nextActionDue: "2026-12-01" });
    expect(suggestionPatch({ ...fresh, nextStep: null, cached: true })).toBeNull();
    expect(suggestionPatch(null)).toBeNull();
    expect(suggestionPatch({ ...fresh, nextStep: "x".repeat(300) })?.nextAction).toHaveLength(200);
  });
  it("lets only content.create holders draft a reply", () => {
    expect(crmAccess(["inbox.read", "content.create"], []).draft).toBe(true);
    expect(crmAccess(["inbox.read"], []).draft).toBe(false);
    expect(crmAccess(["content.create"], []).draft).toBe(false);
  });
});
