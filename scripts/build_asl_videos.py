#!/usr/bin/env python3
"""Prepare ASL-LEX videos for the mobile app.

Reads the ASL-LEX dataset (ASL Data/) and:
  1. Transcodes each .webm video to H.264 .mp4 (iOS can't play VP8/Vorbis/WebM).
  2. Fuzzy-matches each video to signs in sign_themed.db by English word.
  3. Writes asl_videos.json mapping sign_id -> video filename, plus a
     human-readable match log for auditing coverage.

Matching strategy (priority order):
  1. Manual overrides (MANUAL_MATCHES) — for words string-matching can't
     resolve correctly, in either direction.
  2. Exact match on meanings.en_text (case-insensitive).
  3. Match against the CSV's SignBankEnglishTranslations synonyms and
     DominantTranslation.
  4. Fuzzy match — token-boundary containment: a full token of the video word
     must appear as a full token of a sign's en_text term (e.g. CURL matches
     "curl up"; CIGAR does NOT match "cigarette"). Substring containment and
     Jaccard overlap are deliberately not used — they produce false-positive
     clusters. en_description is excluded — its generic hand-movement verbs
     cause false-positive fuzzy matches.


Run from the repo root:

    python3 scripts/build_asl_videos.py [--db sign_themed.db]

Requires ffmpeg on PATH. Stdlib only otherwise.
"""
import argparse
import csv
import json
import os
import re
import sqlite3
import subprocess
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASL_DIR = os.path.join(ROOT, "ASL Data")
VIDEO_SRC = os.path.join(ASL_DIR, "ASL examples")
CSV_PATH = os.path.join(ASL_DIR, "Data Files", "signdata.csv")
STAGE_DIR = os.path.join(ROOT, "build", "asl_videos")  # transcoded .mp4
OUT_JSON = os.path.join(ROOT, "build", "asl_videos.json")
OUT_LOG = os.path.join(ROOT, "build", "asl_videos_match.log")

# Stop-words that add no signal when matching English terms.
STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "at",
    "by",
    "from",
    "as",
    "is",
    "are",
    "be",
    "it",
    "this",
    "that",
}

# Manual overrides for video words the automatic passes can't resolve
# correctly. Value = sign_id to force a match, or None to force NO MATCH.
# Re-review these if the en_text translations or the video set change.
MANUAL_MATCHES = {
    # couch ~= sofa (沙发) — synonyms with no shared spelling.
    "COUCH_1": 4353,
    # "emphasis" token-matches 着重号 ("emphasis mark") — but that sign is the
    # punctuation mark, not the concept of emphasis. Different signs.
    "EMPHASIS": None,
}


def normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> set:
    """Tokens usable for fuzzy matching: pure 3+ letter words, no digits.

    Excludes digits ("1" from CHEERLEADER_1) and 1-2 letter fragments, which
    add noise without signal.
    """
    return {
        t
        for t in normalize(text).split()
        if t not in STOPWORDS and re.fullmatch(r"[a-z]{3,}", t)
    }


def load_csv_rows():
    """Load signdata.csv (latin-1) keyed by lowercase EntryID."""
    if not os.path.exists(CSV_PATH):
        print(f"WARNING: {CSV_PATH} not found; continuing without CSV synonyms")
        return {}
    with open(CSV_PATH, encoding="latin-1") as f:
        reader = csv.DictReader(f)
        by_id = {}
        for row in reader:
            eid = row.get("EntryID", "").strip().lower()
            if not eid:
                continue
            by_id.setdefault(eid, []).append(row)
        return by_id


def transcode_videos():
    """Transcode all .webm videos to H.264 .mp4 in STAGE_DIR. Returns {word: mp4}."""
    if not os.path.isdir(VIDEO_SRC):
        print(f"ERROR: video source dir not found: {VIDEO_SRC}")
        sys.exit(1)
    os.makedirs(STAGE_DIR, exist_ok=True)
    result = {}
    for fname in sorted(os.listdir(VIDEO_SRC)):
        if not fname.lower().endswith(".webm"):
            continue
        word = os.path.splitext(fname)[0]
        mp4 = os.path.join(STAGE_DIR, f"{word}.mp4")
        if not os.path.exists(mp4):
            src = os.path.join(VIDEO_SRC, fname)
            # H.264 + AAC, yuv420p for broad device support, faststart for streaming.
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                src,
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                "-preset",
                "veryfast",
                "-crf",
                "28",
                mp4,
            ]
            print(f"  transcoding {fname} -> {word}.mp4")
            subprocess.run(cmd, check=True, capture_output=True)
        result[word] = mp4
    return result


