import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDb, type SearchResult, type ThemeRow } from "../../lib/db";
import SignListItem from "../components/SignListItem";

export default function ThemesScreen() {
  const { getThemes, getSignsByTheme } = useDb();
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getThemes().then(setThemes);
  }, [getThemes]);

  const load = useCallback(
    async (theme: string) => {
      setLoading(true);
      const rows = await getSignsByTheme(theme);
      setItems(rows);
      setLoading(false);
    },
    [getSignsByTheme],
  );

  useEffect(() => {
    if (selected) {
      load(selected);
    }
  }, [selected, load]);

  // Group themes by tier, preserving difficulty order.
  const tiers: { tier: string; themes: ThemeRow[] }[] = [];
  for (const t of themes) {
    const last = tiers[tiers.length - 1];
    if (last && last.tier === t.tier) {
      last.themes.push(t);
    } else {
      tiers.push({ tier: t.tier, themes: [t] });
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tiers}
        keyExtractor={(t) => t.tier}
        ListHeaderComponent={
          <Text style={styles.title}>Browse by theme & difficulty</Text>
        }
        renderItem={({ item: tier }) => (
          <View style={styles.tierBlock}>
            <Text style={styles.tierLabel}>{tier.tier}</Text>
            <View style={styles.chips}>
              {tier.themes.map((t) => (
                <Pressable
                  key={t.name}
                  style={[
                    styles.chip,
                    selected === t.name && styles.chipActive,
                  ]}
                  onPress={() => setSelected(t.name)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected === t.name && styles.chipTextActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        ListFooterComponent={
          selected ? (
            <View style={styles.results}>
              <Text style={styles.resultsHeader}>
                {selected} · {items.length} signs
              </Text>
              <FlatList
                data={items}
                keyExtractor={(item) => `${item.sign_id}-${item.text}`}
                renderItem={({ item }) => <SignListItem item={item} />}
                scrollEnabled={false}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    padding: 16,
    paddingBottom: 8,
    color: "#111",
  },
  tierBlock: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a73e8",
    marginBottom: 6,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: "#1a73e8",
  },
  chipText: {
    fontSize: 14,
    color: "#333",
  },
  chipTextActive: {
    color: "#fff",
  },
  results: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    marginTop: 8,
  },
  resultsHeader: {
    padding: 12,
    fontSize: 14,
    color: "#666",
    backgroundColor: "#fafafa",
  },
});

