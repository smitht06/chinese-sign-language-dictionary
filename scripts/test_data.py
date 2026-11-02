#!/usr/bin/env python3
"""Data-invariant test suite for the dictionary SQLite DBs (stdlib only).

Checks the invariants documented in CLAUDE.md ("Validation after any parser
change") plus translation coverage and on-disk image existence. Read-only:
the DB is opened with mode=ro. Exit code 0 = all checks passed, 1 = failures.

Run from anywhere (resolves the repo root from its own path):

    python3 scripts/test_data.py                  # sign_themed.db (default)
    python3 scripts/test_data.py --db signs.db    # base DB (theme/en checks skip)
"""
import argparse
import os
import sqlite3
import sys

# Same validator the translation pipeline applies before storing a row.
from translate_en import is_valid_translation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Expected counts from CLAUDE.md. These are the pipeline's contract.
EXPECTED_SIGNS = 6699
EXPECTED_MEANINGS = 8687
EXPECTED_THEMES = 31
EXPECTED_THEMED = 1213
EXPECTED_MULTI_THEME = 52

# Both circled-digit glyph sets from the source EPUBs (canary: none may leak
# into meanings.text after parsing).
VARIANT_GLYPHS = "①②③④⑤⑥⑦⑧⑨❶❷❸❹❺❻❼❽❾"

# Valid letter sections: A-Z minus I/U/V (no pinyin words start with them),
# plus '#' for the 其他 section.
LETTERS = set("ABCDEFGHJKLMNOPQRSTWXYZ") | {"#"}


def _connect(path):
    return sqlite3.connect(f"file:{os.path.abspath(path)}?mode=ro", uri=True)


def _table_exists(cur, name):
    return (
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
        is not None
    )


def _column_exists(cur, table, col):
    return any(r[1] == col for r in cur.execute(f"PRAGMA table_info({table})"))


# --- checks: each returns (name, ok, detail) -------------------------------

def check_sign_count(db):
    n = db.execute("SELECT COUNT(*) FROM signs").fetchone()[0]
    return ("sign count", n == EXPECTED_SIGNS, f"got {n}, expected {EXPECTED_SIGNS}")


def check_meaning_count(db):
    n = db.execute("SELECT COUNT(*) FROM meanings").fetchone()[0]
    return ("meaning count", n == EXPECTED_MEANINGS, f"got {n}, expected {EXPECTED_MEANINGS}")


def check_empty_descriptions(db):
    n = db.execute(
        "SELECT COUNT(*) FROM signs WHERE description IS NULL OR description = ''"
    ).fetchone()[0]
    return ("no empty descriptions", n == 0, f"{n} signs have empty descriptions")


def check_variant_leakage(db):
    n = db.execute(
        f"SELECT COUNT(*) FROM meanings WHERE text GLOB '*[{VARIANT_GLYPHS}]*'"
    ).fetchone()[0]
    return ("no variant-glyph leakage", n == 0, f"{n} meanings still contain circled digits")


def check_meaning_refs_valid(db):
    n = db.execute(
        "SELECT COUNT(*) FROM meanings m LEFT JOIN signs s ON s.id = m.sign_id "
        "WHERE s.id IS NULL"
    ).fetchone()[0]
    return ("meaning FK refs valid", n == 0, f"{n} meanings point at missing signs")


def check_letters_valid(db):
    bad = [
        r[0]
        for r in db.execute("SELECT DISTINCT letter FROM signs")
        if r[0] not in LETTERS
    ]
    return ("letter values valid", not bad, f"unexpected letters: {bad[:10]}")


def check_themes(db):
    cur = db.cursor()
    if not _table_exists(cur, "themes"):
        return ("theme table", True, "skipped (no themes table)")
    if not _column_exists(cur, "signs", "theme"):
        return ("theme table", True, "skipped (no signs.theme column)")
    n_themes = cur.execute("SELECT COUNT(*) FROM themes").fetchone()[0]
    n_themed = cur.execute(
        "SELECT COUNT(*) FROM signs WHERE theme IS NOT NULL"
    ).fetchone()[0]
    n_multi = cur.execute(
        "SELECT COUNT(*) FROM signs WHERE theme LIKE '%|%'"
    ).fetchone()[0]
    if (n_themes, n_themed, n_multi) != (
        EXPECTED_THEMES,
        EXPECTED_THEMED,
        EXPECTED_MULTI_THEME,
    ):
        return (
            "theme counts",
            False,
            f"themes={n_themes} (want {EXPECTED_THEMES}), "
            f"themed={n_themed} (want {EXPECTED_THEMED}), "
            f"multi={n_multi} (want {EXPECTED_MULTI_THEME})",
        )
    theme_names = {r[0] for r in cur.execute("SELECT name FROM themes")}
    missing = sorted(
        {
            name
            for (theme,) in cur.execute(
                "SELECT theme FROM signs WHERE theme IS NOT NULL"
            )
            for name in theme.split("|")
            if name not in theme_names
        }
    )
    return (
        "theme names referenced exist",
        not missing,
        f"themes used in signs.theme but absent from themes: {missing[:10]}",
    )


