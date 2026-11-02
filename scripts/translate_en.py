#!/usr/bin/env python3
"""Translate Chinese sign-language dictionary content to English via the DeepSeek API.

Adds English translations to a copy of the dictionary DB:
  - meanings.en_text        : English translation of the Chinese word
  - signs.en_description    : English translation of the hand-movement instructions
  - translations            : audit table (row kind, source id, model, status)

The script is resumable: it only translates rows whose target column is NULL,
and commits per batch, so an interrupted run can be re-run to finish the rest.

Outputs are validated before being stored: an empty string, an echo of the
Chinese input, or text that is still mostly CJK is rejected and the row is
left NULL for the next run. `--redo-invalid` also re-selects rows stored by
older runs that fail that validation (e.g. the model echoed the Chinese back).

Usage:
    export DEEPSEEK_API_KEY=sk-...
    python3 scripts/translate_en.py [--db sign_themed.db] [--model deepseek-chat]
                                    [--batch 20] [--only meanings|descriptions]
                                    [--redo-invalid]

Stdlib only (urllib). No external dependencies.
"""
import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request

API_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = "deepseek-chat"

# System prompts tuned for the two translation passes.
MEANINGS_SYSTEM = (
    "You are translating entries from a Chinese Sign Language dictionary into English. "
    "Each input is a Chinese word or a parenthesized group of Chinese words. "
    "Translate each word to its natural English equivalent. "
    "Return ONLY a JSON array of strings, one per input item, in the same order. "
    "Do not add explanations, numbering, or markdown."
)

DESCRIPTIONS_SYSTEM = (
    "You are translating hand-movement instructions from a Chinese Sign Language "
    "dictionary into English. The text describes how to perform a sign with the hands. "
    "Preserve the step structure: lines beginning with （一）/（二） should become "
    "numbered steps (1)/(2). Keep hand-movement terminology natural and clear "
    "(e.g. 手=hand, 指=finger, 拇指=thumb, 食指=index finger, 中指=middle finger, "
    "掌心=palm, 手背=back of hand, 握拳=make a fist, 张开=spread, 弯曲=bend). "
    "If the text contains a parenthetical note like （此为国外聋人手语）, translate it "
    "as (this is foreign deaf sign language). "
    "CRITICAL: The input is a JSON array. Return a JSON array with EXACTLY the same "
    "number of strings as input items, in the same order. Each input item is ONE "
    "complete description — keep all of its steps together in ONE string, separated "
    "by newlines. Do NOT split a single item into multiple array elements. "
    "Do NOT echo the input back. Return ONLY the JSON array, no explanations or markdown."
)


def get_api_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise SystemExit(
            "DEEPSEEK_API_KEY environment variable is not set. "
            "Export it before running, e.g. `export DEEPSEEK_API_KEY=sk-...`"
        )
    return key


def call_deepseek(api_key: str, model: str, system: str, items: list[str]) -> list[str]:
    """Translate a batch of items. Returns a list of translations aligned to `items`.

    Any length mismatch raises ValueError (retried by retry_call). Extra
    elements are NOT merged back: there is no way to know which input item the
    model split, and appending them to the last item silently shifted every
    later translation onto the wrong row.
    """
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    # DeepSeek may wrap the JSON array in an object; try to extract an array.
    parsed = json.loads(content)
    if isinstance(parsed, dict):
        # Some models return {"translations": [...]} or {"result": [...]}
        for key in ("translations", "result", "items", "data"):
            if key in parsed and isinstance(parsed[key], list):
                parsed = parsed[key]
                break
    if not isinstance(parsed, list):
        raise ValueError(f"Unexpected response shape: {content[:200]}")
    if len(parsed) != len(items):
        raise ValueError(
            f"Expected {len(items)} translations, got {len(parsed)}: {content[:200]}"
        )
    return [str(x).strip() for x in parsed]


CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


def is_valid_translation(source: str, en: str) -> bool:
    """Reject empty output, echoes of the source, and still-mostly-CJK text.

    Echo check applies only to CJK sources: ASCII entries from the 其他
    section (3D, KTV, QQ, 100…) legitimately translate to themselves.
    A few CJK chars are tolerated (descriptions may quote a character being
    traced, e.g. 书空“人”字), but >20% of non-space chars means untranslated.
    """
    en = en.strip()
    if not en:
        return False
    if en == source.strip() and CJK.search(source):
        return False
    chars = [c for c in en if not c.isspace()]
    cjk = sum(1 for c in chars if CJK.match(c))
    return cjk / len(chars) <= 0.2


def translate_batch(api_key, model, system, texts):
    """Translate a batch; on persistent failure fall back to one item per call.

    Returns a list aligned to `texts`, with None for items that could not be
    translated (left NULL in the DB so a later run retries them).
    """
    try:
        return retry_call(api_key, model, system, texts)
    except Exception as e:  # noqa: BLE001
        if len(texts) == 1:
            print(f"  item failed: {e}", file=sys.stderr)
            return [None]
        print(f"  batch failed ({e}); retrying items one by one", file=sys.stderr)
    out = []
    for t in texts:
        try:
            out.append(retry_call(api_key, model, system, [t], max_retries=3)[0])
        except Exception as e:  # noqa: BLE001
            print(f"  item failed: {e}", file=sys.stderr)
            out.append(None)
    return out


