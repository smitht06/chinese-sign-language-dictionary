# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**中国手语词典数据库** — extracts 《国家通用手语词典（全四册）》EPUBs into a base SQLite DB + flat image folder, plus a derivative theme-tagged DB with difficulty progression, for consumption by the sibling `signo-web` app.

> This folder is a sub-project of `/Users/wishingcat/Projects/Signo/`. That parent `CLAUDE.md` documents the Next.js app; this one documents only the data pipeline.

## Repo layout

```
sign-language-database/
├── DictionaryBook/       ← source: 4 EPUBs (Volume 1–4.epub). Do not modify.
├── scripts/
│   ├── extract_epub.py        ← base pipeline: EPUB → signs.db + images/
│   ├── add_themes.py          ← one-shot tag pass (docx → signs.theme); input docx removed from repo, kept for reference
│   ├── add_theme_order.py     ← writes `themes` table (difficulty_rank, tier) into sign_themed.db
│   ├── build_progression.py   ← reads sign_themed.db → emits 主题难度进阶.md
│   ├── translate_en.py        ← DeepSeek API: adds English translations (en_text / en_description)
│   ├── test_data.py           ← data-invariant test suite (read-only); the CI gate
│   └── build_asl_videos.py    ← ASL-LEX videos → H.264 mp4 + sign_id matches (standalone tool, app does not use)
├── ASL Data/            ← ASL-LEX dataset (86 .webm videos + signdata.csv); not committed
├── build/               ← transcoded mp4s + asl_videos.json + match audit log (generated)
├── images/               ← 6699 extracted sign images (v{N}_ prefixed)
├── signs.db              ← base DB (signs + meanings)
├── sign_themed.db        ← derivative: adds signs.theme column + themes table
├── mobile/               ← Expo React Native offline app (search / browse / themes); Jest tests in __tests__/, Maestro flows in e2e/, eas.json
└── 主题难度进阶.md        ← generated teaching-order view of sign_themed.db
```


## Rebuild commands — one per artifact

```bash
# 1. Base extraction (~10s; requires DictionaryBook/Volume {1..4}.epub)
rm -rf images signs.db && python3 scripts/extract_epub.py

# 2. Difficulty ordering + progression doc (operates on committed sign_themed.db)
python3 scripts/add_theme_order.py
python3 scripts/build_progression.py
```

Python 3.13 stdlib only; no deps. The base pipeline is idempotent.

**`sign_themed.db` is a committed snapshot, not a rebuildable artifact.** It was produced by `add_themes.py` from `手语词库主题分类（2025.2）.docx`, which is no longer in the repo. To re-derive tags from scratch, restore that docx at the repo root and run `add_themes.py`.

## Architecture — how the pipeline thinks about the source

The source EPUBs have a predictable shape per letter section. The parser exploits this and makes **no attempt** at general-purpose EPUB/HTML parsing:

1. **Volume detection** — iterate `DictionaryBook/Volume {1..4}.epub`, extract each to a tmp dir.
2. **Dictionary section detection** — a xhtml is a dict section iff its first `<h1 class="sect1">` is a single `A-Z` char, or the literal string `其他`. Preface/国歌/索引 files fail this test and are skipped automatically.
3. **Entry parsing** — split body on `<h2 class="sect2">`. For each chunk:
   - `<h2>` text before the `　` (U+3000) full-width space = Chinese header; everything after is pinyin (discarded).
   - First `<div class="picture_figure"><img src="...">` = the sign image.
   - All `<p class="content">` until next `<h2>` = description, joined by `\n`.
4. **Header decomposition** (`parse_header`) — takes cleaned Chinese head like `标题①（题目①、书名号）` and yields `[(text, variant_index, order)]` tuples. Splits on `（…）` then `、`.
5. **Variant stripping** (`parse_variant`) — trailing circled digit → numeric `variant_index`.

## Non-obvious decisions baked into the parser

