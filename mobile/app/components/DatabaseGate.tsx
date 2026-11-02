import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SQLiteProvider, type SQLiteDatabase } from "expo-sqlite";
import { DB_NAME } from "../../lib/assets";

// Bundled dictionary DB (copied by mobile/scripts/build_data.py).
const DB_ASSET = require("../../assets/data/dictionary.db");

// One silent retry after ~1.5s heals transient fetch hiccups (on web both
// the 4.9MB bundled DB and the wa-sqlite wasm are fetched at startup);
// a second consecutive failure surfaces the error screen with manual Retry.
const AUTO_RETRY_DELAY_MS = 1500;
const MAX_AUTO_RETRIES = 1;

type Phase = "loading" | "ready" | "error";

/**
 * Ensure the English-translation + ASL media columns exist on the opened DB.
 *
 * The bundled dictionary.db already includes these columns. SQLiteProvider
 * only copies the asset when no DB named DB_NAME exists on the device; DB_NAME
 * is content-hashed by build_data.py so data updates get a fresh copy. This
 * migration is a belt-and-braces guard for any stale copy that slips through.
 */
async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const signCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(signs)",
  );
  if (!signCols.some((c) => c.name === "en_description")) {
    await db.execAsync("ALTER TABLE signs ADD COLUMN en_description TEXT");
  }
  if (!signCols.some((c) => c.name === "asl_image_path")) {
    await db.execAsync("ALTER TABLE signs ADD COLUMN asl_image_path TEXT");
  }

  const meaningCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(meanings)",
  );
  if (!meaningCols.some((c) => c.name === "en_text")) {
    await db.execAsync("ALTER TABLE meanings ADD COLUMN en_text TEXT");
  }
}

// Exported for tests (jest-expo compiles for ios, so the web-only
// SharedArrayBuffer hint is dead code in the gate's own tests).
export function DbErrorScreen({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  // Old Safari (no COEP-credentialless) has no SharedArrayBuffer, which the
  // web sqlite worker needs — retries can never succeed there, so say so.
  const missingSab =
    Platform.OS === "web" && typeof SharedArrayBuffer === "undefined";
  return (
    <View style={styles.errorScreen} testID="db-error">
      <Text style={styles.errorTitle}>Couldn't load the dictionary.</Text>
      {error ? <Text style={styles.errorDetail}>{error.message}</Text> : null}
      {missingSab ? (
        <Text style={styles.errorDetail}>
          Your browser is missing required features (SharedArrayBuffer) — try
          updating it.
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.retryButton,
          pressed && styles.retryPressed,
        ]}
        onPress={onRetry}
        testID="db-retry"
      >
        <Text style={styles.retryLabel}>Retry</Text>
      </Pressable>
    </View>
  );
}

/**
 * Gate that owns the dictionary DB lifecycle: loading splash, one automatic
 * retry on failure, then an error screen with a manual Retry button.
 *
 * Without this gate, SQLiteProvider renders null until the DB opens and
 * rethrows init errors by default — a failed/slow DB or wasm fetch on web
 * (both happen at startup) left users staring at a blank white page with no
 * way to recover except a manual browser reload.
 *
 * LOAD-BEARING details:
 * - The non-suspense SQLiteProvider variant re-runs its full init (asset
 *   fetch + open) whenever the component remounts — that's what makes the
 *   key={attempt} retry work. Do NOT switch to useSuspense: its init promise
 *   is cached at module level and a rejection poisons all later attempts.
 * - Children must be passed through unconditionally: the provider is
 *   memo()-ized and its comparator ignores `children`, so making children
 *   conditional on `phase` would freeze the Stack out on the loading→ready
 *   transition. The real provider already hides children (renders null)
 *   until the DB is ready.
 * - onInit/onError must be referentially stable: the memo comparator and the
 *   init effect compare onInit by reference, so an unstable callback would
 *   close and re-fetch the DB on every re-render.
 */
export default function DatabaseGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0); // provider key → fresh mount
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setErrorState] = useState<Error | null>(null);
  // The real provider calls onError on every render while errored — only
  // report the first one (and defer it out of the provider's render).
  const reportedRef = useRef(false);
  const autoRetryRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInit = useCallback(async (db: SQLiteDatabase) => {
    await migrateDbIfNeeded(db);
    setErrorState(null);
    setPhase("ready");
  }, []);

  const handleError = useCallback((err: Error) => {
    if (reportedRef.current) {
      return;
    }
    reportedRef.current = true;
    // Defer: onError fires during the provider's render.
    setTimeout(() => {
      if (autoRetryRef.current < MAX_AUTO_RETRIES) {
        // Silent retry: stay on the loading splash (no error flash), bump
        // the key so the provider remounts and re-fetches everything.
        autoRetryTimerRef.current = setTimeout(() => {
          autoRetryRef.current += 1;
          reportedRef.current = false;
          setAttempt((n) => n + 1);
        }, AUTO_RETRY_DELAY_MS);
      } else {
        setErrorState(err);
        setPhase("error");
      }
    }, 0);
  }, []);

  const handleRetry = useCallback(() => {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    autoRetryRef.current = 0;
    reportedRef.current = false;
    setErrorState(null);
    setAttempt((n) => n + 1);
    setPhase("loading");
  }, []);

  useEffect(
    () => () => {
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
      }
    },
    [],
  );

  return (
    <View style={styles.container}>
      {phase === "error" ? (
        <DbErrorScreen error={error} onRetry={handleRetry} />
      ) : (
        <SQLiteProvider
          key={attempt}
          databaseName={DB_NAME}
          assetSource={{ assetId: DB_ASSET }}
          onInit={handleInit}
          onError={handleError}
        >
          {children}
        </SQLiteProvider>
      )}
      {phase === "loading" ? (
        <View style={styles.splash} testID="db-loading">
          <ActivityIndicator size="large" color="#1a73e8" />
          <Text style={styles.splashText}>Loading dictionary…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex:1 relative container: the absolute splash fills the area BELOW the
  // top nav (a sibling in the root layout's flex flow), never covering it.
  container: {
    flex: 1,
  },
  // Absolute-fill (absoluteFillObject is gone from RN 0.86 types), centered,
  // translucent per the watermark convention.
  splash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    gap: 12,
  },
  splashText: {
    fontSize: 16,
    color: "#555",
  },
  errorScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(255,255,255,0.9)",
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  errorDetail: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#1a73e8",
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryPressed: {
    opacity: 0.8,
  },
  retryLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
