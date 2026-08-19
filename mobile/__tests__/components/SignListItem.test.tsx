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

  it("navigates to the sign detail on press", () => {
    render(<SignListItem item={TREE_RESULT} />);

    fireEvent.press(screen.getByText("树"));

    expect(mockPush).toHaveBeenCalledWith("/sign/4683");
  });
});
