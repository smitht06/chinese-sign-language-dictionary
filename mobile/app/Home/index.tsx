import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useDb, type SearchResult } from "../../lib/db";
import SignListItem from "../components/SignListItem";

// Wait for a short typing pause before querying: each keystroke would
// otherwise run a full-table LIKE scan (noticeable on web's wasm sqlite).
const SEARCH_DEBOUNCE_MS = 150;

export default function SearchScreen() {
  const { searchSigns } = useDb();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // The query the current `results` belong to (null = nothing searched yet).
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchedQuery(null);
      return;
    }
    // `cancelled` drops responses for superseded queries: a slow earlier
    // search must never overwrite the results of a later one.
    let cancelled = false;
    const timer = setTimeout(async () => {
      let rows: SearchResult[] = [];
      try {
        rows = await searchSigns(trimmed);
      } catch (err) {
        console.warn("search failed", err);
      }
      if (!cancelled) {
        setResults(rows);
        setSearchedQuery(trimmed);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchSigns]);

  return (
    <View style={styles.container}>
      <TextInput
        testID="search-input"
        style={styles.input}
        placeholder="Search Chinese or English…"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {searchedQuery !== null && results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No results for “{searchedQuery}”</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
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
    backgroundColor: "rgba(255,255,255,0.9)",
    // Cap content width on wide screens (web); no-op on phones.
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  list: {
    flex: 1,
  },
  input: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: "rgba(250,250,250,0.9)",
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

