import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDb, type SearchResult } from "../../lib/db";
import SignListItem from "../components/SignListItem";

const LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H",
  "J", "K", "L", "M", "N", "O", "P", "Q",
  "R", "S", "T", "W", "X", "Y", "Z", "#",
];

export default function BrowseScreen() {
  const { getSignsByLetter } = useDb();
  const [selected, setSelected] = useState<string>("A");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (letter: string) => {
      setLoading(true);
      const rows = await getSignsByLetter(letter);
      setItems(rows);
      setLoading(false);
    },
    [getSignsByLetter],
  );

  useEffect(() => {
    load(selected);
  }, [selected, load]);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {LETTERS.map((letter) => (
          <Pressable
            key={letter}
            style={[
              styles.cell,
              selected === letter && styles.cellActive,
            ]}
            onPress={() => setSelected(letter)}
          >
            <Text
              style={[
                styles.cellText,
                selected === letter && styles.cellTextActive,
              ]}
            >
              {letter}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(item) => `${item.sign_id}-${item.text}`}
        renderItem={({ item }) => <SignListItem item={item} />}
        ListHeaderComponent={
          <Text style={styles.header}>
            {selected === "#" ? "Other" : `Letter ${selected}`} · {items.length} signs
          </Text>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>No signs for this letter.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.9)",
    // Cap content width on wide screens (web); no-op on phones.
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  list: {
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  cell: {
    width: "12.5%",
    maxWidth: 56,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    margin: 2,
    borderRadius: 8,
    backgroundColor: "rgba(240,240,240,0.9)",
  },
  cellActive: {
    backgroundColor: "#1a73e8",
  },
  cellText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  cellTextActive: {
    color: "#fff",
  },
  header: {
    padding: 12,
    fontSize: 14,
    color: "#666",
    backgroundColor: "rgba(250,250,250,0.9)",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "#888",
  },
});

