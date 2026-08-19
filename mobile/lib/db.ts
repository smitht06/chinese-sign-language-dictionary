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
  letter: string;
  theme: string | null;
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

/** Search signs by Chinese word, English translation, or pinyin letter. */
export async function searchSigns(
  db: SQLiteDatabase,
  query: string,
): Promise<SearchResult[]> {
  const q = `%${query.trim()}%`;
  return db.getAllAsync<SearchResult>(
    `SELECT m.sign_id, s.image_path, m.text, m.en_text, s.letter, s.theme
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE m.text LIKE ? OR m.en_text LIKE ?
     ORDER BY s.letter, m.order_in_entry
     LIMIT 200`,
    [q, q],
  );
}

/** Get all signs for a given letter (A-Z or #). */
export async function getSignsByLetter(
  db: SQLiteDatabase,
  letter: string,
): Promise<SearchResult[]> {
  return db.getAllAsync<SearchResult>(
    `SELECT m.sign_id, s.image_path, m.text, m.en_text, s.letter, s.theme
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE s.letter = ?
     ORDER BY m.text, m.order_in_entry`,
    [letter],
  );
}

/** Get all themes ordered by difficulty. */
export async function getThemes(db: SQLiteDatabase): Promise<ThemeRow[]> {
  return db.getAllAsync<ThemeRow>(
    `SELECT name, difficulty_rank, tier FROM themes ORDER BY difficulty_rank`,
  );
}

/** Get signs belonging to a theme (handles multi-theme rows). */
export async function getSignsByTheme(
  db: SQLiteDatabase,
  theme: string,
): Promise<SearchResult[]> {
  return db.getAllAsync<SearchResult>(
    `SELECT m.sign_id, s.image_path, m.text, m.en_text, s.letter, s.theme
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE s.theme IS NOT NULL AND (',' || s.theme || ',') LIKE ?
     ORDER BY m.text, m.order_in_entry`,
    [`%,${theme},%`],
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
    `SELECT m.sign_id, s.image_path, m.text, m.en_text, s.letter, s.theme
     FROM meanings m
     JOIN signs s ON s.id = m.sign_id
     WHERE m.text = ? AND m.sign_id != ?
     ORDER BY m.variant_index`,
    [text, excludeSignId],
  );
}
