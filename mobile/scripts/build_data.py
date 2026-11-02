#!/usr/bin/env python3
"""Bundle the dictionary data + images into the Expo app for offline use.

Reads the (translated) sign_themed.db and:
  1. Copies the SQLite DB into mobile/assets/data/dictionary.db
  2. Copies all sign images into mobile/assets/data/images/
  3. Copies any ASL images from <repo>/asl_images/ into
     mobile/assets/data/asl_images/ and populates signs.asl_image_path for
     matching signs (matched by the sign's image_path basename).
  4. Generates mobile/lib/assets.ts — a static require() map so the app can
     resolve each image_path / asl_image_path to a bundled asset at runtime,
     plus DB_NAME: a content-hashed on-device database name. expo-sqlite only
     copies the bundled asset when no DB of that name exists yet, so a fixed
     name would pin every existing install to its first-ever copy; a new
     hash makes data updates actually reach users.

Run from the repo root:

    python3 mobile/scripts/build_data.py [--db sign_themed.db]

Stdlib only.
"""
import argparse
import hashlib
import os
import shutil
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MOBILE = os.path.join(ROOT, "mobile")
DATA_DIR = os.path.join(MOBILE, "assets", "data")
IMG_DST = os.path.join(DATA_DIR, "images")
ASL_SRC = os.path.join(ROOT, "asl_images")
ASL_DST = os.path.join(DATA_DIR, "asl_images")
DB_DST = os.path.join(DATA_DIR, "dictionary.db")
ASSETS_TS = os.path.join(MOBILE, "lib", "assets.ts")


def _stale(src, dst):
    """True if dst is missing or differs from src (size or mtime)."""
    if not os.path.exists(dst):
        return True
    a, b = os.stat(src), os.stat(dst)
    return a.st_size != b.st_size or int(a.st_mtime) != int(b.st_mtime)


