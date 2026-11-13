# Final whole-branch review: security (702b5d0..HEAD)

**Verdict: no Critical or Important findings. One new Minor (location metadata), plus notes.** The known deferred
items in progress.md and the task reviews are not repeated. None of them turned out worse than recorded.

## What was checked and holds

- **Route authorization.** Every new route and action goes through `authorizeBrandRoute`: session, then the
  workspace header must match the path, then brand access, then the permission. The permissions match the spec's
  table:
  - `content.create`: sources, upload slot, upload done, `editStory`, `duplicate`, `delete`.
  - `publish.execute`: due, package, `byHand`, `postedByHand`, `postRest`, `markDone`, `settleFrame`.
  - `content.approve`: `decide`, unchanged.
  - `brand.read`: the GET routes.
- **Brand scoping in services.** Every service lookup is scoped to the workspace and brand, and to the item where it
  applies:
  - `loadStory` and `loadItem`;
  - `storyAttempt`, which checks the attempt id, workspace, brand and item;
  - `verifyUpload`'s claim;
  - `storyRenderState` and `storyView`;
  - `resolveSource` for all six source kinds (each a DB lookup, never a key pattern);
  - `registerManualPost`.

  A `requestId` reused across brands can't match another brand's charge (`chargeRef` includes the brand).
- **Approval seal.** Every route out re-checks `currentApproval` against the latest version and its package hash:
  - schedule, then `executePublication`;
  - Post the rest, which keeps the old hash, so an edit made in between fails the seal;
  - the package;
  - Post by hand;
  - "I posted it".

  Rendered keys are addressed by their inputs. Their sources can't change afterwards: upload, library, product and
  photoshoot keys are random UUIDs written once, and the logo carries a hash of its bytes. So an approved package
  can't change underneath its hash. No client path can write to a `stories/` key.
- **Upload slots.**
  - The server picks the key (`<ws>/<brand>/uploads/<uuid>.<ext>` via `mediaKey`), and nothing from the client
    reaches the path.
  - Content-Type and Content-Length are signed into the URL; the live bucket test in Task 4 confirmed storage
    enforces them.
  - Verify claims the row once and reads the bytes once, capped at the declared size.
  - Photos are checked by magic bytes and sharp metadata. Clips are checked by ffprobe with
    `-protocol_whitelist file -f mov`, a 20 s timeout and the size check first.
  - The checked bytes are copied to a new key the client never saw.
  - `ownMediaKey` refuses keys in subfolders, so an unverified `uploads/` key can't be smuggled in as a post's
    `photoKeys`, and through that as a story "post" source.
- **ffmpeg and sharp injection.** ffmpeg runs with argv arrays only (`execFile`). `clip.start` and `crop` are finite
  zod numbers, clamped by `normCrop`/`cropWindow`, and the filter graph holds only computed integers. All user text
  reaching Pango goes through `escapeMarkup`, which strips control and bidi characters and escapes entities. The
  colour and SVG rects are constants. The text in `aiMarkPng` comes from a fixed table.
- **Signed URLs.** `renderedUrl` only signs keys under `<ws>/<brand>/stories/`, and `sourceUrl` only keys under
  `<ws>/<brand>/`; both refuse `..`. Both expire after an hour. Story links in the body must be https (the
  credentials-in-URL minor is already deferred).
- **Zip.** It only fetches our own signed URLs (no SSRF), with a 60 s timeout per frame. `link.txt` holds the https
  link that was checked. The filename is the cuid of an item that exists, because `storyPackage` returns 404 before
  the header is built. Each download writes an audit event.
- **Rights record.** `rightsConfirmedBy` and `rightsConfirmedAt` are set by the server from the session, and slots are
  refused unless `rightsConfirmed === true`. The `rights` field in the version body comes only from `resolveSource`,
  because `parseStoryInput` strips it from client input.
- **Seed script.** `guard()` runs before every mode: not in production, the database host must be in
  `SEED_ALLOW_DB_HOSTS`, and only the pinned workspace and brand. `--remove` is limited to seeded titles.
- **Leaks.**
  - Render failures reach clients only as `story-refused:` JSON; ffmpeg and sharp text and temp paths stay in
    `Job.lastError`.
  - Upload rejections are fixed strings.
  - Graph error text is capped at 300 characters and never holds the token (fetch errors carry no URL).
- **Rate limits.** As the spec sets them:
  - renders: 30 per person and 100 per brand per hour;
  - upload slots: 20 per brand per hour;
  - package: 20 per person per hour;
  - AI starts: the daily workspace cap.

## Minor

### M1. A phone clip's GPS location survives into the rendered story frame and the original upload

- **Where:**
  - `apps/web/server/stories/render.ts:396-405`: `clipArgs` has no `-map_metadata -1`.
  - `apps/web/server/stories/uploads.ts:91`: uploaded bytes are stored as they are.
  - `apps/web/server/stories/service.ts:347`: `sourceUrl` hands the original to `brand.read`.
- **Class:** personal-data leak through file metadata.
- **Scenario:** a team member films a clip at home and uploads it. ffmpeg copies the container's global metadata to
  the output by default, so the rendered frame MP4 carries the `location` tag:
  - It is in the zip and in "Save to album" on the phone.
  - It is in the file Meta fetches.
  - The original photo or clip is kept with its EXIF/QuickTime location, and anyone with `brand.read` can open it
    through `sourceUrl`.

  Verified locally with the repo's ffmpeg-static, using the exact `clipArgs` options: an input with
  `location=+48.8577+002.2950/` came out with `location` and `location-eng` still set. Photo frames are not affected,
  because sharp drops metadata by default.
- **Exposure:** the brand's team, whoever gets the package, and Meta. Meta most likely strips it on ingest, so this
  ranks Minor.
- **Fix:**
  - Add `-map_metadata -1` (and `-map_chapters -1`) to `clipArgs`, and bump `RENDERER_VERSION`.
  - Optionally strip the metadata at verify: for photos, a sharp `rotate()` and re-encode; for clips, a
    `-c copy -map_metadata -1` remux. That would also drop the location from originals.

## Notes (by design, not defects)

- `brand.read` roles (Viewer, Commercial owner) get signed URLs to every rendered frame and source through
  `GET content/[id]` (`storyView`). Gating the package at `publish.execute` therefore controls who acts, not who
  can see; that matches how posts already work.
- Any `content.create` member can finish (verify) or use another member's upload. The rights line still names the
  person who confirmed, which matches the spec ("phone uploads = confirmed by the uploader"). The same holds when the
  Creator agent picks someone's upload for a different story.
- The upload-slot limit is per brand, so one member can use up the brand's 20 slots per hour. The spec sets it that
  way.
