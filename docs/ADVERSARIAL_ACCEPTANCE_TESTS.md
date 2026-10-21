# Adversarial Acceptance Tests

Required **before** marking the related feature complete. Automate at service/API/DB boundaries where possible. Documentation defines expectations only — **no claim these have been executed** until CI runs them post-scaffold.

**Register:** `docs/FINDINGS_REGISTER.md`  
**Product traceability:** `REQ-BRIEF-*`, `REQ-MDI-*`

---

## Test matrix

| ID | Scenario | Expected result | Maps to feature / screen | Findings |
|----|----------|-----------------|--------------------------|----------|
| AT-001 | User accesses another workspace's asset ID | Denied; no data leakage | Catalogue, studio, all `:id` routes | F-001 |
| AT-002 | Child record references parent in another workspace | DB or service rejects insert/update | Prisma constraints + services | F-001 |
| AT-003 | Approved draft has image replaced (publish-relevant media) | Publication blocked pending reapproval | Screen 8–9, `PublicationPackage` | F-011 |
| AT-004 | Same publish request concurrently twice (same `idempotencyKey`) | At most one external publication | Screen 9, `PublishService` | F-003, DEC-012 |
| AT-005 | Publish times out after platform may have accepted | Reconcile before retry; no blind republish | Integrations publish worker | F-003, DEC-015 |
| AT-006 | OAuth callback reuses consumed `state` / nonce | Rejected | Screen 11 OAuth | F-005, DEC-017 |
| AT-007 | Job worker crashes after claiming job | Another worker recovers after lease expiry | `/api/v1/jobs/run` | F-003, DEC-015 |
| AT-008 | Stock becomes stale after approval | Publish blocked or policy-driven waiver only | Screen 9 pre-publish checks | F-007, DEC-020 |
| AT-009 | AI output contains unsupported material claim | Quality check blocks per policy | Screen 8 validators | F-004, REQ-BRIEF-055 |
| AT-010 | Source URL redirects to private network | Fetch rejected | Screen 5 collection | F-009 |
| AT-011 | Platform did not return a metric | UI shows unavailable, not zero | Screen 10 analytics | F-010 |
| AT-012 | Editor attempts to approve own content | Rejected and audited | Screen 8 approve API | DEC-008, DEC-019 |
| AT-013 | Channel variant changes destination URL | New `PublicationPackage` hash; reapproval required | Screen 6–8 | F-011 |
| AT-014 | Disconnected account / refresh token failure | Connection `health=error`; publish blocked | Screen 11 | F-005 |
| AT-015 | OWNER attempts to waive invalid content hash / rights failure | Rejected (non-waivable) | Screen 8 waiver API | F-004, DEC-020 |
| AT-016 | Duplicate analytics import (same idempotency key) | No duplicate snapshot rows | Screen 10 import | F-010 |
| AT-017 | `X-Workspace-Id` ≠ path `workspaceId` | 403 | All workspace routes | F-001 |
| AT-018 | Membership revoked mid-session | Next mutating request 403 | Auth middleware | F-008 |
| AT-019 | User accesses brand B asset id while session/context is brand A (same workspace) | Denied; no data leakage | All brand-scoped `:id` routes | F-019, F-021 |
| AT-020 | AI workflow job payload lists entity ids from two brands | Worker rejects before provider call | `AiWorkflowRun`, job handler | F-021, DEC-023 |
| AT-021 | Child record insert with mismatched `(workspaceId, brandId)` parent | DB or service rejects | Prisma constraints + services | F-019 |
| AT-022 | Job `brandId` A with `productId` belonging to brand B | Job rejected or failed closed | Job runner | F-020 |
| AT-023 | User without `brand.read` on brand B requests portfolio dashboard | Brand B metrics omitted or 403; never full leak | `.../portfolio/dashboard` | F-022, DEC-022 |
| AT-024 | Brand archived | Mutations 409; historical `PublishedPost`/`AuditEvent` still readable | Brand lifecycle | F-023 |

---

## Implementation mapping (when to add tests)

| Phase / slice | Minimum AT IDs |
|---------------|----------------|
| Phase 1 foundation + tenant/brand helpers | AT-001, AT-002, AT-017, AT-019–AT-024 |
| Screen 3 catalogue | AT-001 |
| Screen 5 research | AT-010 |
| Screen 8 approval | AT-009, AT-012, AT-015 |
| Screen 9 publishing | AT-003, AT-004, AT-005, AT-008, AT-013 |
| Screen 10 analytics | AT-011, AT-016 |
| Screen 11 integrations | AT-006, AT-014 |
| Jobs worker | AT-007 |

---

## Gate for Phase 1 scaffold approval

Documentation remediation complete when this file and `FINDINGS_REGISTER.md` exist and P0 items F-001–F-004, F-011 are reflected in `DATA_MODEL.md`, `API_CONTRACTS.md`, `DECISIONS.md`, and `ARCHITECTURE.md`.

**Execution gate for Phase 2+:** AT-001, AT-002, AT-017, **AT-019–AT-024** must pass in CI before Screen 3+ feature work merges.
