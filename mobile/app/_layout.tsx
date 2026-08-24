import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { enableScreens } from "react-native-screens";
import DatabaseGate from "./components/DatabaseGate";
import Watermark from "./components/Watermark";
import WebTopNav from "./components/WebTopNav";

// On web, react-native-screens reports screensEnabled() === false, so
// react-navigation's tab fallback renders inactive scenes as plain,
// always-visible Views. With translucent screen surfaces, every visited
// tab stays visible under the active one ("ghost" content). Enabling
// screens makes the web Screen honor activityState, hiding inactive
// scenes with display:none. Native is already enabled by default.
if (Platform.OS === "web") {
  enableScreens(true);
}

// The vendored ThemeProvider does NOT merge themes — pass a full theme.
// A transparent `background` lets the root-level Watermark show through
// the stack cards; headers + the tab bar read `card` (white) and are
// unaffected.
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <ThemeProvider value={navTheme}>
        <View style={styles.root}>
          {/* First child: paints behind the nav and Stack on all platforms. */}
          <Watermark />
          {Platform.OS === "web" ? <WebTopNav /> : null}
          {/* Watermark + WebTopNav render before the DB opens so the site
              chrome is never blank during the (web) dictionary download.
              DatabaseGate owns the DB lifecycle: loading splash, one silent
              auto-retry, then an error screen with manual Retry. */}
          <DatabaseGate>
            <Stack>
              <Stack.Screen name="Home" options={{ headerShown: false }} />
              <Stack.Screen
                name="sign/[id]"
                options={{ title: "Sign", headerShown: Platform.OS !== "web" }}
              />
            </Stack>
          </DatabaseGate>
        </View>
      </ThemeProvider>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    // Match the old opaque navigator-card background (rgb(242,242,242))
    // so the look around the content column is unchanged.
    backgroundColor: "#f2f2f2",
  },
});