def retry_call(api_key, model, system, items, max_retries=5):
    """Call DeepSeek with exponential backoff on rate-limit / transient errors."""
    delay = 2.0
    for attempt in range(max_retries):
        try:
            return call_deepseek(api_key, model, system, items)

        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(
                    f"  rate limited (429), retrying in {delay:.0f}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)
                delay *= 2
                continue
            if e.code >= 500:
                print(
                    f"  server error {e.code}, retrying in {delay:.0f}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            print(
                f"  transient error: {e}; retrying in {delay:.0f}s...", file=sys.stderr
            )
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"Failed after {max_retries} retries")


def ensure_schema(con: sqlite3.Connection):
    """Add English columns + translations audit table if not present."""
    cur = con.cursor()
    cols = {r[1] for r in cur.execute("PRAGMA table_info(signs)")}
    if "en_description" not in cols:
        cur.execute("ALTER TABLE signs ADD COLUMN en_description TEXT")
    cols = {r[1] for r in cur.execute("PRAGMA table_info(meanings)")}
    if "en_text" not in cols:
        cur.execute("ALTER TABLE meanings ADD COLUMN en_text TEXT")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS translations (
            kind TEXT NOT NULL,          -- 'meaning' | 'sign'
            source_id INTEGER NOT NULL,  -- meanings.id or signs.id
            model TEXT,
            status TEXT NOT NULL,        -- 'done'
            PRIMARY KEY (kind, source_id)
        )
        """
    )
    con.commit()


def _translate_pass(con, api_key, model, batch_size, *, kind, table, src_col,
                    dst_col, system, redo_invalid):
    cur = con.cursor()
    rows = [
        (rid, src)
        for rid, src, en in cur.execute(
            f"SELECT id, {src_col}, {dst_col} FROM {table} ORDER BY id"
        ).fetchall()
        if en is None or (redo_invalid and not is_valid_translation(src, en))
    ]
    print(f"{table} to translate: {len(rows)}")
    done = rejected = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        translations = translate_batch(api_key, model, system, [r[1] for r in batch])
        for (rid, src), en in zip(batch, translations):
            if en is None or not is_valid_translation(src, en):
                # Leave NULL (and clear an old echo) so the next run retries it.
                rejected += 1
                cur.execute(f"UPDATE {table} SET {dst_col}=NULL WHERE id=?", (rid,))
                cur.execute(
                    "DELETE FROM translations WHERE kind=? AND source_id=?", (kind, rid)
                )
                continue
            cur.execute(f"UPDATE {table} SET {dst_col}=? WHERE id=?", (en, rid))
            cur.execute(
                "INSERT OR REPLACE INTO translations(kind, source_id, model, status) "
                "VALUES (?, ?, ?, 'done')",
                (kind, rid, model),
            )
            done += 1
        con.commit()
        print(f"  {table}: {i + len(batch)}/{len(rows)} ({rejected} rejected)")
    if rejected:
        print(f"  {rejected} {table} rows left NULL — run the script again to retry.")
    return done


def translate_meanings(con, api_key, model, batch_size, redo_invalid=False):
    return _translate_pass(
        con, api_key, model, batch_size, kind="meaning", table="meanings",
        src_col="text", dst_col="en_text", system=MEANINGS_SYSTEM,
        redo_invalid=redo_invalid,
    )


def translate_descriptions(con, api_key, model, batch_size, redo_invalid=False):
    return _translate_pass(
        con, api_key, model, batch_size, kind="sign", table="signs",
        src_col="description", dst_col="en_description",
        system=DESCRIPTIONS_SYSTEM, redo_invalid=redo_invalid,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "sign_themed.db",
        ),
        help="Path to the SQLite DB to translate (default: sign_themed.db)",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="DeepSeek model name")
    parser.add_argument("--batch", type=int, default=20, help="Items per API call")
    parser.add_argument(
        "--only",
        choices=["meanings", "descriptions"],
        help="Translate only one pass (default: both)",
    )
    parser.add_argument(
        "--redo-invalid",
        action="store_true",
        help="Also retranslate stored rows that fail validation (e.g. Chinese echoed back)",
    )
    args = parser.parse_args()

    api_key = get_api_key()
    con = sqlite3.connect(args.db)
    ensure_schema(con)

    if args.only in (None, "meanings"):
        translate_meanings(con, api_key, args.model, args.batch, args.redo_invalid)
    if args.only in (None, "descriptions"):
        translate_descriptions(con, api_key, args.model, args.batch, args.redo_invalid)

    con.close()
    print("done.")


if __name__ == "__main__":
    main()
