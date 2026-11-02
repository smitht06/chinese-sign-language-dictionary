import { fireEvent, render, screen } from "@testing-library/react-native";
import SignListItem from "../../app/components/SignListItem";
import { TREE_RESULT } from "../helpers/mockDb";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("SignListItem", () => {
  it("renders the Chinese word, English translation, and meta chips", () => {
    render(<SignListItem item={TREE_RESULT} />);

    expect(screen.getByText("树")).toBeOnTheScreen();
    expect(screen.getByText("tree")).toBeOnTheScreen();
    expect(screen.getByText("S")).toBeOnTheScreen();
    expect(screen.getByText("植物")).toBeOnTheScreen();
  });

  it("omits the English line when en_text is null", () => {
    render(<SignListItem item={{ ...TREE_RESULT, en_text: null }} />);

    expect(screen.getByText("树")).toBeOnTheScreen();
    expect(screen.queryByText("tree")).toBeNull();
  });

  it("marks variant words so 树① and 树② are distinguishable", () => {
    render(<SignListItem item={{ ...TREE_RESULT, variant_index: 2 }} />);

    expect(screen.getByText("树②")).toBeOnTheScreen();
  });

  it("renders one meta chip per theme for multi-theme signs", () => {
    render(<SignListItem item={{ ...TREE_RESULT, theme: "交通|就医" }} />);

    expect(screen.getByText("交通")).toBeOnTheScreen();
    expect(screen.getByText("就医")).toBeOnTheScreen();
    expect(screen.queryByText("交通|就医")).toBeNull();
  });

  it("navigates to the sign detail on press", () => {
    render(<SignListItem item={TREE_RESULT} />);

    fireEvent.press(screen.getByText("树"));

    expect(mockPush).toHaveBeenCalledWith("/sign/4683");
  });
});
