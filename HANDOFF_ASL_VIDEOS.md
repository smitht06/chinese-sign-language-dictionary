# Handoff Report — ASL Video Integration (for resuming with a new agent)

> ✅ **COMPLETED, then removed from the app (2026-08-19)** — the video feature below was fully built and verified, then the app-side integration was removed by user request (preference: ASL pictures, not videos). The standalone script stays. See "Completion notes" at the bottom. This file is kept for reference only.

**Date:** 2026-08-19
**Goal:** Integrate the ASL-LEX dataset (86 short `.webm` videos) into the Expo React Native mobile app so each sign can show a 2-second ASL video clip.

---

## 1. What the ASL-LEX dataset is

Located in `ASL Data/`:

- **`ASL examples/`** — **86 `.webm` videos** (~2s, 720×480, VP8 video + Vorbis audio), each named by an English word (e.g. `TREE.webm`, `WATER.webm`, `5_DOLLARS.webm`).
- **`Data Files/signdata.csv`** — 2723 rows of metadata. Key columns:
  - `EntryID` — English word that uniquely identifies each video (matches the video filename, lowercased).
  - `SignBankEnglishTranslations` — comma-separated synonyms (e.g. `tree` → `"forest, nature, plant, tree, woods"`).
  - `DominantTranslation` — mostly empty (only 640/2723 rows populated).
  - `Code` — unique video code (e.g. `A_01_002`).
- **`Data Files/signdataKEY.csv`** — column definitions.
- **`ASL-LEX Manuscript.pdf`** — the paper describing the dataset.

**Key facts established:**
- All **86 videos** have a matching `EntryID` row in the CSV (video filename uppercased = `EntryID`).
- The CSV is **latin-1 encoded** (not UTF-8) — must open with `encoding='latin-1'`.
- **iOS cannot play VP8/Vorbis/WebM natively** — videos MUST be transcoded to H.264 `.mp4` for the app.

---

## 2. What has been DONE

### 2a. Data prep script — `scripts/build_asl_videos.py` (COMPLETE, mostly working)

This script:
1. **Transcodes** each `.webm` → H.264 `.mp4` (720×480, yuv420p, AAC, faststart, crf 28) into `build/asl_videos/`.
2. **Fuzzy-matches** each video to a `sign_id` in `sign_themed.db` by English word.
3. Writes `build/asl_videos.json` (map `sign_id → "WORD.mp4"`) and `build/asl_videos_match.log` (audit log).

**Matching strategy (priority order):**
1. Exact match on `meanings.en_text` (case-insensitive).
2. Match against CSV `SignBankEnglishTranslations` / `DominantTranslation` synonyms.
3. Fuzzy match (token overlap / substring) against `en_text` **only**.

**Important design decision already made:** `en_description` is **excluded** from fuzzy matching. The hand-movement descriptions contain generic verbs ("move", "represent", "swing") that caused massive false-positive clusters (many unrelated videos all matched one generic sign). This was fixed by restricting fuzzy matching to `en_text` only.

**Current output:** `build/asl_videos.json` has **75 matches** (86 videos → 75 unique signs; some videos like `ABOUT_1`/`ABOUT_2` map to the same sign). All 86 videos transcoded successfully.

### 2b. Transcoding artifacts (COMPLETE)
- `build/asl_videos/*.mp4` — all 86 transcoded videos exist.
- `build/asl_videos.json` — sign_id → video filename mapping.
- `build/asl_videos_match.log` — audit log of every match.

---

## 3. What still needs to be DONE

### 3a. ⚠️ FIX the fuzzy-matching false positives (KNOWN BUG)

The current match log still has a **false-positive cluster**: these unrelated videos all match **sign 222** (`保留`/`reserve`, `搁置`/untranslated):
`BATHTUB, CHEERLEADER_1, CIGAR, COUCH_1, CRY, CURL, EMPHASIS, POP_2, ROAST, SUSPECT, VITAMINS`

**Root cause to investigate:** The fuzzy pass returns the globally-best-scoring sign even when the score is weak. Sign 222's `en_text` includes `搁置` (untranslated Chinese) and `reserve`. The substring-containment heuristic (`word_norm in t_norm or t_norm in word_norm` → score 0.9) is too aggressive for short words. **Debug this** — a quick script was about to be run to see why "cry" scores ≥0.5 against sign 222.

**Suggested fixes:**
- Raise the fuzzy threshold (e.g. 0.5 → 0.7) and/or require a minimum token overlap (not just substring).
- Drop the substring-containment heuristic, or only allow it for multi-word terms.
- Filter out `en_text` values that are untranslated Chinese (no ASCII letters) — they add noise.
- Consider a manual override map for known-good matches.

**After fixing, re-run:** `python3 scripts/build_asl_videos.py` and re-review `build/asl_videos_match.log`.

### 3b. Extend the bundling script — `mobile/scripts/build_data.py` (NOT DONE)

Need to:
- Copy `build/asl_videos/*.mp4` → `mobile/assets/data/asl_videos/`.
- Add a `signs.asl_video_path` column (mirror the existing `asl_image_path` column) and populate it from `build/asl_videos.json`.
- Generate an `aslVideoAssets` map in `mobile/lib/assets.ts` (static `require()` per video).
- Add `.mp4` to metro's `assetExts` in `mobile/metro.config.js` (like `.db` was added).

### 3c. App changes (NOT DONE)

