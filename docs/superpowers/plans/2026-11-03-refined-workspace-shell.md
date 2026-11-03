# Refined workspace: Phase 1 (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every web page inside the Figma "Refined workspace" shell (232 px sidebar, 72 px top bar, 320 px Espanda chat panel, Espanda light theme) without losing a single working page.

**Architecture:** The `(shell)` layout becomes `Sidebar` | column(`TopBar`, page) | `AssistantPanel`. One flat route table (`lib/nav.ts`) feeds the sidebar, the account menu and the breadcrumb. The home page `/` keeps rendering today's `Workspace` (approvals, drafts, calendar, analytics, agent feed) until Phase 2 replaces it; its own chat column is removed because the panel is now the chat. Agents with a backend link to their existing screens; the four without one say "Soon" in the sidebar.

**Tech Stack:** Next.js 15 app router, React 19, Tailwind 4 (CSS variables in `app/globals.css`), Radix, `next/font` Inter, Vitest (node env, `tests/**/*.test.ts` only), Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-03-refined-workspace-design.md`

**Review:** revised after a 4-lens review (feasibility, security, simplicity, design fidelity), 2026-11-03.

## Global Constraints

- Visual target: `apps/web/.figma/manual/worskhop/V01 · Decisions/Needs review.png` (1920×1160 @2x); geometry and colours from the matching `.svg` in `svg-workshop/` (text is outlined; type comes from the scale below). The shell frame is identical on V01, V08, V24, V27, V34 and Tasks.
- Colours: primary `#5B50D6`; primary-strong `#4C40BB` (selected label, suggestion text, avatar initial, badge text); ink `#191620`; ink-secondary `#5E596B`; canvas `#F6F5F9`; surface `#FFFFFF`; selection `#EEEAFC`; muted `#F2F0F7` (agent tiles, neutral pills); border `#DED9E6` (dividers, input border); control outline `#8E879B`; disabled ink `#64646F`; link `#4A50F9`; error `#B42318`.
- Type (Inter): page title 24/30 semibold −0.6; feature 20/26 semibold; card title 16/22 semibold; body 14/21; label 14/20 medium; meta 12/18.
- Radii: card 24; small card, control, button, nav row 16; nested 12; badge 8. Heights: primary button 48; secondary button and tab 44; min target 44.
- Light theme only: no dark tokens, no theme toggle, no theme script.
- No Figma sample content in code (Bois & Chiffons, Bunting, Priyanshu, "Three items need your review", Tasks count 5).
- Agents (key · name · role · where it goes in Phase 1): `spark` Spark · Sales & CRM · Soon; `beat` Beat · Projects & team · Soon; `wave` Wave · Content & marketing · `/?panel=content`; `echo` Echo · Communication · `/settings?tab=connections` until the web inbox exists (Soon tag); `pulse` Pulse · Finance · Soon; `hum` Hum · Admin & access · Soon; `surge` Surge · Growth & scale · `/performance`; `drift` Drift · Discovery · `/?panel=competitors`.
- Every route under `app/(shell)` stays reachable in ≤2 clicks; `/` keeps its redirects (platform-only → `/admin`, no brand → `/welcome`) and its `?post= ?doc= ?agent= ?competitor= ?panel=` handling.
- The sidebar hiding a link is never the access check: every page keeps its own server-side permission check.

