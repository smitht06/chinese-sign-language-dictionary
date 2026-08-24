import { Link, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

type NavKey = "search" | "browse" | "themes";

const NAV_ITEMS: {
  key: NavKey;
  label: string;
  href: "/Home" | "/Home/browse" | "/Home/themes";
  match: (p: string) => boolean;
}[] = [
  {
    key: "search",
    label: "Search",
    href: "/Home",
    match: (p) => p === "/" || p === "/Home",
  },
  {
    key: "browse",
    label: "Browse",
    href: "/Home/browse",
    match: (p) => p.startsWith("/Home/browse"),
  },
  {
    key: "themes",
    label: "Themes",
    href: "/Home/themes",
    match: (p) => p.startsWith("/Home/themes"),
  },
];

/** Pure pathname → nav-item mapping so it is unit-testable. */
export function getActiveNavItem(pathname: string): NavKey | null {
  return NAV_ITEMS.find((item) => item.match(pathname))?.key ?? null;
}

/**
 * Website-style top nav, web only. Mounted once in the root layout above
 * the Stack, so it appears on every route (including sign detail) and
 * stays fixed while screen content scrolls. Native keeps the bottom tab
 * bar and per-tab headers instead.
 */
export default function WebTopNav() {
  const pathname = usePathname();
  // Client-only mount: never SSR'd, never hydrated from shell DOM. When a
  // deep link is served via the SPA fallback (e.g. /sign/31 → the root
  // index.html shell), the shell's SSR'd nav is highlighted for the WRONG
  // route and React's hydration reuses its <a> nodes, leaving the highlight
  // permanently stuck on the shell's route. Rendering nothing until after
  // hydration means there is no nav DOM to corrupt; we then mount it fresh
  // with the correct routeInfo from the router store.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || Platform.OS !== "web") {
    return null;
  }

  const active = getActiveNavItem(pathname);

  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        <Link href="/Home" style={styles.brand} testID="topnav-brand">
          CSL Dictionary
        </Link>
        <View style={styles.links}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              testID={`topnav-${item.key}`}
              style={[styles.link, active === item.key && styles.linkActive]}
            >
              {item.label}
            </Link>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  inner: {
    // Same content-column convention as every screen (see CLAUDE.md).
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    textDecorationLine: "none",
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  link: {
    fontSize: 15,
    color: "#555",
    textDecorationLine: "none",
    paddingVertical: 4,
  },
  linkActive: {
    color: "#1a73e8",
    fontWeight: "700",
  },
});
