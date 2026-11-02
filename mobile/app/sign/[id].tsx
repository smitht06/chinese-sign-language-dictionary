import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useDb,
  type MeaningRow,
  type SearchResult,
  type SignRow,
} from "../../lib/db";

import SignImage from "../components/SignImage";
import SignListItem from "../components/SignListItem";

export default function SignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const signId = Number(id);
  const { getSign, getMeaningsForSign, getVariantSigns } = useDb();

  const [sign, setSign] = useState<SignRow | null>(null);
  const [meanings, setMeanings] = useState<MeaningRow[]>([]);
  const [variants, setVariants] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `cancelled` drops results if the id changes (or the screen unmounts)
    // before the queries finish; try/finally guarantees the spinner ends
    // even when a query fails.
    let cancelled = false;
    setLoading(true);
    (async () => {
      let s: SignRow | null = null;
      let ms: MeaningRow[] = [];
      let vs: SearchResult[] = [];
      try {
        s = await getSign(signId);
        if (s) {
          ms = await getMeaningsForSign(signId);
          // Find other signs sharing the same primary word (different 打法).
          const primary = ms.find((m) => m.order_in_entry === 0);
          if (primary) {
            vs = await getVariantSigns(primary.text, signId);
          }
        }
      } catch (err) {
        console.warn("sign detail query failed", err);
      } finally {
        if (!cancelled) {
          setSign(s);
          setMeanings(ms);
          setVariants(vs);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signId, getSign, getMeaningsForSign, getVariantSigns]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  if (!sign) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Sign not found.</Text>
      </View>
    );
  }

  const primary = meanings.find((m) => m.order_in_entry === 0);
  const synonyms = meanings.filter((m) => m.order_in_entry > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SignImage
        imagePath={sign.image_path}
        aslImagePath={sign.asl_image_path}
        style={styles.image}
        showAslBadge
      />


      <View style={styles.titleBlock}>
        <Text style={styles.zh}>{primary?.text ?? sign.source_entry ?? "Sign"}</Text>
        {primary?.en_text ? (
          <Text style={styles.en}>{primary.en_text}</Text>
        ) : null}
      </View>

      {sign.theme ? (
        <View style={styles.chips}>
          {sign.theme.split("|").map((t) => (
            <Text key={t} style={styles.chip}>
              {t}
            </Text>
          ))}
        </View>
      ) : null}

      {synonyms.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synonyms</Text>
          {synonyms.map((m) => (
            <View key={m.id} style={styles.synRow}>
              <Text style={styles.synZh}>{m.text}</Text>
              {m.en_text ? (
                <Text style={styles.synEn}>{m.en_text}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How to sign</Text>

        {sign.en_description ? (
          <Text style={styles.descEn}>{sign.en_description}</Text>
        ) : null}
        <Text style={styles.descZh}>{sign.description}</Text>
      </View>

      {variants.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other ways to sign “{primary?.text}”</Text>
          {variants.map((v) => (
            <SignListItem key={v.sign_id} item={v} />
          ))}
        </View>
      ) : null}
    </ScrollView>
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
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  error: {
    color: "#c00",
    fontSize: 16,
  },
  image: {
    width: "100%",
    height: 320,
    backgroundColor: "rgba(250,250,250,0.9)",
  },
  titleBlock: {
    padding: 16,
    paddingBottom: 8,
  },
  zh: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  en: {
    fontSize: 18,
    color: "#555",
    marginTop: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chip: {
    fontSize: 13,
    color: "#1a73e8",
    backgroundColor: "#e8f0fe",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  section: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  synRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  synZh: {
    fontSize: 16,
    color: "#111",
    marginRight: 8,
  },
  synEn: {
    fontSize: 14,
    color: "#666",
  },
  descEn: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    marginBottom: 8,
  },
  descZh: {
    fontSize: 14,
    color: "#777",
    lineHeight: 21,
  },
});

