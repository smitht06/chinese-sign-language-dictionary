import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import SignImage from "./SignImage";
import type { SearchResult } from "../../lib/db";

interface Props {
  item: SearchResult;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨";

/** ①②… suffix so 爱国① / 爱国② are distinguishable in lists. */
export function variantMark(variantIndex: number | null | undefined): string {
  if (!variantIndex) return "";
  return CIRCLED[variantIndex - 1] ?? `(${variantIndex})`;
}

export default function SignListItem({ item }: Props) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/sign/${item.sign_id}`)}
    >
      <SignImage imagePath={item.image_path} style={styles.thumb} />
      <View style={styles.info}>
        <Text style={styles.zh}>
          {item.text}
          {variantMark(item.variant_index)}
        </Text>
        {item.en_text ? (
          <Text style={styles.en} numberOfLines={1}>
            {item.en_text}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {item.letter ? <Text style={styles.meta}>{item.letter}</Text> : null}
          {item.theme
            ? item.theme.split("|").map((t) => (
                <Text key={t} style={styles.meta}>
                  {t}
                </Text>
              ))
            : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  pressed: {
    backgroundColor: "rgba(240,240,240,0.9)",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: "rgba(245,245,245,0.9)",
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  zh: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
  },
  en: {
    fontSize: 14,
    color: "#555",
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    color: "#888",
    backgroundColor: "rgba(240,240,240,0.9)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 6,
    overflow: "hidden",
  },
});
