# Sign Language Dictionary — Mobile App

Offline Expo (SDK 57) React Native app: search / browse / themes / sign detail, backed by a bundled SQLite database (6699 signs + English translations + all images).

## Development

```bash
npm install
python3 scripts/build_data.py   # re-copy DB + images + regenerate lib/assets.ts (rerun after any data change)
npx expo start
```

The app copies the bundled DB to local storage on **first launch only** — after a data change, reinstall the app (uninstall first, or use a fresh simulator) to pick it up.

## Testing

```bash
npm test            # Jest: 5 suites (lib SQL guards, components, router screen tests)
npm run test:watch  # watch mode
npx tsc --noEmit    # type check
```

Notes on the setup (load-bearing, don't "clean up"):

- `.db` imports and `lib/assets` are stubbed via `moduleNameMapper` — `lib/assets.ts`, `assets/data/`, and `.expo/` are generated + gitignored, and tests must pass on fresh clones. `__tests__/__mocks__/` holds the stubs.
- `npx tsc --noEmit` needs the generated files — run `python3 scripts/build_data.py` first (CI does this before the tsc step).
- `renderRouter` fixture paths resolve against `process.cwd()`, not the test file — the screen tests pass an absolute path built from `__dirname`.
- `transformIgnorePatterns` includes `standard-navigation` (SDK 57's native-tabs package ships untranspiled ESM); the docs' older pattern omits it.
- `react-test-renderer` 19 is a deprecated-but-required peer for React 19 under jest-expo 57 — the deprecation warning is expected, don't remove it.

### E2E (Maestro)

```bash
# once: brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro
# Maestro needs a JRE (17+); on macOS without one: brew install openjdk@17 and
# export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
npx expo run:ios --configuration Release   # local Release build (gitignored ios/ works, no EAS account)
maestro test e2e/                          # run all flows (search / browse / themes)
```

Flows assume `appId: com.example.signlang`, launch with `clearState` (so first-launch DB copy is exercised), use ASCII input only (Chinese typed input is unreliable in Maestro), and target first rows (FlatList virtualization hides off-screen rows). Selector gotchas baked into the flows: list rows merge their texts into one accessibility element ("柏树, cypress tree, B"), tab buttons expose combined labels ("Browse, tab, 2 of 3"), the keyboard overlay counts as "visible" for scrollUntilVisible (use `centerElement` before tapping rows), and iOS text nodes appear twice in the tree (asserts use `index: 0`).

## Static web export (Cloudflare Pages)

```bash
npm run export:web                        # expo export + post_export_web.py, emits dist/
npx wrangler pages deploy dist --branch=main
```

Always deploy through `npm run export:web`, never a bare `expo export` — the post-export script relocates the sqlite wasm out of `dist/assets/node_modules/` (Cloudflare skips directories named `node_modules` during upload). `public/_headers` (COOP/COEP for SharedArrayBuffer) and `public/_redirects` (SPA fallback) are copied into `dist/` automatically.

### Watermark

The background watermark shown on every screen is a single PNG asset — no code changes needed to swap it:

1. Overwrite `assets/watermark.png` with your image (keep the filename).
2. Rebuild and redeploy the web export (above). The image is copied into `dist/` with a content-hash filename, so a fresh export is required to pick up a new file.
3. Native picks it up automatically on the next `npx expo start` / `eas build` (Metro bundles the `require()` directly — `build_data.py` doesn't touch it).

Sizing: `app/components/Watermark.tsx` renders it in a **square box** (`aspectRatio: 1`, 60% viewport width, max 500px) at `opacity: 0.5` with `resizeMode="contain"` — a non-square image gets letterboxed inside the square, so either pad your PNG to a square canvas or adjust the `aspectRatio`/`height` in that style block. Opacity and size are tunable in the same place.

## Deployment via EAS (expo.dev)

Profiles in `eas.json`:

| Profile | Purpose |
| --- | --- |
| `development` | dev client, iOS simulator |
| `preview` | internal distribution — Android APK + iOS simulator app |
| `production` | placeholder — needs store credentials |

First-time setup:

```bash
npm install --global eas-cli
eas login && eas whoami
eas init                    # creates the EAS project; commit the extra.eas.projectId it writes into app.json
```

Builds:

```bash
eas build --profile preview --platform android   # APK (accept the one-time keystore prompt)
eas build --profile preview --platform ios       # simulator .app, no signing needed
npx eas build:run --platform ios --profile preview   # install + launch on a booted simulator
```

Checklist before building:

1. **Commit everything** — EAS builds from committed git state.
2. The `eas-build-pre-install` hook runs `scripts/build_data.py` on the build machine (it needs `python3`); build logs should show "copied DB / copied N images" before `npm install`.
3. No `.easignore` — EAS honors `.gitignore`; `images/` + the DBs are tracked on purpose (≈355 MB upload per build).
