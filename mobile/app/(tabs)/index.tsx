import { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useDb, type SearchResult } from "../../lib/db";
import SignListItem from "../components/SignListItem";

export default function SearchScreen() {
  const { searchSigns } = useDb();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setSearched(false);
        return;
      }
      const rows = await searchSigns(trimmed);
      setResults(rows);
      setSearched(true);
    },
    [searchSigns],
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search Chinese or English…"
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          runSearch(t);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {searched && results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No results for “{query.trim()}”</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.sign_id}-${item.text}`}
          renderItem={({ item }) => <SignListItem item={item} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  input: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#888",
    fontSize: 16,
  },
});

