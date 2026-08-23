import { Image, StyleSheet, View } from "react-native";

// Placeholder until the user drops their real 500x500 PNG at this path —
// overwrite the file, no code changes needed.
const WATERMARK = require("../../assets/watermark.png");

/**
 * Full-viewport, dead-center watermark rendered once in the root layout,
 * behind all navigation content. Non-interactive; content surfaces above
 * it are translucent so it stays faintly visible.
 */
export default function Watermark() {
  return (
    <View style={styles.wrap} pointerEvents="none" testID="watermark">
      <Image
        testID="watermark-image"
        source={WATERMARK}
        style={styles.image}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Full-viewport overlay (absoluteFillObject is gone from RN 0.86 types).
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "60%",
    maxWidth: 500,
    aspectRatio: 1,
    opacity: 0.5,
  },
});