- **Two coexisting circled-digit glyph sets** in the source: `①-⑨` (U+2460–2468) AND `❶-❾` (U+2776–277E). Both are mapped to `variant_index` 1–9 via `CIRCLED.index() % 9 + 1`. If you touch `CIRCLED`, keep both halves 9 chars.
- **Image namespacing** — the same filename (e.g. `txt005_2.jpg`) appears in multiple volumes with different content. Output images are prefixed `v{N}_` to prevent collisions. Never remove this prefix logic.
- **`letter='#'`** is reserved for the 其他 section (numbers 0–100, 千万亿, and abbrevs like 3D/CT/KTV/QQ/WIFI). `其他` entries legitimately contain ASCII in their head — do NOT apply any "strip pinyin by finding Latin char" heuristic, it will corrupt them.
- **Missing letters**: no I, U, or V — this matches real Chinese pinyin usage, not a bug.
- **`HEAD_OVERRIDES` dict at the top of the script** — 4 source-EPUB typos (missing `　` separator or missing `（`) that the parser cannot recover from. Keyed by the exact broken head string after tag-strip. Add a new row here when a new typo surfaces; do NOT add parser heuristics to "fix" typos generically.

## Schema — two tables

### `signs` — one row per sign (one image)

| 列 | 类型 | 含义 |
|---|---|---|
| `id` | INTEGER PK | 手势唯一 id |
| `image_path` | TEXT | `images/v{N}_...jpg`，相对路径 |
| `description` | TEXT | 打法文字；原书分步 `（一）`/`（二）` 用 `\n` 拼接 |
| `source_entry` | TEXT | 原书 h2 标题清洗版（去拼音、去 html），仅供溯源 |
| `letter` | TEXT | 首字母分区 `A`–`Z` 或 `#`（其他） |
| `volume` | INTEGER | 来自第几册（1–4） |
| `asl_image_path` | TEXT / NULL | 可选 ASL 图片相对路径（`asl_images/...`）；由 `build_data.py` 写入，NULL 表示无 ASL 图 |


### `meanings` — one row per Chinese meaning; multiple rows may point to the same sign

| 列 | 类型 | 含义 |
|---|---|---|
| `id` | INTEGER PK | 自增 |
| `sign_id` | INTEGER FK → `signs.id` | 多个 meanings 共享同一 sign_id = 它们打法相同 |
| `text` | TEXT | 具体释义（已剥离 ①②，纯词面） |
| `variant_index` | INTEGER / NULL | ① → 1，② → 2，…；无变体标记为 `NULL` |
| `order_in_entry` | INTEGER | 原词条中位置，主词 = 0，括号内依次 1/2/… |

Indexes: `idx_signs_letter`, `idx_meanings_sign`, `idx_meanings_text`.

### Three data shapes the schema is designed around

**① 多释义共享一张图** — `爱人（丈夫、妻子、媳妇）`
```
signs     id=31 source_entry=爱人（丈夫、妻子、媳妇）
meanings  (31, 爱人, NULL, 0) (31, 丈夫, NULL, 1) (31, 妻子, NULL, 2) (31, 媳妇, NULL, 3)
```

**② 同一词多种打法** — `爱国①` / `爱国②` → two `signs` rows, two images
```
signs     id=25 source_entry=爱国①         id=26 source_entry=爱国②
meanings  (25, 爱国, 1, 0)                  (26, 爱国, 2, 0)
```

**③ 变体 + 多义混合** — `结账（买单、埋单、支出①、消费①、费）`
```
signs     id=… source_entry=结账（买单、埋单、支出①、消费①、费）
meanings  (…, 结账, NULL, 0) (…, 买单, NULL, 1) (…, 埋单, NULL, 2)
          (…, 支出, 1, 3)    (…, 消费, 1, 4)    (…, 费,   NULL, 5)
```

### Core invariants (preserve in any future change)

