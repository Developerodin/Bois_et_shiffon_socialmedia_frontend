# Desktop web app: the "Refined workspace" redesign

Date: 2026-11-03. Status: draft for owner review.

## Why

The desktop web app (apps/web) was built before the Espanda design existed. The owner now has a full desktop design in
Figma ("Espanda (Copy)", file `HvKh2Gk6hwUnEFQBWwHM5Z`, page **Dashboard · Refined workspace**, ~96 frames) and wants
the web app to become it, screen by screen. The mobile app already follows the Espanda design; the desktop should feel
like the same product.

The design reframes the product: one workspace per business, eight named **agents** that each take requests and
return drafts for review, a queue of **decisions**, the **work** in progress, and **Espanda**, a chat assistant that
is always on screen.

## Owner decisions (2026-11-03)

- Direction: **Refined workspace** (not the older "Studio" or "Agent workspace" pages).
- Order: **shell first**, checked with the owner, then subagents rebuild one screen at a time on real data, each with a
  review and a browser check.
- Agents: **all eight are real.** Spark (Sales & CRM), Beat (Projects & team), Wave (Content & marketing), Echo
  (Communication), Pulse (Finance), Hum (Admin & access), Surge (Growth & scale), Drift (Discovery).

## What the design actually asks of the eight agents

Every agent workspace (V27–V33) has the same shape: a **task brief** (the person's request + the shared business
context it uses) on the left, a **draft** on the right ("Follow-up draft", "Project plan", "Invoice preparation",
"Access checklist"), and **Request changes / Approve** at the bottom. Every one carries the line *"Approval is separate
from sending, publishing, assigning or changing access."*

So "real" means: each agent turns a request into a useful draft grounded in the business's context, the person reviews
it, asks for changes (a new version) or approves it, and approved work is kept. Agents **do not** send email, issue
invoices, change permissions or assign people. That keeps four new "departments" (CRM, projects, finance, admin) from
becoming four new systems: they are one **task engine** with eight sets of instructions.

| Agent | Drafts | Grounded in | Backed by (today) |
| --- | --- | --- | --- |
| Wave | posts, reels, captions, campaigns | brand voice, catalogue, strategy | Planner → Brief → Creator → Quality chain (existing) |
| Drift | research, competitor and trend findings, ideas | website, competitors, web search | Research, Scout, Competitors (existing) |
| Surge | growth, SEO/GEO and performance recommendations | analytics, Search Console, audits | SEO, GEO, Analyst, Site audit (existing) |
| Echo | customer replies, review replies | inbox, Google reviews | Customers inbox + Google reviews (built 2026-11-03) |
| Spark | follow-ups, quotes, offer messages | catalogue, brief, past conversations | new: task engine |
| Beat | project and launch plans, checklists | brief, campaign strategy, team | new: task engine |
| Pulse | invoice/quote checklists, budgets, cost notes | agreed scope, billing preferences | new: task engine |
| Hum | onboarding checklists, access requests, policies | roles, team preferences | new: task engine |

## Shape of the build

### 1. Shell (first, checked with the owner before anything else)

From V01 (`.figma/manual/worskhop/V01 · Decisions/Needs review.png` + `.svg`):

- **Left sidebar (232 px):** Espanda wordmark; business switcher (logo + name + chevron); nav: Overview, Tasks (count),
  Business context, Connections, Routines, Saved work; "Your agents" list (icon, name, role) for the eight agents;
  Help & support; account (avatar, name, role, menu).
- **Top bar:** breadcrumb (business › page), search field ("Search your workspace"), notifications bell.
- **Right panel (≈320 px): Espanda chat**: workspace-context chip, starter suggestions, message box with "Add context",
  "Send message", new-conversation and history buttons. Persistent on every page.
- **Tokens:** the Espanda palette and type (indigo primary, lavender tints, Inter-like sans) as CSS variables in
  `app/globals.css`, replacing the current dark/gold theme. The mobile app's `src/theme/tokens.ts` is the source of truth
  for shared values so both apps match.
- Agent identity marks (8 coloured glyphs) exported once as SVG components.
- Existing pages keep working inside the new shell until their own screen is rebuilt.

### 2. Screens over features that already exist

| Figma | Becomes | Data |
| --- | --- | --- |
| V01–V10, V37–V39 Overview: Decisions / Work / Opportunities / Completed / Archived, first-use | `/` (Overview) | ContentItem + ApprovalDecision, Opportunity, Job/AgentRun |
| V11–V19, V22, Preview ·, V25 Review flow (draft, edit, versions, request changes, approve, undo, archive, chat in context) | review route per item | ContentVersion, ApprovalDecision, chat |
| V23 Activity, V26 Sources and freshness | Activity, Sources | AgentEvent/AuditEvent, BrandContextDoc |
| V34 Business context | `/context` | BrandContextDoc, BrandProfile |
| V35 Connections | `/connections` (from Settings) | IntegrationConnection |
| V36 Agent instructions | per agent | BrandAgentConfig.settings |
| V24 Ask Espanda, Chat · * | right panel + full chat | ChatThread |

