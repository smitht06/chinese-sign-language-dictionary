#!/usr/bin/env python3
"""Post-process `expo export --platform web` output for Cloudflare Pages.

Cloudflare Pages refuses to upload any directory named `node_modules`, so
Metro's asset output `dist/assets/node_modules/...` — the wa-sqlite wasm the
sqlite web worker needs, plus expo-router UI icons — never reaches the
deployment. Every request for those files falls through to the SPA fallback
HTML, which breaks the sqlite worker ("Incorrect response MIME type").

This script moves that tree to `dist/assets/vendor/` and rewrites the
corresponding `/assets/node_modules/...` URLs inside the exported bundles.
Run it after every export — `npm run export:web` does both. Stdlib only.
"""
import shutil
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
SRC = DIST / "assets" / "node_modules"
DST = DIST / "assets" / "vendor"

# Only rewrite inside text files; asset binaries move with the directory.
TEXT_SUFFIXES = {".js", ".css", ".html", ".json", ".map", ".mjs"}

OLD, NEW = b"/assets/node_modules/", b"/assets/vendor/"


def main() -> int:
    if not SRC.is_dir():
        print(
            f"error: {SRC} not found — run `expo export --platform web` first",
            file=sys.stderr,
        )
        return 1

    if DST.exists():
        shutil.rmtree(DST)
    shutil.move(str(SRC), str(DST))

    rewritten = 0
    for path in DIST.rglob("*"):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        data = path.read_bytes()
        if OLD in data:
            path.write_bytes(data.replace(OLD, NEW))
            rewritten += 1

    print(f"moved assets/node_modules -> assets/vendor; rewrote refs in {rewritten} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