def _prune(directory, keep):
    """Delete files in directory that are no longer referenced."""
    removed = 0
    for fname in os.listdir(directory):
        path = os.path.join(directory, fname)
        if fname not in keep and os.path.isfile(path):
            os.remove(path)
            removed += 1
    if removed:
        print(f"removed {removed} stale files from {os.path.relpath(directory, MOBILE)}")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.path.join(ROOT, "sign_themed.db"),
        help="Source SQLite DB (default: sign_themed.db)",
    )
    args = parser.parse_args()

    os.makedirs(IMG_DST, exist_ok=True)

    # 1. Copy the DB.
    shutil.copy2(args.db, DB_DST)
    print(f"copied DB -> {os.path.relpath(DB_DST, MOBILE)}")

    # 1b. Ensure the English-translation + ASL image columns exist on the bundled
    # DB so the app's queries never fail, even if translate_en.py hasn't been run
    # yet. (Columns stay NULL until translations / ASL images are added.)
    con = sqlite3.connect(DB_DST)
    cur = con.cursor()
    sign_cols = {r[1] for r in cur.execute("PRAGMA table_info(signs)")}
    if "en_description" not in sign_cols:
        cur.execute("ALTER TABLE signs ADD COLUMN en_description TEXT")
    if "asl_image_path" not in sign_cols:
        cur.execute("ALTER TABLE signs ADD COLUMN asl_image_path TEXT")
    meaning_cols = {r[1] for r in cur.execute("PRAGMA table_info(meanings)")}
    if "en_text" not in meaning_cols:
        cur.execute("ALTER TABLE meanings ADD COLUMN en_text TEXT")
    con.commit()
    con.close()
    print("ensured en_description / en_text / asl_image_path columns on bundled DB")

    # 2. Copy images referenced by signs.
    con = sqlite3.connect(args.db)
    rows = con.execute("SELECT image_path FROM signs").fetchall()
    con.close()
    copied = 0
    missing = 0
    for (rel_path,) in rows:
        src = os.path.join(ROOT, rel_path)
        if not os.path.exists(src):
            missing += 1
            continue
        dst = os.path.join(IMG_DST, os.path.basename(rel_path))
        if _stale(src, dst):
            shutil.copy2(src, dst)
        copied += 1
    print(f"copied {copied} images -> {os.path.relpath(IMG_DST, MOBILE)}")
    _prune(IMG_DST, {os.path.basename(r) for (r,) in rows})
    if missing:
        print(f"WARNING: {missing} image_paths missing from source")

    # 2b. Copy ASL images (if any) and populate signs.asl_image_path.
    # ASL images live in <repo>/asl_images/ and are matched to a sign by the
    # sign's image_path basename (e.g. asl_images/v1_txt005_2.jpg matches a sign
    # whose image_path is images/v1_txt005_2.jpg).
    asl_matches = {}  # basename -> "asl_images/<basename>"
    if os.path.isdir(ASL_SRC):
        os.makedirs(ASL_DST, exist_ok=True)
        asl_copied = 0
        for fname in sorted(os.listdir(ASL_SRC)):
            src = os.path.join(ASL_SRC, fname)
            if not os.path.isfile(src):
                continue
            dst = os.path.join(ASL_DST, fname)
            if _stale(src, dst):
                shutil.copy2(src, dst)
            asl_matches[fname] = f"asl_images/{fname}"
            asl_copied += 1
        print(f"copied {asl_copied} ASL images -> {os.path.relpath(ASL_DST, MOBILE)}")
        _prune(ASL_DST, set(asl_matches))

        # Populate asl_image_path on the bundled DB for matching signs.
        con = sqlite3.connect(DB_DST)
        cur = con.cursor()
        updated = 0
        for (rel_path,) in rows:
            base = os.path.basename(rel_path)
            if base in asl_matches:
                cur.execute(
                    "UPDATE signs SET asl_image_path=? WHERE image_path=?",
                    (asl_matches[base], rel_path),
                )
                updated += 1
        con.commit()
        con.close()
        print(f"linked {updated} signs to ASL images")
    else:
        print(f"no ASL images found (looked in {os.path.relpath(ASL_SRC, ROOT)}/)")

    # 2c. Slim the bundled copy: the translations audit table is pipeline-only
    # (the app never reads it), and VACUUM drops free pages. On web this file
    # is downloaded at startup, so every byte counts.
    con = sqlite3.connect(DB_DST)
    con.execute("DROP TABLE IF EXISTS translations")
    con.commit()
    con.execute("VACUUM")
    con.close()
    db_hash = _sha256(DB_DST)[:12]
    db_name = f"dictionary-{db_hash}.db"
    print(f"bundled DB {os.path.getsize(DB_DST) / 1e6:.1f} MB, on-device name {db_name}")

    # 3. Generate the static require() map.
    lines = [
        "// AUTO-GENERATED by mobile/scripts/build_data.py — do not edit by hand.",
        "",
        "// On-device database name, versioned by content hash. A new name makes",
        "// expo-sqlite import the bundled asset again instead of reusing an older",
        "// cached copy.",
        f'export const DB_NAME = "{db_name}";',
        "",
        "// Maps each sign image_path to its bundled asset module.",
        "export const imageAssets: Record<string, number> = {",
    ]
    for (rel_path,) in rows:
        base = os.path.basename(rel_path)
        # require() needs a literal path relative to this file (lib/assets.ts).
        lines.append(f'  "{rel_path}": require("../assets/data/images/{base}"),')

    lines.append("};")
    lines.append("")
    lines.append(
        "// Maps each ASL image path to its bundled asset module (empty until "
        "ASL images are added to asl_images/)."
    )
    lines.append("export const aslImageAssets: Record<string, number> = {")
    for base in sorted(asl_matches):
        lines.append(
            f'  "asl_images/{base}": require("../assets/data/asl_images/{base}"),'
        )
    lines.append("};")
    with open(ASSETS_TS, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"generated {os.path.relpath(ASSETS_TS, MOBILE)} ({len(rows)} entries)")


if __name__ == "__main__":
    main()