### 3. Task engine, then the agents on it

- **Task** = a request to one agent: title, request text, agent, context documents used, status (needs setup / in
  progress / needs review / approved / archived), versions (each a draft + who asked for what change), approvals.
  New table(s); Wave tasks create ContentItems and run the existing chain instead of a plain draft.
- **Tasks** screens (Tasks, per-agent all/review/setup, filter agents, create a task, task details), **Routines**
  (a task on a schedule; reuses the job runner and brand automations), **Saved work** (approved outputs),
  **Search workspace**, **Add context** (attach a document/link to a task or chat).
- Each agent gets its instructions (system prompt + which context docs it reads + output format) and its V27–V33
  workspace. Spark, Beat, Pulse and Hum are this engine with their own instructions; Wave/Drift/Surge/Echo also surface
  their existing agents' output as tasks.

### Phase 4 data model (from the 2026-11-03 plan review)

No new Task tables. ContentItem + ContentVersion + ApprovalDecision already model request → versioned draft →
changes requested / approved, with the approval bound to a package hash. Generalise them: add an `agent` key (default
`wave`) and a `kind` (social post, reel, document) to ContentItem, let ContentVersion's body vary by kind, and map
ContentStatus to the design's states in the UI. The Phase 2 review screens are then shared by all eight agents.
Routines reuse brand automations + Job/AgentRun for run history. Each agent is one entry of static config in
`lib/agents` (prompt, context docs it reads, output sections); per-business overrides live in
`BrandAgentConfig.settings` only if the owner wants instructions editable (open question 1). Wave, Drift, Surge and
Echo are views over their existing agents, not engine users.

### Guardrails (from the 2026-11-03 plan review)

- Task-engine agents have **no tools that change anything outside their own draft**: no sending, publishing,
  invoicing, assigning, or writing to Role, WorkspaceMember, BrandMember, Invitation, Subscription or credit tables.
  "Approval is separate from sending…" is enforced by the absence of such tools, not by copy.
- Approving a draft is its own permission (`content.approve`, as for posts), checked on the server.
- Drafts are rendered as inert markdown through the existing sanitising renderer; no auto-acting links.
- Request text and any attached context are untrusted input: the chat's "propose, never act" rule applies; attached
  URLs are fetched only through the existing crawler's SSRF guards.
- Pulse and Hum drafts can hold financial and personal data: readable by members with access to that brand only, and
  not added to the chat's context for roles that can't read them. Retention follows ContentItem's.
- Every agent run is rate-limited per brand and logged with `logRun`, like chat.
- Search (Phase 4) is a server query scoped to the viewer's brand and role; the query is not put in URLs that land in
  logs.
- Nothing about chat text, thread ids, drafts or context is kept in browser storage.

## Non-goals

- Agents taking outward actions (sending, publishing, invoicing, granting access) from these screens. Publishing keeps
  its existing approval-then-schedule flow; inbox and Google replies keep their explicit tap.
- The older Figma pages (Dashboard · Studio, Dashboard · Agent workspace).
- Rebuilding the platform-admin pages (`/admin/*`); they move into the shell unchanged.
- A mobile layout of the desktop app (the native app covers phones).

## Anti-goals (would be a failure even if it "works")

- Screens that show the Figma's sample content (Bois & Chiffons, "Bunting launch") as if real. Empty states instead.
- Eight agents that are eight copies of the same code.
- Breaking existing web flows (approvals, publishing, settings, admin) during the move.

## Constraints

- Figma MCP and REST are rate-limited on the Starter seat; the design comes from the owner's manual exports in
  `apps/web/.figma/manual/` (git-ignored): `worskhop/` (Refined, PNG 2x), `svg-workshop/` (Refined, SVG), plus the
  older pages. PNG = visual target; SVG = exact colours, sizes, text and icons.
- Next.js 15 app router, Tailwind 4, Radix primitives already installed; reuse `components/ui`.
- Each screen: one subagent, then a review and a browser check (Chrome extension or screenshots), then the owner.

## Left to the builder

Component breakdown, route names, how the chat panel collapses on narrow screens, and the Task schema details, as long
as they follow the above.

## Owner answers (2026-11-03, after the plan review)

1. **Agent instructions are editable per business, if the business wants to.** The owner writes in their own words;
   an AI step turns that into a proper system instruction for that business's agent (shown back for them to accept),
   stored in `BrandAgentConfig.settings`. Our built-in instructions stay the default and the safety rules
   (Guardrails) are always appended by the server and can't be edited away. Phase 4 (V36).
2. **No integrations for Pulse and Hum this round**: drafts only. Adding one later needs a spec revision.
3. Main nav selected = primary fill, agent rows selected = lavender: **OK for now; the owner will compare in the
   browser** at the Phase 1 checkpoint.
4. **Desktop and mobile keep their own designs.** The desktop follows the desktop frames (`#DED9E6` dividers etc.);
   the mobile tokens are not changed.
5. Before building: a quick Hallmark audit of the direction so the web app doesn't read as generic AI output.
