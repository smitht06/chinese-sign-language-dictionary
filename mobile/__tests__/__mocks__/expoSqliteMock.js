// Central expo-sqlite mock (wired via moduleNameMapper "^expo-sqlite$").
// Unlike the old per-file passthrough mocks, this one ALSO runs the
// provider's onInit with a stub db so DatabaseGate's migrateDbIfNeeded
// and its loading→ready transition actually exercise in screen tests.
// The stub db's PRAGMA checks return [] (no en/asl columns) and the
// ALTER TABLE calls are no-ops.
const React = require("react");

module.exports = {
  SQLiteProvider: ({ children, onInit }) => {
    React.useEffect(() => {
      if (onInit) {
        void onInit({ getAllAsync: async () => [], execAsync: async () => {} });
      }
    }, [onInit]);
    return children ?? null;
  },
  useSQLiteContext: jest.fn(),
};
