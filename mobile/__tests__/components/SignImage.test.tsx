import { render, screen } from "@testing-library/react-native";
import SignImage from "../../app/components/SignImage";

// lib/assets is generated + gitignored; moduleNameMapper stubs it globally.

describe("SignImage", () => {
  it("renders the CSL image with no badge", () => {
    render(<SignImage imagePath="images/test.png" />);

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByText("ASL")).toBeNull();
  });

  it("shows the ASL image with badge when asl_image_path is set", () => {
    render(
      <SignImage
        imagePath="images/test.png"
        aslImagePath="asl_images/test.png"
        showAslBadge
      />,
    );

    expect(screen.getByText("ASL")).toBeOnTheScreen();
  });

  it("does not badge when showAslBadge is false", () => {
    render(
      <SignImage
        imagePath="images/test.png"
        aslImagePath="asl_images/test.png"
      />,
    );

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByText("ASL")).toBeNull();
  });

  it("falls back to the CSL image when the ASL path is not bundled", () => {
    render(
      <SignImage
        imagePath="images/test.png"
        aslImagePath="asl_images/missing.png"
        showAslBadge
      />,
    );

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByText("ASL")).toBeNull();
  });

  it("renders nothing when neither image is known", () => {
    render(<SignImage imagePath="images/missing.png" />);

    expect(screen.toJSON()).toBeNull();
  });
});
