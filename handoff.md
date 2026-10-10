# Handoff

Only things a new agent cannot discover by reading the repo. Everything else
(feature list, design system, i18n structure, test layout) is in the code.

## Deploy

`wrangler` is not a project dependency. The working binary is a cached npx path:

```
npm run build && node /home/mint/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js \
  pages deploy dist --project-name periodtracker
```

- Live site is the custom domain `https://periodtracker.run`. Each deploy also
  gets a `https://<hash>.periodtracker.pages.dev` URL.
- **The cron worker is a separate deploy** and does *not* pick up changes to
  `api/_worker.js`. Deploy it from its own directory:
  `wrangler deploy` inside `workers/email-cron/`.
- Secrets live in the dashboard / `wrangler pages secret put`: `PT_ADMIN_KEY`,
  `PT_ENC_KEY`, optional `GH_TOKEN`.
- The cron worker's own vars are separate and set in
  `workers/email-cron/wrangler.toml`: `APP_URL`, plus secrets `RESEND_API_KEY`,
  `PROBE_TARGET` (seed inbox for the weekly probe — without it the probe is
  skipped, never sent to users), optional `CRON_KEY` for manual triggers, and
  `APP_KEY` which must hold the same owner key (imported as `PT_ADMIN_KEY`).

## Admin panel

- Path `/admin`. Auth is the `x-admin-key` **header**, not a cookie or bearer
  token. Current key: `someonewashere`.
- The browser keeps it in `sessionStorage` under `ptAdminKey`, so a fresh test
  profile looks logged out until you set it.

## Test data I created in production — do not treat as real users

| Account | Why it exists |
|---|---|
| `admin-notes-demo@example.com` | 11 entries / 8 notes, created to verify the notes view renders full untruncated text. |
| `periodtracker.authentic544@passinbox.com` ("Raj") | Sign-up-flow testing. |

- `sec_storage_tamper` rows from IP **`152.59.173.73`** are my own tests —
  writing to `localStorage` directly trips the FNV-1a integrity check. They are
  not an attack. The `2409:…` IPv6 rows are genuine users.

## Data I introduced that is easy to break

**`__deleted` is a reserved key inside the synced entries blob** (`data.entries`
in D1). Deletion is an absence, and a merge cannot tell "deleted here" from
"never logged on this device", so absence travels as data:

- Client: `DELETED_WIRE_KEY` in `src/lib/storage.ts`, applied in
  `mergeEntries` and unioned by `mergeDeleted` (`src/lib/cloud.ts`).
- Persisted separately at `localStorage['pt.deleted.v1']` (not React state —
  tombstones are never rendered, only merged against).
- **Server: any new code that reads an entries blob must go through
  `liveEntries()` in `api/_worker.js`, never `Object.values()` or
  `json_each` without the `je.key <> '__deleted'` filter.** Otherwise tombstones
  render as a phantom log entry in the admin panel and inflate `entryDays`.

Before this existed, "Delete this log" was a no-op: the merge rebuilt from the
server copy, pulled the row back, and pushed it up again.

## D1

- Binding is `DB`, database id `b9344d01-3125-4790-a6f7-9ae0d08fe254`, shared
  with the cron worker.
- Free tier, **row reads reset at 00:00 UTC**. When it's exhausted every
  `/api/admin/*` endpoint returns 500 with a `D1_ERROR` body and direct
  `wrangler d1 execute --remote` fails too. Nothing is broken; it self-heals.
- The expensive read is the `json_each` scan over `data.entries`. The admin
  overview does it once, materialised. **Loading the panel repeatedly is what
  drains the budget** — each load is tens of thousands of rows.
- Indexes on `events`: `idx_events_time(created_at DESC)` and
  `idx_events_user(user_id)` pre-existed under those names. I added
  `idx_events_type_user(type, user_id)` because the activity feed's
  `GROUP BY type, user_id` and every tier cut full-scanned 20k rows without it.
  Don't add a second `created_at` index — `idx_events_time` already covers it.

## Admin template escaping

`api/_worker.js` opens the HTML with a single big template literal
(`const html = \`<!doctype html>` near the top of the admin section, closing at
the final `` ` `` before `export default`). The admin `<script>` is literal text
inside it. Line numbers drift as the file is edited — search for the opening
backtick rather than trusting a line number.

- In `onclick` / `onkeydown` attributes use **`&apos;`**, never `\'`. A single
  backslash terminates the emitted JS string.
- Conversely, `\"` and `\'` there are *unnecessary* escapes and eslint rejects
  them, because the template literal already passes both through literally.
- Symptom: a blank admin page, or a silently non-firing handler. Group 23 of
  `scripts/selfcheck.ts` renders the page and parses the emitted script to catch
  exactly this — if you touch the admin HTML, run it.

## Pending verification

- `GET /api/admin/notes` (the new cross-user Notes search) was written while D1
  was quota-blocked. Routing, the ≥2-char guard, Enter-to-search, and error
  reporting are all verified in the browser; **the SQL has never returned real
  rows**. Check it first thing after the reset.

## Tooling quirks that cost me time

- **`shell` is an outer tool, not callable from `execute`.** Inside `execute`,
  only the catalog tools are available.
- Playwright MCP has **no `emulate_media`**, but `browser_run_code_unsafe` runs
  arbitrary Playwright — use it for print media, offline mode, touch-free audits.
- **`browser_run_code_unsafe` has no Node `Buffer`.** Build `File` objects
  page-side with `DataTransfer` instead.
- **Backslash escapes in that tool's `code` string get mangled** by the wrapper —
  `\n` inside a regex becomes a literal newline and the call fails to parse. Use
  `String.fromCharCode(10)` and substring matching instead of regexes.
- `JS element.click()` races React re-renders. Use the `browser_click` tool with
  refs from `browser_find`, or `browser_run_code_unsafe`.
- **Stale copies are real here.** `periodtracker.run` and admin pages can serve
  a cached deployment. I lost time debugging an "unfixed" bug that was already
  fixed. Confirm with `curl <url> | grep <new string>` before believing a UI
  change did not land.
- `wrangler pages deployment tail` fails without an explicit deployment argument.
- Bash `UID` is readonly — don't use it as a variable name.

## Gates

```
npm run lint && npx tsc --noEmit && npm run build \
  && bun scripts/selfcheck.ts && bun scripts/smoke.tsx
```

`npm run build` already runs `tsc --noEmit`. `bun` runs the scripts, `npm` the
rest. All 27 selfcheck groups and the smoke test passed as of `bbb9f57`.
