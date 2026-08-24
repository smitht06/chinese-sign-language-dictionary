import path from "node:path";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { resetMockDb, searchSigns, TREE_RESULT } from "../helpers/mockDb";

// renderRouter resolves string fixtures against process.cwd(), not the test
// file — an absolute path keeps this working no matter where jest is invoked.
const APP_DIR = path.join(__dirname, "..", "..", "app");

// Screens import useDb from lib/db — swap in the shared mock.
// (lib/assets is generated + gitignored; moduleNameMapper stubs it globally.)
jest.mock("../../lib/db", () => require("../helpers/mockDb"));

describe("SearchScreen", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("searches in English and shows Chinese + English results", async () => {
    searchSigns.mockResolvedValue([TREE_RESULT]);
    renderRouter(APP_DIR, { initialUrl: "/" });

    fireEvent.changeText(screen.getByTestId("search-input"), "tree");

    expect(await screen.findByText("树")).toBeOnTheScreen();
    expect(screen.getByText("tree")).toBeOnTheScreen();
  });

  it("navigates to the sign detail when a result is pressed", async () => {
    searchSigns.mockResolvedValue([TREE_RESULT]);
    renderRouter(APP_DIR, { initialUrl: "/" });

    fireEvent.changeText(screen.getByTestId("search-input"), "tree");
    fireEvent.press(await screen.findByText("树"));
    // Flush the detail screen's async data load so its setState lands in act.
    await act(async () => {});

    expect(screen).toHavePathname("/sign/4683");
  });

  it("shows the empty state when nothing matches", async () => {
    searchSigns.mockResolvedValue([]);
    renderRouter(APP_DIR, { initialUrl: "/" });

    fireEvent.changeText(screen.getByTestId("search-input"), "xyzzy");

    expect(await screen.findByText(/No results for/)).toBeOnTheScreen();
  });
});
