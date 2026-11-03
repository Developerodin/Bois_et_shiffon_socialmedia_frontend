# End-to-end tests

`shell.spec.ts` signs in as three accounts against a **local** dev server (`npm run dev`, http://localhost:3100).
`global-setup.ts` refuses any other host, signs each account in once through `/login` and keeps the session in
`e2e/.auth/<role>.json` (git-ignored). Login is rate-limited per email and IP, so run with one worker:

```sh
npx playwright test e2e/shell.spec.ts --workers=1
# no downloaded Playwright browsers? use the installed Edge:
PLAYWRIGHT_CHANNEL=msedge npx playwright test e2e/shell.spec.ts --workers=1
```

## Accounts

Put these six values in `apps/web/.env` (git-ignored; global-setup loads it). There are no defaults: a missing value
stops the run. Never commit them.

| Variable | Account |
| --- | --- |
| `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD` | Owner of a workspace with at least two businesses, one of which has an earlier Espanda conversation for this person (the brand-switch test starts from it). |
| `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD` | Workspace role **Member** with the project role **Viewer** on that workspace's businesses (what accepting a project invitation as Viewer gives you). |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | A platform admin (`User.isPlatformAdmin`), no workspace needed. |

How to make them on a local database:

- **Owner**: `npm run db:seed -w web` creates the seed owner (password from `SEED_OWNER_PASSWORD`), or use any local
  account that owns a workspace. `npm run set-password -w web -- <email>` sets a known password.
- **Viewer**: invite the address from Settings, Team, as a Viewer on each business and accept the invitation, or do the
  same from a script with `joinFromInvitation` (`server/services/accounts.ts`) and the workspace's `viewer` role.
- **Admin**: `npm run platform-admin -w web -- create <email>` (prints the password once), or
  `grant <email>` for an existing account.

Traces, screenshots and videos go to `test-results/` and reports to `playwright-report/`, both git-ignored.