def load_signs(db_path):
    """Load all signs + their English word translations from the DB.

    Only `meanings.en_text` is used for matching. `en_description` (hand-movement
    instructions) is deliberately excluded: it contains generic verbs like
    "move"/"represent"/"swing" that cause false-positive fuzzy matches.
    """
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    meanings = con.execute(
        "SELECT sign_id, en_text FROM meanings WHERE en_text IS NOT NULL"
    ).fetchall()
    con.close()

    # sign_id -> list of english word translations.
    # Skip en_text with no ASCII letters — those are untranslated Chinese rows
    # (e.g. 搁置); their normalized form is the empty string, which previously
    # substring-matched every video word.
    sign_terms = {}
    for m in meanings:
        if not re.search(r"[a-zA-Z]", m["en_text"]):
            continue
        sign_terms.setdefault(m["sign_id"], []).append(m["en_text"])
    return sign_terms


def match_video(word, sign_terms, csv_rows):
    """Return (sign_id, method) for a video word, or (None, None)."""
    word_norm = normalize(word)
    word_tokens = tokenize(word)

    # Pass 0: manual overrides
    if word in MANUAL_MATCHES:
        sid = MANUAL_MATCHES[word]
        return (sid, "manual") if sid is not None else (None, None)

    # Gather candidate English terms from the CSV row for this video.
    csv_terms = []
    for row in csv_rows.get(word.lower(), []):
        for col in ("SignBankEnglishTranslations", "DominantTranslation"):
            val = row.get(col, "")
            if val:
                csv_terms.extend(t.strip() for t in val.split(",") if t.strip())
    csv_terms = [t for t in csv_terms if t]

    # Pass 1: exact en_text match
    for sign_id, terms in sign_terms.items():
        for term in terms:
            if normalize(term) == word_norm:
                return sign_id, "exact"

    # Pass 2: CSV synonym exact match
    if csv_terms:
        for sign_id, terms in sign_terms.items():
            for term in terms:
                t_norm = normalize(term)
                if any(normalize(c) == t_norm for c in csv_terms):
                    return sign_id, "csv-synonym"

    # Pass 3: fuzzy — the video word must share a full token with one of the
    # sign's English terms (token-boundary containment, e.g. CURL matches
    # "curl up"). Substring containment is intentionally NOT used: it wrongly
    # matches "cigar" ⊂ "cigarette" and "pop" ⊂ "popcorn".
    for sign_id, terms in sign_terms.items():
        if any(word_tokens & tokenize(t) for t in terms):
            return sign_id, "fuzzy"
    return None, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.path.join(ROOT, "sign_themed.db"),
        help="Source SQLite DB (default: sign_themed.db)",
    )
    args = parser.parse_args()

    print("Loading CSV metadata...")
    csv_rows = load_csv_rows()

    print("Transcoding videos...")
    videos = transcode_videos()

    print("Loading signs from DB...")
    sign_terms = load_signs(args.db)

    print("Matching videos to signs...")
    matches = {}  # sign_id -> video word
    log_lines = []
    matched_count = 0
    for word in sorted(videos):
        sign_id, method = match_video(word, sign_terms, csv_rows)
        if sign_id is not None:
            matches[sign_id] = word
            matched_count += 1
            log_lines.append(f"{word:20s} -> sign {sign_id:5d}  [{method}]")
        else:
            log_lines.append(f"{word:20s} -> NO MATCH")

    # Write match log
    with open(OUT_LOG, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n")
    print(f"matched {matched_count} / {len(videos)} videos")
    print(f"match log -> {os.path.relpath(OUT_LOG, ROOT)}")

    # Write JSON mapping sign_id -> video filename
    out = {str(sid): f"{word}.mp4" for sid, word in matches.items()}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, sort_keys=True)
    print(f"wrote {len(out)} matches -> {os.path.relpath(OUT_JSON, ROOT)}")


if __name__ == "__main__":
    main()