- Every `signs` row has a real file at `image_path` and a non-empty `description`.
- Multiple `meanings` sharing the same `sign_id` ⇔ those Chinese words share one sign.
- `爱国①` vs `爱国②` = **two** `signs` rows (different images), each with one `meanings` row whose `text='爱国'` and distinct `variant_index`.
- In `sign_themed.db`: every theme name appearing in `signs.theme` (split by `|`) must exist as a row in `themes.name`. `add_theme_order.py` enforces this on write and will refuse to commit if a referenced theme is missing.

### Common queries

```sql
-- 按中文词查手势
SELECT s.image_path, s.description
FROM meanings m JOIN signs s ON s.id = m.sign_id
WHERE m.text = '妻子';

-- 查某词的所有打法
SELECT m.variant_index, s.image_path
FROM meanings m JOIN signs s ON s.id = m.sign_id
WHERE m.text = '爱国' ORDER BY m.variant_index;

-- 找共享同一手势的同义词组
SELECT group_concat(text, '、') AS synonyms, sign_id
FROM meanings GROUP BY sign_id HAVING COUNT(*) > 1;
```

## Derivative DB — `sign_themed.db`

Two additions on top of the base schema; both live in this file only.

### `signs.theme` column (TEXT, indexed)

Pipe-separated list of theme names — e.g. `"生活"` or `"身体|爱心社"`. Currently 1213 of 6699 signs tagged; 52 carry multiple themes. `add_themes.py` wrote these by exact-matching each word in `手语词库主题分类（2025.2）.docx` against `meanings.text`; hit rate was 1243/1292 tokens. No semantic fallback — unmatched words were silently skipped. The tag pass is **not rerunnable in-repo** since the docx is gone; treat the committed `sign_themed.db` as authoritative.

Multi-theme rows mean the sign matched words listed under more than one theme in the docx (e.g. a medical-related sign tagged both `身体` and `爱心社`). App-side, either pre-split on `|` or add a normalized `sign_themes` relation — a plain `JOIN themes ON themes.name = signs.theme` will not match the multi-theme rows.

### `themes` table — difficulty ordering

```
themes(name TEXT PK, difficulty_rank INTEGER UNIQUE, tier TEXT)
  -- 31 rows, rank 1..31
  -- tier ∈ {入门, 初级, 中初, 中级, 中高, 高级, 专项}
```

**This table is the single source of truth for pedagogical order.** Don't hardcode the ordering anywhere else. `add_theme_order.py` defines the `TIERS` list at the top — to reorder/rename themes, edit that list and rerun it plus `build_progression.py`. Never hand-edit the DB — it'll drift from signs.db and be painful to regenerate.

Typical signo-web consumption:

```sql
-- Words for a given tier, in progression order
SELECT t.difficulty_rank, s.theme, m.text, s.image_path
FROM signs s
JOIN themes t   ON t.name = s.theme          -- see caveat about multi-theme
JOIN meanings m ON m.sign_id = s.id
WHERE t.tier = '入门'
ORDER BY t.difficulty_rank, s.id, m.order_in_entry;
```

### `主题难度进阶.md`

Human-readable view only — do not parse it. Regenerated from the DB by `build_progression.py`; every word shown comes from `meanings.text` (not from the docx). Same-sign-different-打法 words get ①② suffixes in the output.

## English translations — `scripts/translate_en.py`

Adds English translations to `sign_themed.db` via the DeepSeek chat-completions API. Additive and backward-compatible:

- `meanings.en_text` — English translation of the Chinese word (TEXT, NULL until translated)
- `signs.en_description` — English translation of the hand-movement instructions (TEXT, NULL until translated)
- `translations` — audit table `(kind, source_id, model, status)`; `kind ∈ {'meaning','sign'}`, `source_id` = `meanings.id` or `signs.id`

