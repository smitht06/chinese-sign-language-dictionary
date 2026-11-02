import { useCallback } from "react";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";

export interface SignRow {
  id: number;
  image_path: string;
  asl_image_path: string | null;
  description: string;
  en_description: string | null;
  source_entry: string | null;
  letter: string;
  volume: number;
  theme: string | null;
}

export interface MeaningRow {
  id: number;
  sign_id: number;
  text: string;
  en_text: string | null;
  variant_index: number | null;
  order_in_entry: number;
}

export interface ThemeRow {
  name: string;
  difficulty_rank: number;
  tier: string;
}

export interface SearchResult {
  sign_id: number;
  image_path: string;
  text: string;
  en_text: string | null;
  /** ①→1, ②→2 … for words with several 打法; NULL when the word has one. */
  variant_index: number | null;
  letter: string;
  theme: string | null;
}

/** Columns every list query returns (shape of SearchResult). */
const RESULT_COLUMNS =
  "m.sign_id, s.image_path, m.text, m.en_text, m.variant_index, s.letter, s.theme";

/** Escape LIKE wildcards so user input like `%` or `_` matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Hook that returns query helpers bound to the SQLiteProvider context.
 * Must be used inside <SQLiteProvider>.
 */
export function useDb() {
  const db = useSQLiteContext();

  // useCallback keeps these references stable across renders so they can be
  // safely used in useEffect dependency arrays without causing infinite loops.
  const searchSignsCb = useCallback(
    (query: string) => searchSigns(db, query),
    [db],
  );
  const getSignsByLetterCb = useCallback(
    (letter: string) => getSignsByLetter(db, letter),
    [db],
  );
  const getThemesCb = useCallback(() => getThemes(db), [db]);
  const getSignsByThemeCb = useCallback(
    (theme: string) => getSignsByTheme(db, theme),
    [db],
  );
  const getSignCb = useCallback((id: number) => getSign(db, id), [db]);
  const getMeaningsForSignCb = useCallback(
    (signId: number) => getMeaningsForSign(db, signId),
    [db],
  );
  const getVariantSignsCb = useCallback(
    (text: string, excludeSignId: number) =>
      getVariantSigns(db, text, excludeSignId),
    [db],
  );

  return {
    searchSigns: searchSignsCb,
    getSignsByLetter: getSignsByLetterCb,
    getThemes: getThemesCb,
    getSignsByTheme: getSignsByThemeCb,
    getSign: getSignCb,
    getMeaningsForSign: getMeaningsForSignCb,
    getVariantSigns: getVariantSignsCb,
  };
}

/**
 * Search signs by Chinese word or English translation (substring match).
 *
 * Ranked by relevance: exact match, then prefix match, then whole-word
 * English match, then any substring; ties broken by shorter words first and
 * dictionary order. Without ranking an exact hit like 人 landed ~40th.
 */
export async function searchSigns(
  db: SQLiteDatabase,
  query: string,
): Promise<SearchResult[]> {
  const raw = query.trim();
  const esc = escapeLike(raw);
  const contains = `%${esc}%`;
  const prefix = `${esc}%`;
  const word = `% ${esc.toLowerCase()} %`;
  return db.getAllAsync<SearchResult>(
    `SELECT ${RESULT_COLUMNS}
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE m.text LIKE ? ESCAPE '\\' OR m.en_text LIKE ? ESCAPE '\\'
     ORDER BY
       CASE
         WHEN m.text = ? OR lower(m.en_text) = lower(?) THEN 0
         WHEN m.text LIKE ? ESCAPE '\\' OR m.en_text LIKE ? ESCAPE '\\' THEN 1
         WHEN ' ' || lower(m.en_text) || ' ' LIKE ? ESCAPE '\\' THEN 2
         ELSE 3
       END,
       length(m.text), s.id, m.order_in_entry
     LIMIT 200`,
    [contains, contains, raw, raw, prefix, prefix, word],
  );
}

/** Get all signs for a given letter (A-Z or #). */
export async function getSignsByLetter(
  db: SQLiteDatabase,
  letter: string,
): Promise<SearchResult[]> {
  return db.getAllAsync<SearchResult>(
    // s.id follows the book's own (pinyin) order; sorting by m.text would be
    // Unicode code-point order, which is meaningless for Chinese.
    `SELECT ${RESULT_COLUMNS}
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE s.letter = ?
     ORDER BY s.id, m.order_in_entry`,
    [letter],
  );
}

/** Get all themes ordered by difficulty. */
export async function getThemes(db: SQLiteDatabase): Promise<ThemeRow[]> {
  return db.getAllAsync<ThemeRow>(
    `SELECT name, difficulty_rank, tier FROM themes ORDER BY difficulty_rank`,
  );
}

/**
 * Get signs belonging to a theme. signs.theme is a `|`-separated list
 * (e.g. "交通|就医"), so wrap it in pipes and match `%|name|%`.
 */
export async function getSignsByTheme(
  db: SQLiteDatabase,
  theme: string,
): Promise<SearchResult[]> {
  return db.getAllAsync<SearchResult>(
    `SELECT ${RESULT_COLUMNS}
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE s.theme IS NOT NULL AND ('|' || s.theme || '|') LIKE ? ESCAPE '\\'
     ORDER BY s.id, m.order_in_entry`,
    [`%|${escapeLike(theme)}|%`],
  );
}

/** Get a single sign by id. */
export async function getSign(
  db: SQLiteDatabase,
  id: number,
): Promise<SignRow | null> {
  return db.getFirstAsync<SignRow>(
    `SELECT id, image_path, asl_image_path, description, en_description, source_entry, letter, volume, theme
     FROM signs WHERE id = ?`,
    [id],
  );
}

/** Get all meanings for a sign (variants + synonyms). */
export async function getMeaningsForSign(
  db: SQLiteDatabase,
  signId: number,
): Promise<MeaningRow[]> {
  return db.getAllAsync<MeaningRow>(
    `SELECT id, sign_id, text, en_text, variant_index, order_in_entry
     FROM meanings WHERE sign_id = ? ORDER BY order_in_entry`,
    [signId],
  );
}

/** Get all signs that share the same Chinese word (different 打法/variants). */
export async function getVariantSigns(
  db: SQLiteDatabase,
  text: string,
  excludeSignId: number,
): Promise<SearchResult[]> {
  return db.getAllAsync<SearchResult>(
    `SELECT ${RESULT_COLUMNS}
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE m.text = ? AND m.sign_id != ?
     ORDER BY m.variant_index`,
    [text, excludeSignId],
  );
}
