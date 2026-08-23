import { getActiveNavItem } from "../../app/components/WebTopNav";

// The component's render branch is web-only (dead under Jest's ios
// platform), so pin the pure pathname mapping instead.
describe("getActiveNavItem", () => {
  it("maps Home paths to tabs and detail pages to none", () => {
    expect(getActiveNavItem("/")).toBe("search");
    expect(getActiveNavItem("/Home")).toBe("search");
    expect(getActiveNavItem("/Home/browse")).toBe("browse");
    expect(getActiveNavItem("/Home/themes")).toBe("themes");
    expect(getActiveNavItem("/sign/31")).toBeNull();
  });
});