- Add **`expo-video`** dependency to `mobile/package.json` (currently NOT installed).
- New **`SignVideo`** component (mirror `mobile/app/components/SignImage.tsx`): renders an `expo-video` player when `asl_video_path` is set, with a play button + "ASL" badge; renders nothing otherwise.
- Update **`mobile/app/sign/[id].tsx`**: keep the still image at the top, and add an **"ASL video" section at the bottom** that shows the `SignVideo` player when a video is available. (User explicitly requested: video goes at the BOTTOM, not replacing the image.)
- Update **`mobile/lib/db.ts`** (`SignRow` type + `getSign` query) and **`mobile/app/_layout.tsx`** (onInit migration) for the new `asl_video_path` column.

### 3d. Docs & verification (NOT DONE)

- Update `README.md`, `README.en.md`, `CLAUDE.md` to document the ASL video feature.
- Rebuild (`python3 mobile/scripts/build_data.py`), reinstall on simulator, verify videos play.

---

## 4. Reference — how the existing ASL *image* feature works (mirror this for videos)

The repo already has an ASL **image** feature that was completed earlier. Mirror its pattern for videos:

- **DB column:** `signs.asl_image_path` (TEXT/NULL) — set by `build_data.py`.
- **Bundling:** `build_data.py` copies `asl_images/` → `mobile/assets/data/asl_images/`, sets `asl_image_path`, generates `aslImageAssets` map in `lib/assets.ts`.
- **Component:** `mobile/app/components/SignImage.tsx` shows the ASL image (with "ASL" badge) when `asl_image_path` is set, else falls back to the CSL image.
- **Detail screen:** `mobile/app/sign/[id].tsx` uses `SignImage`.

For videos, the user wants the video in a **separate section at the bottom** (not replacing the image), so `SignVideo` should be a distinct component rendered below the existing content.

---

## 5. Commands to run

```bash
# Re-run the ASL video prep (transcode + match) after fixing the matcher
python3 scripts/build_asl_videos.py

# Review the match audit log
cat build/asl_videos_match.log

# Rebuild the app data bundle (after extending build_data.py)
python3 mobile/scripts/build_data.py

# Start the app
cd mobile && npx expo start
```

---

## 6. Key files

| File | Status | Purpose |
|---|---|---|
| `scripts/build_asl_videos.py` | ✅ Written, needs matcher fix | Transcode + fuzzy-match ASL videos |
| `build/asl_videos/*.mp4` | ✅ Done | 86 transcoded H.264 videos |
| `build/asl_videos.json` | ✅ Done (needs regen after fix) | sign_id → video filename |
| `build/asl_videos_match.log` | ✅ Done (needs regen) | Match audit log |
| `mobile/scripts/build_data.py` | ❌ Not extended | Bundle videos into app |
| `mobile/lib/assets.ts` | ❌ Not extended | Video asset map |
| `mobile/metro.config.js` | ❌ Not extended | Add `.mp4` to assetExts |
| `mobile/package.json` | ❌ Not updated | Add `expo-video` |
| `mobile/app/components/SignVideo.tsx` | ❌ Not created | Video player component |
| `mobile/app/sign/[id].tsx` | ❌ Not updated | Add video section at bottom |
| `mobile/lib/db.ts` | ❌ Not updated | Add `asl_video_path` |
| `mobile/app/_layout.tsx` | ❌ Not updated | Migration for new column |
| `README.md` / `README.en.md` / `CLAUDE.md` | ❌ Not updated | Docs |

---

## Completion notes (2026-08-19)

- **Matcher bug fixed.** Root cause: untranslated-Chinese `en_text` (e.g. 搁置) normalized to `""`, and the substring heuristic `"" in word` scored 0.9 for *every* word — sign 222 (lowest id among 94 such rows) won all fuzzy matches. Fixes in `scripts/build_asl_videos.py`: skip `en_text` with no ASCII; replace substring/Jaccard fuzzy with **token-boundary containment** (full token of the word must appear in an `en_text` term); tokens are pure letters ≥3 chars (digits like "1" from `CHEERLEADER_1` excluded); added `MANUAL_MATCHES` (`COUCH_1 → 沙发` accept, `EMPHASIS → None` deny). Result: 79/86 videos → 78 signs; 7 honest NO MATCHes; recovered CURL→蜷曲, ROAST→烤鸡, SUSPECT→犯罪嫌疑人.
- **Bundling:** `mobile/scripts/build_data.py` copies `build/asl_videos/*.mp4` → `mobile/assets/data/asl_videos/`, sets `signs.asl_video_path`, emits `aslVideoAssets` in `lib/assets.ts`. `mobile/metro.config.js` adds `mp4` to `assetExts`. `.gitignore` now ignores `ASL Data/*` and `build/`.
- **App:** `expo-video` ~57.0.2 installed; new `app/components/SignVideo.tsx` (loop, muted, custom play/pause via `useEvent(player, 'playingChange')`, ASL badge); `sign/[id].tsx` shows an "ASL video" section at the bottom; `db.ts` `SignRow`/`getSign` + `_layout.tsx` migration cover `asl_video_path`.
- **Verified:** tsc clean; `expo export --platform ios` bundles all 78 mp4s; native build + launch on iPhone 17 simulator (fixed stale `NODE_BINARY` pin in `ios/.xcode.env.local` — brew upgraded node 22.22.3 → 22.23.2); deep-linked to sign 4683 (TREE) — detail screen renders the ASL video section with ▶ and badge; no video errors in runtime logs.
- **Final outcome (2026-08-19):** app-side video integration was removed by user request (preference: ASL pictures, not videos). `expo-video`, `SignVideo.tsx`, `asl_video_path`, and the video bundling in `build_data.py` are gone from the app; docs now describe `build_asl_videos.py` as a standalone tool. The script + `build/asl_videos*` artifacts stay for future use. A follow-up PopSign + Long's 1910 ASL *picture* pipeline was later built and then reverted too ("too ambitious"); the manual `asl_images/` basename drop-in remains the only supported ASL picture mechanism.
