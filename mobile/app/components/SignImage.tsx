import { Image, StyleSheet, Text, View } from "react-native";
import { aslImageAssets, imageAssets } from "../../lib/assets";

interface Props {
  imagePath: string;
  /** Optional ASL image path. When present, the ASL image is shown instead. */
  aslImagePath?: string | null;
  style?: object;
  /** Show a small "ASL" badge when an ASL image is displayed. */
  showAslBadge?: boolean;
}

/**
 * Renders a bundled sign image by resolving its image_path through the
 * generated static require() map (lib/assets.ts). If an ASL image path is
 * provided (and bundled), the ASL image is shown instead, with an optional
 * "ASL" badge.
 */
export default function SignImage({
  imagePath,
  aslImagePath,
  style,
  showAslBadge = false,
}: Props) {
  const aslAsset = aslImagePath ? aslImageAssets[aslImagePath] : undefined;
  const asset = aslAsset ?? imageAssets[imagePath];
  if (!asset) {
    return null;
  }

  return (
    <View style={[styles.wrap, style]}>
      <Image source={asset} style={styles.image} resizeMode="contain" />
      {showAslBadge && aslAsset ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>ASL</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(26, 115, 232, 0.9)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
