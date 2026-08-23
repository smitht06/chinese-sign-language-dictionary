import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Watermark from "../../app/components/Watermark";

// Regression guard: the watermark sits behind every screen — if a future
// edit "fixes" the opacity or pointerEvents, scrolling/taps break app-wide.
describe("Watermark", () => {
  it("is half-transparent and non-interactive", () => {
    render(<Watermark />);
    expect(screen.getByTestId("watermark").props.pointerEvents).toBe("none");
    const style = StyleSheet.flatten(
      screen.getByTestId("watermark-image").props.style,
    );
    expect(style).toMatchObject({ opacity: 0.5, maxWidth: 500, aspectRatio: 1 });
  });
});