def check_en_text_coverage(db):
    cur = db.cursor()
    if not _column_exists(cur, "meanings", "en_text"):
        return ("meanings.en_text coverage", True, "skipped (no en_text column)")
    n = cur.execute(
        "SELECT COUNT(*) FROM meanings WHERE en_text IS NULL OR en_text = ''"
    ).fetchone()[0]
    return ("meanings.en_text coverage", n == 0, f"{n} meanings untranslated")


def check_en_description_coverage(db):
    cur = db.cursor()
    if not _column_exists(cur, "signs", "en_description"):
        return ("signs.en_description coverage", True, "skipped (no en_description column)")
    n = cur.execute(
        "SELECT COUNT(*) FROM signs WHERE en_description IS NULL OR en_description = ''"
    ).fetchone()[0]
    return ("signs.en_description coverage", n == 0, f"{n} signs untranslated")


def check_en_translations_valid(db):
    """English must actually be English: catches the model echoing the Chinese
    back (stored as "translated" by older pipeline runs, so the NULL-coverage
    checks above still pass). Fix with: translate_en.py --redo-invalid."""
    cur = db.cursor()
    if not _column_exists(cur, "meanings", "en_text") or not _column_exists(
        cur, "signs", "en_description"
    ):
        return ("English translations valid", True, "skipped (no English columns)")
    bad_m = [
        src
        for src, en in cur.execute(
            "SELECT text, en_text FROM meanings WHERE en_text IS NOT NULL"
        )
        if not is_valid_translation(src, en)
    ]
    bad_s = sum(
        1
        for src, en in cur.execute(
            "SELECT description, en_description FROM signs "
            "WHERE en_description IS NOT NULL"
        )
        if not is_valid_translation(src, en)
    )
    return (
        "English translations valid",
        not bad_m and not bad_s,
        f"{len(bad_m)} meanings + {bad_s} descriptions are untranslated Chinese "
        f"(e.g. {bad_m[:5]}); run translate_en.py --redo-invalid",
    )


def check_image_files_exist(db):
    rows = [r[0] for r in db.execute("SELECT image_path FROM signs")]
    missing = [p for p in rows if not os.path.isfile(os.path.join(ROOT, p))]
    detail = f"{len(missing)} image files missing: {missing[:10]}"
    return ("image files exist", not missing, detail if missing else f"{len(rows)} checked")


def check_asl_paths_valid(db):
    cur = db.cursor()
    if not _column_exists(cur, "signs", "asl_image_path"):
        return ("asl_image_path values valid", True, "skipped (no asl_image_path column)")
    rows = [
        r[0]
        for r in cur.execute(
            "SELECT asl_image_path FROM signs WHERE asl_image_path IS NOT NULL"
        )
    ]
    bad = [
        p
        for p in rows
        if not p.startswith("asl_images/") or not os.path.isfile(os.path.join(ROOT, p))
    ]
    return (
        "asl_image_path values valid",
        not bad,
        f"{len(bad)} stale/malformed ASL paths: {bad[:5]}" if bad else f"{len(rows)} set",
    )


CHECKS = [
    check_sign_count,
    check_meaning_count,
    check_empty_descriptions,
    check_variant_leakage,
    check_meaning_refs_valid,
    check_letters_valid,
    check_themes,
    check_en_text_coverage,
    check_en_description_coverage,
    check_en_translations_valid,
    check_image_files_exist,
    check_asl_paths_valid,
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.path.join(ROOT, "sign_themed.db"),
        help="SQLite DB to test (default: sign_themed.db)",
    )
    args = parser.parse_args()

    db = _connect(args.db)
    passed = 0
    failed = 0
    for check in CHECKS:
        try:
            name, ok, detail = check(db)
        except Exception as exc:  # noqa: BLE001 — a broken check must fail loudly
            name, ok, detail = check.__name__, False, f"check crashed: {exc}"
        suffix = f" — {detail}" if detail and (not ok or detail.startswith("skipped")) else ""
        print(f"{'PASS' if ok else 'FAIL'}  {name}{suffix}")
        if ok:
            passed += 1
        else:
            failed += 1
    db.close()

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
