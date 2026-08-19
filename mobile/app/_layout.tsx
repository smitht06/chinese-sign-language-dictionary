import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider, type SQLiteDatabase } from "expo-sqlite";

// Bundled dictionary DB (copied by mobile/scripts/build_data.py).

const DB_ASSET = require("../assets/data/dictionary.db");

/**
 * Ensure the English-translation + ASL media columns exist on the opened DB.
 *
 * The bundled dictionary.db already includes these columns, but a previously
 * cached copy in the app's document directory (from an older build) may not.
 * SQLiteProvider only copies the asset on first launch, so we migrate here to
 * make the app robust against stale cached databases.
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
  if (!signCols.some((c) => c.name === "asl_video_path")) {
    await db.execAsync("ALTER TABLE signs ADD COLUMN asl_video_path TEXT");
  }

  const meaningCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(meanings)",
  );
  if (!meaningCols.some((c) => c.name === "en_text")) {
    await db.execAsync("ALTER TABLE meanings ADD COLUMN en_text TEXT");
  }
}

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="dictionary.db"
      assetSource={{ assetId: DB_ASSET }}
      onInit={migrateDbIfNeeded}
    >
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign/[id]" options={{ title: "Sign" }} />
      </Stack>
    </SQLiteProvider>
  );
}

