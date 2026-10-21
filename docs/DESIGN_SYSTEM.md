# Design System — Multi-Brand AI CMO Platform

Neutral platform chrome; **per-brand** accent may come from brand photography and optional `BrandProfile` theme tokens later. **shadcn/ui** + Tailwind CSS. Do not copy Okara or Scalio branding. B&C seed uses warm editorial tokens below as **one brand’s** preview—not global product skin.

---

## 1. Principles

- **Editorial hierarchy:** Content and imagery lead; chrome stays quiet
- **Restraint:** Neutral surfaces, one accent, generous whitespace
- **Status clarity:** Workflow states (draft, in review, approved, published, failed) always visible
- **Accessibility:** WCAG 2.2 AA contrast for text; focus rings; keyboard paths for dialogs and tables

---

## 2. Color tokens (CSS variables)

Target: `app/globals.css` with light mode first; dark mode optional later.

| Token | Light value (HSL) | Usage |
|-------|-------------------|--------|
| `--background` | `40 20% 98%` | Page background (warm off-white) |
| `--foreground` | `30 10% 12%` | Primary text |
| `--card` | `0 0% 100%` | Cards, panels |
| `--muted` | `40 12% 94%` | Secondary surfaces |
| `--muted-foreground` | `30 8% 42%` | Meta text |
| `--border` | `35 14% 88%` | Dividers |
| `--primary` | `28 32% 28%` | Actions (deep walnut) |
| `--primary-foreground` | `40 20% 98%` | On primary |
| `--accent` | `75 18% 42%` | Highlights (muted olive) |
| `--destructive` | `0 72% 42%` | Errors, reject |
| `--success` | `145 35% 32%` | Approved, healthy |
| `--warning` | `38 92% 50%` | Stale stock, warnings |

**Brand note:** In brand-scoped views, product/hero imagery carries color; platform chrome stays neutral so any onboarded brand’s assets dominate.

---

## 3. Typography

| Role | Font stack | Size / line |
|------|------------|-------------|
| Display | `"Fraunces", Georgia, serif` | `text-3xl`–`text-4xl`, tight tracking for page titles |
| UI / body | `"Inter", system-ui, sans-serif` | `text-sm` base, `leading-relaxed` |
| Mono / data | `"JetBrains Mono", monospace` | SKUs, ids, metrics |

Load via `next/font` (self-hosted). Avoid more than two families.

**Scale:** Tailwind defaults; prefer `text-sm` for dense tables, `text-base` for editor areas.

---

## 4. Spacing & layout

- Base unit: 4px (`space-1`)
- Page padding: `px-6 lg:px-10`, `py-6`
- Sidebar width: `16rem` expanded, `4rem` collapsed (Screen 1)
- Max content width for reading: `max-w-3xl` (brief editor); dashboards `max-w-7xl`
- Card padding: `p-6`; compact rows `p-4`

---

## 5. Elevation & borders

- Cards: `border border-border shadow-sm` (no heavy shadows)
- Modals: `shadow-lg`
- Focus: `ring-2 ring-primary ring-offset-2`

---

## 6. shadcn/ui components (install order)

1. `button`, `input`, `label`, `textarea`
2. `dialog`, `dropdown-menu`, `select`
3. `table`, `badge`, `tabs`
4. `calendar` (date picker for Screen 7)
5. `toast` / sonner for feedback
6. `sheet` for mobile nav

Customize via CSS variables above in `components.json`.

---

## 7. Application components (feature-level)

| Component | Responsibility |
|-----------|----------------|
| `AppShell` | Sidebar + header + workspace selector + **brand switcher** |
| `BrandSwitcher` | Lists accessible brands; shows `displayName` + status; blocks navigation actions when none selected (REQ-PLAT-002) |
| `BrandLabel` | Chip in header: active brand name; portfolio mode shows “Portfolio” badge |
| `PageHeader` | Title, breadcrumbs, primary action |
| `StatusBadge` | Maps workflow enums to color + label |
| `EmptyState` | Illustration-free; clear CTA |
| `DataTable` | Sortable columns, filter row |
| `OpportunityCard` | Score, rationale, product chip |
| `ContentPreview` | IG caption truncation preview (125 chars) — mirrors `caption.py` UX |
| `ApprovalBanner` | Version id, approver, blocking checks |
| `IntegrationHealthPill` | Connected / degraded / error |
| `LoadingSkeleton` | List and card placeholders |

---

## 8. Imagery

- Product thumbnails: fixed aspect `aspect-[4/5]` in grids
- Hero previews: `aspect-video` for Reel
- Use `next/image` with explicit sizes; lazy load below fold
- Placeholder when asset rights `PENDING` — never show unlicensed competitor media

---

## 9. Motion

- Subtle: `transition-colors duration-150`
- Avoid gratuitous animation; respect `prefers-reduced-motion`

---

## 10. Responsive breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< md` | Collapsible nav sheet; stack filters |
| `md+` | Sidebar visible |
| `lg+` | Two-column studio (editor + preview) |

---

## 11. Content-specific patterns

### Opportunity feed

- Left: source + timestamp + provenance link
- Center: title + AI summary (labeled)
- Right: score + actions (shortlist / reject)

### Studio

- Split pane: editor | live preview (platform toggle)
- Version timeline vertical rail

### Calendar

- Month grid + list toggle; overdue in `--warning`

---

## 12. Accessibility checklist (per screen)

- [ ] All icons with `aria-hidden` + text label or `aria-label`
- [ ] Form errors linked with `aria-describedby`
- [ ] Table headers `scope="col"`
- [ ] Dialog focus trap and Esc close
- [ ] Color not sole indicator of status (icon + text)

---

## 13. Authorization & data honesty (Phase 0.5)

### Permission-denied states

- Destructive or privileged actions hidden **and** server-enforced; when user lacks capability, show inline **“You don’t have permission”** with request-access hint — never a no-op button.
- OWNER separation override (`content.approve.self`): confirm dialog + audit notice in `ApprovalBanner`.

### Stale commercial data

- Product stock past freshness TTL: `--warning` badge **“Stock unverified”** with last-checked timestamp; publish CTA disabled at UI level (server still authoritative).
- Expired offer linked to draft: banner **“Offer ended”** with link to commercial settings.

### Unavailable metrics (REQ-BRIEF-019)

- Use em dash or **“Unavailable”** label — never `0` for missing platform metrics.
- `delayed` metrics: subtle **“Updating…”** with `observedAt` when known.
- Comparison charts: footnote when metrics are not cross-platform comparable (GA4 vs Meta).

### Integration health

- `IntegrationHealthPill`: `healthy` | `degraded` | `error` | `disconnected` with reconnect CTA on `error`.

---

## 14. Files to create (Screen 1)

- `app/globals.css` — tokens
- `tailwind.config.ts` — extend fontFamily, colors
- `components/ui/*` — shadcn
- `components/layout/app-shell.tsx`
- `components/layout/brand-switcher.tsx`

### Brand switcher UX (REQ-PLAT-002)

- Placement: header, adjacent to workspace selector
- No primary CTA (create brief, approve, publish, connect integration) without `activeBrandId` — show inline prompt “Select a brand”
- Archived brands: visible to admins in switcher with “Archived” badge; read-only history routes only
- Portfolio view: separate nav entry; distinct from brand context (DEC-022)
- `lib/design-tokens.ts` — export status color map for badges