**Resumable:** only rows whose target column is NULL are translated; commits per batch. Re-run to finish after an interruption. **Validated:** `is_valid_translation` rejects empty output, echoes of a CJK source, and output that is >20% CJK; rejected rows stay NULL for the next run. A batch whose array length doesn't match the input is retried, then translated one item at a time — never merged (merging shifted translations onto the wrong rows). `--redo-invalid` re-selects stored rows that fail validation (older runs stored ~550 descriptions + 80 words where the model echoed the Chinese back). API key comes from `DEEPSEEK_API_KEY` (never hardcoded). Stdlib only (`urllib`).

```bash
export DEEPSEEK_API_KEY=sk-...
python3 scripts/translate_en.py                 # both passes
python3 scripts/translate_en.py --only meanings # words only
python3 scripts/translate_en.py --only descriptions
python3 scripts/translate_en.py --redo-invalid  # also retry stored echoes / untranslated rows
```

Two distinct system prompts: one for short words (`MEANINGS_SYSTEM`), one for hand-movement instructions (`DESCRIPTIONS_SYSTEM`, which preserves `（一）/（二）` step structure and maps hand/finger terminology). The `translations` table lets you audit which rows were translated and by which model.

## Mobile app — `mobile/`

An Expo React Native app (expo-router + expo-sqlite) that bundles the full dataset for offline use.

**Data bundling (`mobile/scripts/build_data.py`):** copies `sign_themed.db` → `mobile/assets/data/dictionary.db`, copies all 6699 images → `mobile/assets/data/images/`, and generates `mobile/lib/assets.ts` — a static `require()` map from `image_path` → bundled asset. The app resolves images through this map (`SignImage` component). Generated artifacts are gitignored. The bundled DB copy drops the pipeline-only `translations` table and is VACUUMed. `assets.ts` also exports `DB_NAME = "dictionary-<sha256[:12]>.db"`, which `DatabaseGate` passes as `databaseName`. **Load-bearing:** expo-sqlite only imports the bundled asset when no DB of that name exists on the device, so a fixed name pinned every install to its first-ever copy. The content hash makes data updates reach existing installs.

**Optional ASL images:** if an `asl_images/` folder exists at the repo root, the build script also copies those into `mobile/assets/data/asl_images/`, sets `signs.asl_image_path` for signs whose `image_path` basename matches an ASL filename, and adds an `aslImageAssets` map to `assets.ts`. `SignImage` shows the ASL image (with an "ASL" badge) when `asl_image_path` is set, falling back to the CSL image otherwise.