**Hallmark floor (audit 2026-11-03; the Figma is the layout, these override its copy and details):**
- Every colour and font through a token; no colour literals in classes (`bg-[hsl(…)]`, `text-[#…]`), no `transition-all`, never animate width/height/top/left (the old `.slide-indicator` and `transition-[width]` in `panel-layout.tsx` go).
- No eyebrows or tracked-caps labels: the chat chip reads "Business context" in sentence case at 12/18, not "WORKSPACE CONTEXT"; `empty-state.tsx`, `dialog`/`role-dialog`, `new-brand-dialog`, `markdown.tsx` h4, `doc-pane`, `admin-nav`, `dropdown-menu` shortcut, `settings/shared.tsx` badge lose `uppercase tracking-*` and `font-mono` labels.
- No middle-dot meta strings: "Wave · Content & marketing", "Draft 1 · French copy · Catalogue imagery" become two lines or separate labelled parts; one dot in a byline at most.
- No arrows glued to link text ("View 2 jobs →", "Archived →", "Full report →"): the arrow is a separate icon with its own spacing, or dropped.
- Accent restraint: the indigo marks the one primary action per region, the current selection and state. One solid selected style per screen: if the main nav row is solid indigo, tabs use the lavender selected style (V01 shows both solid at once plus two primary buttons; build one).
- `overflow-x: clip` on `html` and `body`; theme `::selection` and `scrollbar-color`; `:focus-visible` on every control, instant; every animation has a `prefers-reduced-motion` fallback; the nav progress bar is visible without scripts or removed.
- Every data region draws four states: loading (skeleton in its shape), empty (what belongs here + one action), error (what broke + what to do), full.
- Copy: no em/en dashes in UI strings; no success message without a request behind it.
- `globals.css` line 1 carries the Hallmark check stamp (`/* Hallmark · checked … · built: the project · redesign: restyle · scope: app */`).
- Sweep each task with `node ~/.claude/skills/hallmark/scripts/sloplint.mjs app components --genre modern-minimal --scope app` (and `--render --url http://localhost:3100/<route>` once signed-in capture works): 0 FAIL before a task's commit, REFLEX fixed or waived on the record.

## Review Focus

1. **Switching business with the panel open** must never show the previous business's chat, even when the new fetch fails. Task 3 keys the panel on workspace+brand and resets state; Task 4 e2e switches brand and asserts.
2. **Viewer role on `/connections`** must see no Connect/Disconnect. Task 2 derives `canManage` server-side; Task 4 e2e signs in as a viewer.
3. **Window 1024–1279 px**: middle column ≥ 700 px usable; the panel becomes a sheet toggled from the top bar. Task 3; Task 4 browser check at 1100 px.
4. **New account with no brand**: sidebar renders, switcher offers "Create a business" only when allowed, panel shows a reason and no input, `/` still redirects to `/welcome`. Task 2/3; Task 4 e2e.
5. **Deep and unknown paths** (`/admin/people/abc`, `/agents`, `/totally/unknown`): breadcrumb resolves to the nearest entry; admin pages show no brand segment. Task 1 tests.

---

### Task 1: Espanda theme and the route table

