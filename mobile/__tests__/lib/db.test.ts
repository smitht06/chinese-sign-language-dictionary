import type { SQLiteDatabase } from "expo-sqlite";
import {
  escapeLike,
  getMeaningsForSign,
  getSign,
  getSignsByLetter,
  getSignsByTheme,
  getThemes,
  getVariantSigns,
  searchSigns,
} from "../../lib/db";
import { TREE_MEANINGS, TREE_RESULT, TREE_SIGN } from "../helpers/mockDb";

/** Minimal SQLiteDatabase stub — only the methods lib/db.ts calls. */
function fakeDb() {
  return {
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    execAsync: jest.fn(),
  } as unknown as SQLiteDatabase;
}

describe("searchSigns", () => {
  it("searches both Chinese text and English translation", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([TREE_RESULT]);

    const rows = await searchSigns(db, "tree");

    expect(rows).toEqual([TREE_RESULT]);
    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    // Regression guards: dropping either LIKE clause (or the en_text select)
    // is exactly how the "English translations disappeared" bug class happens.
    expect(sql).toContain("m.text LIKE");
    expect(sql).toContain("m.en_text LIKE");
    expect(sql).toContain("m.en_text");
    expect(params.slice(0, 2)).toEqual(["%tree%", "%tree%"]);
  });

  it("trims whitespace and wraps with wildcards", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([]);

    await searchSigns(db, "  tree  ");

    const [, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(params.slice(0, 2)).toEqual(["%tree%", "%tree%"]);
  });

  it("ranks exact, then prefix, then whole-word matches first", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([]);

    await searchSigns(db, "Eat");

    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    // Regression guard: without relevance ordering an exact hit like 人
    // ranked ~40th behind every A–Q word containing it.
    expect(sql).toMatch(/ORDER BY\s+CASE/);
    expect(params).toEqual([
      "%Eat%", "%Eat%", // WHERE: substring
      "Eat", "Eat", // exact
      "Eat%", "Eat%", // prefix
      "% eat %", // whole English word
    ]);
  });

  it("escapes LIKE wildcards in user input", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([]);

    await searchSigns(db, "50%_");

    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("ESCAPE '\\'");
    expect(params[0]).toBe("%50\\%\\_%");
  });
});

describe("escapeLike", () => {
  it("escapes %, _ and the escape char itself", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
    expect(escapeLike("树")).toBe("树");
  });
});

describe("getSignsByLetter", () => {
  it("queries by letter and returns mapped rows", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([TREE_RESULT]);

    const rows = await getSignsByLetter(db, "S");

    expect(rows).toEqual([TREE_RESULT]);
    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("s.letter = ?");
    // Book (pinyin) order, not Unicode code-point order of m.text.
    expect(sql).toContain("ORDER BY s.id, m.order_in_entry");
    expect(params).toEqual(["S"]);
  });
});

describe("getThemes", () => {
  it("orders by difficulty rank", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([
      { name: "入门词", difficulty_rank: 1, tier: "入门" },
    ]);

    const rows = await getThemes(db);

    expect(rows).toHaveLength(1);
    const [sql] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("ORDER BY difficulty_rank");
  });
});

describe("getSignsByTheme", () => {
  it("matches multi-theme rows with the pipe-list LIKE pattern", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([TREE_RESULT]);

    const rows = await getSignsByTheme(db, "植物");

    expect(rows).toEqual([TREE_RESULT]);
    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    // Regression guard: signs.theme is `|`-separated ("交通|就医"). A comma
    // pattern silently dropped all 52 multi-theme signs from theme browse.
    expect(sql).toContain("('|' || s.theme || '|') LIKE");
    expect(params).toEqual(["%|植物|%"]);
  });
});

describe("getSign", () => {
  it("selects the English description and ASL path columns", async () => {
    const db = fakeDb();
    (db.getFirstAsync as jest.Mock).mockResolvedValue(TREE_SIGN);

    const sign = await getSign(db, 4683);

    expect(sign).toEqual(TREE_SIGN);
    const [sql, params] = (db.getFirstAsync as jest.Mock).mock.calls[0];
    // Regression guards: these columns feed the English description and the
    // optional ASL image on the detail screen.
    expect(sql).toContain("en_description");
    expect(sql).toContain("asl_image_path");
    expect(params).toEqual([4683]);
  });

  it("passes through null for unknown ids", async () => {
    const db = fakeDb();
    (db.getFirstAsync as jest.Mock).mockResolvedValue(null);

    expect(await getSign(db, 9999)).toBeNull();
  });
});

describe("getMeaningsForSign", () => {
  it("selects en_text and orders by order_in_entry", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue(TREE_MEANINGS);

    const rows = await getMeaningsForSign(db, 4683);

    expect(rows).toEqual(TREE_MEANINGS);
    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("en_text");
    expect(sql).toContain("ORDER BY order_in_entry");
    expect(params).toEqual([4683]);
  });
});

describe("getVariantSigns", () => {
  it("finds same-word signs excluding the current sign", async () => {
    const db = fakeDb();
    (db.getAllAsync as jest.Mock).mockResolvedValue([]);

    await getVariantSigns(db, "树", 4683);

    const [sql, params] = (db.getAllAsync as jest.Mock).mock.calls[0];
    expect(sql).toContain("m.text = ?");
    expect(sql).toContain("m.sign_id != ?");
    expect(params).toEqual(["树", 4683]);
  });
});