**ASL videos (standalone tool, NOT used by the app):** `scripts/build_asl_videos.py` works with the ASL-LEX dataset (`ASL Data/`, not committed; 86 short `.webm` videos) and transcodes each to H.264 `.mp4` (iOS can't play VP8/WebM) into `build/asl_videos/`, matches each to a `sign_id` by English word, and writes `build/asl_videos.json` (sign_id → `WORD.mp4`) plus the audit log `build/asl_videos_match.log`. Matching priority: manual overrides (`MANUAL_MATCHES`) → exact `meanings.en_text` → exact CSV synonyms (`SignBankEnglishTranslations` / `DominantTranslation`) → token-boundary fuzzy (a full token of the video word must appear in an `en_text` term). Two deliberate guardrails: `en_description` is never used for matching (generic verbs cause false-positive clusters), and untranslated-Chinese `en_text` rows are skipped (their normalized form is `""`, which substring-matched everything). The app-side video integration was built then removed by user request (preference: ASL pictures, not videos) — the script stays for future use.


**App structure (`mobile/app/`):**
- `_layout.tsx` — root Stack (tabs + sign detail); Watermark + WebTopNav render before the DB opens; `DatabaseGate` wraps the Stack
- `components/DatabaseGate.tsx` — owns the DB lifecycle: loading splash, one ~1.5s auto-retry, error screen + manual Retry, web-only SharedArrayBuffer hint. Load-bearing: never remove the gate; children must stay unconditional inside `SQLiteProvider` (its memo comparator ignores children, so conditional children would freeze the Stack out on the loading→ready transition); `onInit`/`onError` must be referentially stable (reference-compared); non-suspense + `key` remount is what makes retry work — the `useSuspense` variant caches rejected init promises at module level and can never recover.
- `Home/_layout.tsx` — bottom tab bar (Search / Browse / Themes)
- `Home/index.tsx` — search by Chinese or English (`meanings.text` / `meanings.en_text`); debounced 150ms; ranked exact → prefix → whole English word → substring; LIKE wildcards escaped
- `Home/browse.tsx` — browse by letter (A–Z + #), book (pinyin) order via `s.id`
- `Home/themes.tsx` — browse by theme, grouped by difficulty tier. `signs.theme` is `|`-separated, so `getSignsByTheme` matches `('|' || theme || '|') LIKE '%|name|%'`
- Every async data effect uses a `cancelled` flag so a slow, superseded query can never overwrite newer results
- `sign/[id].tsx` — sign detail: image, Chinese + English word, hand-movement description (中/英), synonyms, other 打法 for the same word
- `db.ts` — expo-sqlite query helpers (search, by-letter, by-theme, sign detail, variants)
- `components/SignImage.tsx` — resolves `image_path` via the generated asset map
- `components/SignListItem.tsx` — reusable list row (thumbnail + word + English)

**Rebuild after data changes:**
```bash
python3 mobile/scripts/build_data.py    # re-copy DB + images + regenerate assets.ts
cd mobile && npx expo start
```

Note `mobile/metro.config.js` adds `db` to `assetExts` so the database bundles as an asset. `mobile/AGENTS.md` requires consulting the versioned Expo docs (SDK 57) before writing app code.

## Extending


- **Adding another dictionary volume** — drop the EPUB in `DictionaryBook/`, add its number to `VOLUMES` at the top of `extract_epub.py`, rerun. Section detection is auto; no other code changes if its structure matches (single-letter `<h1 class="sect1">` + `<h2 class="sect2">` entries).
- **Different book with different HTML shape** — write a new parser; do not try to generalize this one. The tight coupling to class names (`sect1`/`sect2`/`picture_figure`/`content`) is intentional.
- **New dictionary fields** — add a column to `signs` (migration = just rerun; nothing persists between runs). Keep the 3-layer mental model: raw header → signs row → multiple meanings.
- **Re-order or rename difficulty tiers** — edit `TIERS` in `scripts/add_theme_order.py`, rerun it, then `build_progression.py`. The theme table is rebuilt from scratch each run (`DROP TABLE IF EXISTS`), so it's safe to iterate.
- **New themes / retag** — requires the source docx (not in repo). Restore it, edit `add_themes.py` if the docx structure changed, rerun against a fresh copy of `signs.db` → `sign_themed.db`, then redo the two theme-order commands.

## Validation

**Primary gate: `python3 scripts/test_data.py`** — runs every data invariant in one shot, read-only, exit 1 on any failure. Covers: counts (6699 signs / 8687 meanings), no empty descriptions, no variant-glyph leakage, valid FKs + letters, theme integrity (31 / 1213 / 52), 100% English coverage (`en_text` + `en_description`), English that is actually English (`check_en_translations_valid`, same validator as `translate_en.py`), every `image_path` resolving to a real file, `asl_image_path` validity. Also runs on the base DB via `--db signs.db` (theme/en checks auto-skip). CI runs both on every push.

The manual queries below remain as reference for digging into a failure:

```bash
sqlite3 signs.db "SELECT COUNT(*) FROM signs;              -- expect 6699
SELECT COUNT(*) FROM meanings;                             -- expect 8687
SELECT COUNT(*) FROM signs WHERE description='';           -- expect 0
SELECT COUNT(*) FROM meanings WHERE text GLOB '*[①②③④⑤⑥⑦⑧⑨❶❷❸❹❺❻❼❽❾]*'; -- expect 0 (variant leakage canary)"
```

The last query is the key canary — if nonzero, either a new glyph set appeared or a new typo case needs a `HEAD_OVERRIDES` entry.

After `add_theme_order.py` (sanity-checks the themed DB):

```bash
sqlite3 sign_themed.db "
  SELECT COUNT(*) FROM themes;                         -- expect 31
  SELECT COUNT(*) FROM signs WHERE theme IS NOT NULL;  -- expect 1213
  SELECT COUNT(*) FROM signs WHERE theme LIKE '%|%';   -- expect 52 (multi-theme rows)
"
```

## Testing & CI

Three layers; layers 1–2 run in GitHub Actions (`.github/workflows/ci.yml`) on every push/PR:

1. **Data invariants (Python)** — `python3 scripts/test_data.py` (and `--db signs.db`). Stdlib only, read-only on the DBs; negative tests go on /tmp copies.
2. **Unit + component (Jest)** — `cd mobile && npm test`. SQL regression guards in `mobile/__tests__/lib/db.test.ts` pin the en_text/en_description columns to the queries (the "English disappeared" bug class). Screen tests render the real expo-router tree with mocked db/assets. Load-bearing details: `.db` imports, `lib/assets`, and `^expo-sqlite$` are stubbed via `moduleNameMapper` (both generated + gitignored — the CI job runs `build_data.py` before `tsc` since type-checking needs the real `lib/assets.ts`); the central `expoSqliteMock` runs the provider's `onInit` with a stub db — do not re-add per-file passthrough mocks that skip `onInit`, or DatabaseGate's loading→ready transition never fires; and `renderRouter` needs an **absolute** app-dir path built from `__dirname` (fixture strings resolve against `process.cwd()`, not the test file). `mobile/__tests__/helpers/mockDb.ts` is the shared `useDb` mock.
3. **E2E (Maestro, local only)** — `maestro test mobile/e2e/` against a local Release build (`npx expo run:ios --configuration Release`). Flows use ASCII input only (Chinese typed input is unreliable in Maestro) and target first rows (FlatList virtualization hides off-screen rows from the accessibility tree).

CI: `test-python` (ubuntu, python 3.13) + `test-mobile` (node 22; `npm ci` → `npx tsc --noEmit` → `npm test`, cwd `mobile`).

## EAS deployment (expo.dev)

Profiles in `mobile/eas.json` — internal distribution, no paid Apple account needed:

- `development` — dev client, iOS simulator
- `preview` — Android APK + iOS simulator app (what internal builds use)
- `production` — placeholder; needs store credentials

Key facts:

- **`eas-build-pre-install` npm hook** (`mobile/package.json`) runs `scripts/build_data.py` before EAS installs deps. The DB, images, and `lib/assets.ts` are generated + gitignored — without the hook a cloud build would silently bundle an empty dictionary. The hook fails loudly if python3 is missing.
- **No `.easignore`** — it would replace `.gitignore` handling wholesale and risk excluding `images/`/`sign_themed.db`. EAS uploads git-tracked files from the repo root; per-build upload ≈355 MB (images + DB).
- **Build from committed state** — commit everything before `eas build`.

First-time setup (user-run, needs an Expo account): `npm install -g eas-cli` → `cd mobile && eas login` → `eas init` (writes `extra.eas.projectId` into `app.json` — commit it) → `eas build --profile preview --platform android` (accept the one-time keystore prompt) / `--platform ios` → `npx eas build:run --platform ios --profile preview` installs + launches the simulator build.

## Web export (static, Cloudflare Pages)

The mobile app also builds as a fully static website — same codebase, no server, $0 hosting.

```bash
cd mobile && npm run export:web   # expo export + post_export_web.py, emits dist/
```

`post_export_web.py` is load-bearing: **Cloudflare Pages skips any directory named `node_modules` during upload**, so Metro's asset output `dist/assets/node_modules/...` (the wa-sqlite wasm the sqlite web worker fetches, plus expo-router UI icons) would silently 404 into the SPA fallback HTML and the app would render nothing. The script moves that tree to `dist/assets/vendor/` and rewrites the `/assets/node_modules/...` URLs in the exported JS. Always deploy through the npm script, never a bare `expo export`.

Deploy `dist/` to Cloudflare Pages (free tier): `npx wrangler pages deploy dist`. Two files in `mobile/public/` are copied into the output:

- `_headers` — COOP/COEP headers. Required: expo-sqlite's web build (wa-sqlite wasm, **alpha**) needs `SharedArrayBuffer`.
- `_redirects` — `/* /index.html 200` SPA fallback: deep links like `/sign/31` get the app shell at their original URL and the client router resolves the route. Real files take precedence.

Setup specifics: `metro.config.js` pushes `wasm` to `assetExts` so the sqlite worker's wasm gets a stable URL; `@expo/metro-runtime` is a direct dependency because the SSR bundler imports it. If the alpha sqlite web support misbehaves, the fallback is swapping `lib/db.ts` for a JSON-backed implementation behind the same function signatures.

**Web-only layout conventions** (keep when editing screens): every list gets explicit `style={{ flex: 1 }}` — react-native-web's default `flex: 1 1 auto` basis collapses a content-height list to a sliver inside `body{overflow:hidden}` — and each screen container uses `width: "100%", maxWidth: 640, alignSelf: "center"` so desktop shows a centered column while phones stay full-bleed. Native behavior is unaffected by both.

**Web top nav + background watermark** (keep when editing screens/layouts):

- `app/components/WebTopNav.tsx` renders only on web (`Platform.OS === "web"`) and is mounted **once in the root `app/_layout.tsx` above the Stack** — never per-screen. Both WebTopNav and Watermark sit OUTSIDE `DatabaseGate`, so the site chrome renders as soon as the JS bundle hydrates, while the web DB download is still in progress (previously the whole page was blank during the load). Its inner row uses the same 640px centered-column convention. **The nav is client-only mounted (a `mounted` state flag set in a `useEffect`) — never SSR'd into the shell, never hydrated from shell DOM.** Deep links served via the SPA fallback (e.g. `/sign/31` → root `index.html` shell) would otherwise SSR a nav highlighted for the wrong route, and React's hydration reuses the shell's `<a>` nodes, leaving the highlight permanently stuck on the shell's route. Do not remove the mounted flag. On web, the Tabs bar and per-tab headers are hidden via `tabBarStyle: { display: "none" }` + `headerShown: Platform.OS !== "web"` in `app/Home/_layout.tsx`, and the root Stack hides the `sign/[id]` header the same way. Native navigation is untouched (Maestro taps those tab buttons).
- `app/components/Watermark.tsx` is mounted once in the root layout, and `app/_layout.tsx` wraps the Stack in `ThemeProvider` (imported from `expo-router`, not `@react-navigation/*`) with `DefaultTheme.colors.background: "transparent"` so the watermark shows through the navigator cards. Therefore **screen surfaces must stay translucent — never set an opaque `#fff` on a screen container or list row (use `rgba(255,255,255,0.9)`)**; opaque surfaces locally hide the watermark. Headers + tab bar read `colors.card` and stay white automatically. The asset is `mobile/assets/watermark.png` (500x500, currently a placeholder the user will replace — overwrite the file, no code changes).
- **`enableScreens(true)` on web is load-bearing** (`app/_layout.tsx`, gated to `Platform.OS === "web"`). react-native-screens reports `screensEnabled() === false` on web, which makes react-navigation's tab fallback render inactive scenes as plain always-visible Views — with translucent surfaces, every visited tab stays visible under the active one ("ghost" content). Enabling screens makes the web `Screen` honor `activityState` and hide inactive scenes with `display:none`. Do not remove that call.
