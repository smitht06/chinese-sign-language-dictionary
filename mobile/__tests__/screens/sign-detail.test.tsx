import type { ReactNode } from "react";
import path from "node:path";
import { renderRouter, screen } from "expo-router/testing-library";
import {
  getMeaningsForSign,
  getSign,
  getVariantSigns,
  resetMockDb,
  TREE_MEANINGS,
  TREE_SIGN,
} from "../helpers/mockDb";

// renderRouter resolves string fixtures against process.cwd(), not the test
// file — an absolute path keeps this working no matter where jest is invoked.
const APP_DIR = path.join(__dirname, "..", "..", "app");

jest.mock("expo-sqlite", () => ({
  SQLiteProvider: ({ children }: { children?: ReactNode }) => children,
  useSQLiteContext: jest.fn(),
}));
jest.mock("../../lib/db", () => require("../helpers/mockDb"));
// (lib/assets is generated + gitignored; moduleNameMapper stubs it globally.)

describe("SignDetailScreen", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("shows the Chinese word, English word, and both descriptions", async () => {
    getSign.mockResolvedValue(TREE_SIGN);
    getMeaningsForSign.mockResolvedValue(TREE_MEANINGS);
    getVariantSigns.mockResolvedValue([]);
    renderRouter(APP_DIR, { initialUrl: "/sign/4683" });

    // Word line (Chinese + English)
    expect(await screen.findByText("树")).toBeOnTheScreen();
    expect(screen.getByText("tree")).toBeOnTheScreen();

    // Description section — the English description is the key regression
    // guard (it silently vanished from the app once before).
    expect(screen.getByText("How to sign")).toBeOnTheScreen();
    expect(
      screen.getByText(/Both hands form a large circle/),
    ).toBeOnTheScreen();

    // Synonyms with their translations
    expect(screen.getByText("树木")).toBeOnTheScreen();
    expect(screen.getByText("trees")).toBeOnTheScreen();

    // No ASL image configured for this sign
    expect(screen.queryByText("ASL")).toBeNull();
  });

  it("shows the ASL badge when the sign has an ASL image", async () => {
    getSign.mockResolvedValue({
      ...TREE_SIGN,
      asl_image_path: "asl_images/test.png",
    });
    getMeaningsForSign.mockResolvedValue(TREE_MEANINGS);
    getVariantSigns.mockResolvedValue([]);
    renderRouter(APP_DIR, { initialUrl: "/sign/4683" });

    expect(await screen.findByText("ASL")).toBeOnTheScreen();
  });

  it("shows an error state for unknown signs", async () => {
    getSign.mockResolvedValue(null);
    renderRouter(APP_DIR, { initialUrl: "/sign/9999" });

    expect(await screen.findByText("Sign not found.")).toBeOnTheScreen();
  });
});
