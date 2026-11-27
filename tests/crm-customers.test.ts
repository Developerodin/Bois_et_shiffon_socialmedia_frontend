import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConversationRow } from "@/shared";
import { identityConflict } from "@/components/crm/api";
import { crmHref } from "@/components/crm/crm-link";
import { crmTabs, defaultCrmTab } from "@/components/crm/crm-tabs";
import { CustomerConversations, CustomerQuotes, draftOf, fieldsBody } from "@/components/crm/customers/customer-page";
import { ownerOptions } from "@/components/crm/customers/people";
import { searchTerm } from "@/components/crm/customers/search";
import { ApiError } from "@/components/settings/api";
import { agentEntries } from "@/lib/nav";

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe("the /crm tabs", () => {
  it("shows each tab by its key", () => {
    expect(crmTabs(["brand.read", "crm.manage"])).toEqual(["customers", "quotes"]);
    expect(crmTabs(["brand.read", "crm.manage", "inbox.read"])).toEqual(["customers", "quotes"]);
    // inbox.read alone opens the page; Follow-ups is its tab once built, so nothing here yet.
    expect(crmTabs(["brand.read", "inbox.read"])).toEqual([]);
    expect(crmTabs(["brand.read", "crm.read"])).toEqual([]);
  });

  it("opens Customers for crm.manage, whatever else the role holds", () => {
    expect(defaultCrmTab(["follow-ups", "customers", "pipeline", "quotes"])).toBe("customers");
    expect(defaultCrmTab(["follow-ups"])).toBe("follow-ups");
    expect(defaultCrmTab([])).toBeNull();
  });

  it("links between tabs with what to open", () => {
    expect(crmHref("customers", { customer: "c 1" })).toBe("/crm?tab=customers&customer=c+1");
    expect(crmHref("quotes")).toBe("/crm?tab=quotes");
  });
});

describe("Sales & CRM in the nav", () => {
  const spark = (perms: string[]) => agentEntries(["crm"], perms).find((e) => e.id === "spark");
  it("opens /crm for either key, and not without one", () => {
    expect(spark(["crm.manage"])).toMatchObject({ href: "/crm", soon: false });
    expect(spark(["inbox.read"])).toMatchObject({ href: "/crm", soon: false });
    expect(spark(["brand.read"])).toMatchObject({ href: "/agents/spark", soon: true });
  });
});

describe("customer search", () => {
  it("waits for 2 characters, not counting spaces at the ends", () => {
    expect(searchTerm("")).toBeNull();
    expect(searchTerm("j")).toBeNull();
    expect(searchTerm(" j ")).toBeNull();
    expect(searchTerm(" je ")).toBe("je");
    expect(searchTerm("Jeanne")).toBe("Jeanne");
  });
});

describe("a contact detail already on another customer", () => {
  it("names the customer who has it, when the server does", () => {
    const e = new ApiError(409, "Another customer already has this contact detail", "crm.identityTaken", { code: "crm.identityTaken", customerId: "c9", customerName: "Jeanne Martin" });
    expect(identityConflict(e)).toEqual({ message: "Another customer already has this contact detail", customerId: "c9", customerName: "Jeanne Martin" });
  });
  it("keeps the message alone when the server names nobody (a race on the unique index)", () => {
    expect(identityConflict(new ApiError(409, "Another customer already has this contact detail", "crm.identityTaken", {}))).toEqual({ message: "Another customer already has this contact detail", customerId: null, customerName: null });
  });
  it("is not any other error", () => {
    expect(identityConflict(new ApiError(409, "Changed", "crm.changed"))).toBeNull();
    expect(identityConflict(new Error("x"))).toBeNull();
  });
});

describe("a customer's page", () => {
  it("sends cleared fields as null and the name trimmed", () => {
    expect(fieldsBody({ ...draftOf(), displayName: "  Jeanne ", role: " ", nextActionDue: "2026-12-01" })).toEqual({
      displayName: "Jeanne", role: null, language: null, companyId: null, ownerId: null, nextAction: null, nextActionDue: "2026-12-01",
    });
  });

  it("says who sees conversations when the role can't", () => {
    expect(html(createElement(CustomerConversations, { conversations: null }))).toContain("Conversations are visible to the inbox team");
    const c: ConversationRow = {
      id: "v1", channel: "LOGGED", subject: "Sofa delivery", customer: null, ownerId: null, nextAction: null, nextActionDue: null,
      lastMessageAt: "2026-11-20T10:00:00Z", lastFromCustomer: true, waitingSince: null, closedAt: null, updatedAt: "2026-11-20T10:00:00Z", state: "NEEDS_REPLY", overdue: true,
    };
    const out = html(createElement(CustomerConversations, { conversations: [c] }));
    expect(out).toContain("Sofa delivery");
    expect(out).toContain("Needs a reply, overdue");
    expect(out).not.toContain("visible to the inbox team");
  });

  it("links each quote to the Quotes tab", () => {
    const out = html(createElement(CustomerQuotes, { quotes: [{ id: "q1", number: "Q-0042", status: "SENT", total: "1872.00", currency: "EUR", updatedAt: "2026-11-24T10:00:00Z" }] }));
    expect(out).toContain('href="/crm?tab=quotes&amp;quote=q1"');
    expect(out).toContain("Invoice sent");
  });

  it("lists each person once as an owner, by name", () => {
    const owners = ownerOptions({
      viaWorkspace: [{ userId: "u2", name: null, role: "Owner" }, { userId: "u1", name: "Zoé", role: "Admin" }],
      people: [{ id: "g1", userId: "u2", name: "Anna", role: { id: "r1", name: "Manager" } }],
    });
    expect(owners).toEqual([{ id: "u2", name: "Anna" }, { id: "u1", name: "Zoé" }]);
  });
});