**Files:**
- Modify: `apps/web/app/globals.css`: one light token set with the Global Constraints values (hex, not HSL triplets) and the `@theme` mapping; add `--primary-strong`, `--muted` (#F2F0F7), `--link`; delete the dark default, the `prefers-color-scheme` blocks, `:root.light/.dark` rules, `theme-fade`/view-transition rules; make `.logo-on-light` the visible logo and hide `.logo-on-dark`; collapse `--chart-1` to one value; `.font-display { font-family: var(--font-inter) }`.
- Modify every `hsl(var(--…))` use to `var(--…)` or `color-mix(in srgb, var(--…) N%, transparent)`: `app/globals.css` (surface-glow, status-pulse, nav-progress), `components/workspace/panel-layout.tsx:316,365`, `components/admin/spend-chart.tsx:47`, `components/ui/card.tsx:8` (re-grep `hsl\(var\(` repo-wide; `agent-log.tsx` literal `hsl(30 10% 4%)` stays).
- Modify: `apps/web/app/layout.tsx` (drop Fraunces and `THEME_SCRIPT`); remove `ThemeToggle` from `app/login/page.tsx`, `components/auth/auth-card.tsx`, `app/welcome/page.tsx`; delete `components/theme/*` if then unused.
- Create: `apps/web/lib/nav.ts`; `apps/web/public/agents/{spark,beat,wave,echo,pulse,hum,surge,drift}.svg` copied unmodified from `.figma/manual/agent/Agent workspace/Identity/<Name>.svg`; `apps/web/public/espanda-wordmark.svg` (or reuse `components/brand/espanda-logo.tsx` light variant at 112×33).
- Test: `apps/web/tests/nav.test.ts`, `apps/web/tests/no-hsl-var.test.ts`

**Interfaces:**
- Produces in `lib/nav.ts`:
  - `type AgentKey = "spark" | "beat" | "wave" | "echo" | "pulse" | "hum" | "surge" | "drift"`
  - `type NavEntry = { id: string; label: string; href: string; group: "main" | "agent" | "more" | "admin"; role?: string; soon?: boolean; blurb?: string }`
  - `NAV: readonly NavEntry[]`: main = Overview `/`, Business context `/context`, Connections `/connections`; agents in the Global Constraints order with their Phase 1 href (`/agents/<key>` for Soon agents); more = Calendar `/?panel=content`, Performance `/performance`, Agent log `/agents`, Settings `/settings`; admin = Admin `/admin`. Tasks, Routines, Saved work and Search are **not** in Phase 1.
  - `navFor(pathname: string): { activeId: string | null; title: string; brandScoped: boolean }`: longest-prefix match on `href` paths (query ignored); `/` matches exactly; `/admin…` → brandScoped false; unknown → `{ activeId: null, title: "Overview", brandScoped: true }`.

- [ ] **Step 1: Write failing tests.**
  - `tests/nav.test.ts`: agent ids in order `spark…drift`; exactly spark, beat, pulse, hum (and echo) have `soon: true`; `navFor("/")` → overview/"Overview"; `navFor("/context")` → "Business context"; `navFor("/agents")` → "Agent log"; `navFor("/agents/spark")` → spark/"Spark"; `navFor("/admin/people/abc")` → admin/"Admin"/brandScoped false; `navFor("/totally/unknown")` → null/"Overview"; no `label`/`blurb` contains "Bois", "Bunting" or "Priyanshu".
  - `tests/no-hsl-var.test.ts`: no file under `app/` or `components/` contains `hsl(var(`; `app/globals.css` contains no `prefers-color-scheme` and no `color-scheme: dark`.
- [ ] **Step 2: Run** `npx vitest run tests/nav.test.ts tests/no-hsl-var.test.ts`: FAIL.
- [ ] **Step 3: Implement** the theme swap, the `hsl` replacements, the theme-toggle removal, `lib/nav.ts` and the asset copies.
- [ ] **Step 4: Run** both tests: PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 5: Browser check** in the current shell at 1440 px: `/`, `/context`, `/settings`, `/performance`, `/admin`, `/login`, `/welcome`: readable, logo visible, no invisible borders. Screenshots to the session scratchpad.
- [ ] **Step 6: Commit** `Switch the web app to the Espanda light theme and add the workspace route table`.

### Task 2: Sidebar, account menu, Connections page, agent pages

**Files:**
- Create: `apps/web/components/shell/sidebar.tsx`
- Modify: `apps/web/components/shell/brand-switcher.tsx`: add a `variant="sidebar"` (180×44, 1 px `#8E879B` border, white, r16, 20 px logo, 14 px name, 16 px chevron `#64646F`); when the workspace has no brand show "Create a business" (opens `NewBrandDialog`) only if `canCreateBrand`, else "No business yet". Existing default variant unchanged.
- Modify: `apps/web/components/workspace/account-menu.tsx`: add `variant="sidebar"` and an optional `roleLabel` prop; menu = the `more` entries + Admin when `platformAdmin` + the existing `WorkspaceSwitcher` items + sign out. Keep `card`/`avatar` variants working (`Workspace`'s ContextPane uses `card`). Lift entries from `components/workspace/top-bar.tsx` rather than retyping them.
- Modify: `apps/web/components/shell/coming-soon.tsx`: `icon` stays required (callers `/studio`, `/chat` unchanged); add optional `backHref` + `backLabel`.
- Create: `apps/web/app/(shell)/connections/page.tsx`: server component; `auth()`; no brand → empty state; computes `canManage = (await effectivePermissions(ws, user, brand)).has("integrations.manage")` and `brand.read` (else "no access" empty state); builds `notice` from `searchParams` like `settings/page.tsx`; renders an `h1` "Connections" and `ConnectionsTab`. Settings keeps its tab; the OAuth callback keeps returning to `/settings?tab=connections`.
- Create: `apps/web/app/(shell)/agents/[agent]/page.tsx`: `await params`; unknown key → `notFound()`; agents with a real Phase 1 href `redirect()` there; Soon agents render `ComingSoon` with the agent mark, "<Name> · <Role>", the blurb, and a back link to Overview.
- Modify: `apps/web/app/(shell)/chat/page.tsx`: redirect to `/` (the panel is the chat).

**Interfaces:**
- Consumes: `NAV`, `navFor`, `AgentKey` (Task 1).
- Produces: `<Sidebar brands workspaces activeWorkspaceId activeBrandId canCreateBrand platformAdmin user={{ name, email, image, roleLabel }} />`. `roleLabel` = the member's role name loaded in the layout (DB `Role.name` for the active workspace; fallback to the enum label). Pass only these fields, never the session. Comment that `platformAdmin` only controls visibility; `/admin` is gated by its own layout.

Sidebar geometry (V01, design px): width 232, white, no border; wordmark 112×33 at (20,32); switcher at y89; nav rows 48 tall at a 48 pitch, x20–204, r16, 20 px Lucide icons stroke 1.6 `#5E596B`, label 14 `#5E596B`; selected main row = primary fill, white icon and label (V01/V34 style); "Your agents" 12 px `#5E596B`; agent rows 52 pitch, 36×36 tile (the SVG), name 14 ink, role 12 `#5E596B`, selected agent row = `#EEEAFC` fill r16 x20–212; Soon agents show a `#F2F0F7` "Soon" badge (r8, 12 px `#4C40BB`); footer pinned bottom: Help & support (20 px icon) → divider `#DED9E6` x20–212 → account row (36 px circle `#EEEAFC`, initial `#4C40BB`, name 14 semibold ink, role 12 `#5E596B`, chevron `#5E596B`); the middle scrolls when the window is short.

- [ ] **Step 1: Implement** the sidebar, the two variants, the ComingSoon props, `/connections`, `/agents/[agent]`, `/chat` redirect.
- [ ] **Step 2:** Help & support links to the existing help destination if one exists, else `mailto:` the support address from env; if neither exists, omit the row and note it in the commit.
- [ ] **Step 3:** `npx tsc --noEmit -p .` clean.
- [ ] **Step 4: Commit** `Add the workspace sidebar, the Connections page and agent pages`.

### Task 3: Top bar and the Espanda assistant panel

**Files:**
- Create: `apps/web/components/shell/top-bar.tsx`: 72 tall, white, no bottom border; breadcrumb at the page's left padding: brand (14 `#5E596B`) + 16 px chevron icon + `navFor(pathname).title` (14 ink); no brand segment when `brandScoped` is false; right side: **no search field and no bell in Phase 1** (Search arrives with Phase 4, Activity with Phase 3); keep the existing **Logs** drawer toggle (move the `AgentLog` sheet from the old top bar unchanged, `ws.logsOpen` key) and, below 1280 px, the assistant toggle.
- Modify: `apps/web/components/workspace/chat-pane.tsx`: extract `ChatSession` so its header, empty state and starters are props/slots; `/` no longer mounts a chat column (see Task 4); reset `initial` to `null` whenever `base` (workspace/brand) changes; no other behaviour change. Keep the "never publishes" system line.
- Create: `apps/web/components/shell/assistant-panel.tsx`: 320 wide, no left border. Header white 120 tall: "Espanda" + "Your team, one conversation"; 20 px "New conversation" icon button (starts a fresh thread through the existing API); **no history button in Phase 1** (no list endpoint). Divider `#DED9E6`. Body `#F6F5F9`, padding 24, scrolls: context chip 272 wide r16 `#EEEAFC` ("BUSINESS CONTEXT" 12 px `#5E596B` / "<brand name>" 14 ink); then the conversation, or when empty: Espanda tile (36, r12, white) + "Espanda" 14 semibold + greeting "Ask about your business, your drafts or what to do next." + "A good place to start" (12 `#5E596B`) + two suggestions (white, 272×48, r16, text `#4C40BB`) that send "What should I focus on this week?" and "Summarise what my agents did recently." Composer white 240 tall, divider `#DED9E6`: textarea 272×136 r16 1 px `#DED9E6`, placeholder "Ask Espanda anything…"; **no Add context in Phase 1**; "Send message" primary button 272×48 r16. No brand: body says "Create a business to start a conversation", no composer. Rendered with `key={\`${workspaceId}:${brandId}\`}`.
- Responsive: ≥1280 px the panel is a column (`hidden xl:flex`); below, the top-bar toggle opens it in `components/ui/sheet.tsx` (right side, width 320, with `SheetTitle` "Espanda"). No localStorage.

**Interfaces:**
- Consumes: `navFor` (Task 1); chat API `GET/POST /api/v1/workspaces/:ws/brands/:brand/chat` as `ChatPane` uses it.
- Produces: `<TopBar brandName />`, `<AssistantPanel workspaceId brandId brandName />`.

- [ ] **Step 1: Implement** the extraction, the panel and the top bar.
- [ ] **Step 2:** `npx tsc --noEmit -p .` clean; `npx vitest run` all pass.
- [ ] **Step 3: Commit** `Add the slim top bar and the Espanda assistant panel`.

### Task 4: Assemble the shell, verify, owner checkpoint

**Files:**
- Modify: `apps/web/app/(shell)/layout.tsx`: `Sidebar` | column(`TopBar`, `MainArea`) | `AssistantPanel`; keep `PageViewTracker`; delete `loadScores` and the Google-connected count; load `roleLabel`.
- Modify: `apps/web/components/workspace/main-area.tsx`: canvas `#F6F5F9`, padding 32, scrolling inside the middle column; **keep the full-bleed branch for `/`** (Workspace needs a definite height).
- Modify: `apps/web/components/workspace/workspace.tsx`: remove the `chat` panel from its layouts (the assistant panel replaces it); fix copy that says "Open Logs in the top bar" if the location changed.
- Delete: `apps/web/components/workspace/top-bar.tsx` (only the layout imports it); keep `score-ring.tsx` (competitors panel uses it).
- Create: `apps/web/e2e/global-setup.ts`, `apps/web/e2e/shell.spec.ts`; git-ignore `e2e/.auth/`, `test-results/`, `playwright-report/`.

- [ ] **Step 1: Write the e2e test.** `global-setup.ts` refuses to run unless `baseURL` host is `localhost`/`127.0.0.1`, reads `E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD`, `E2E_VIEWER_EMAIL/E2E_VIEWER_PASSWORD`, `E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD` from env only (missing → fail, no defaults), signs each in once through `/login` and saves `storageState` to `e2e/.auth/<role>.json`. `shell.spec.ts` (`test.describe.configure({ mode: "serial" })`):
  - owner: sidebar shows Overview, Business context, Connections and the 8 agents (4 with "Soon"); each sidebar entry and each account-menu entry (Calendar, Performance, Agent log, Settings) lands on a page whose `main` landmark is visible; `/` shows the Workspace and no second chat column; switching business in the switcher shows the new brand name in the panel chip and none of the previous thread's messages.
  - viewer: `/connections` shows no "Connect"/"Disconnect" button.
  - non-admin: no Admin in the account menu and `/admin` does not render the admin pages; admin: Admin present and `/admin` renders.
  - viewport 1100×900: assistant column hidden; the toggle opens the sheet with the composer.
- [ ] **Step 2: Run** `npx playwright test e2e/shell.spec.ts --workers=1` against the dev server: FAIL before the layout swap, PASS after. Document the three e2e accounts and how to create them (seed + `isPlatformAdmin` for admin) in `e2e/README.md`.
- [ ] **Step 3: Run** `npx vitest run` and `npx tsc --noEmit -p .`.
- [ ] **Step 4: Browser check** of the chrome only (sidebar, top bar, panel) at 1920×1160 against V01, and `/` at 1440 and 1280 for the Workspace's panel layout. List differences in the commit body.
- [ ] **Step 5: Commit** `Use the Refined workspace shell for every web page`.
- [ ] **Step 6: Stop for the owner's review of the shell** before Phase 2.

---

## Roadmap after the shell (each phase gets its own plan when the previous one is approved)

- **Phase 2 · Overview and the review flow** (V01–V10, V37–V39, V11–V19, V22, Preview ·, V25), on ContentItem / ContentVersion / ApprovalDecision / Opportunity and jobs. Built **agent-generic from the start** (see spec "Phase 4 data model") so Spark, Beat, Pulse and Hum reuse the same review screens.
- **Phase 3 · Context and trust** (V23 Activity, V26 Sources and freshness, V34 Business context, V35 Connections); the bell and Activity arrive here. Can run alongside Phase 2.
- **Phase 4 · Agents** (V36 Agent instructions, V27–V33 workspaces, Tasks views, create task, task details, filters, Saved work, Search, Add context, Routines + run history): the generic draft function + per-agent config in `lib/agents`, on the Phase 2 data model; Tasks, Routines, Saved work and Search enter the sidebar here.
