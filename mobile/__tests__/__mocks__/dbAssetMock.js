// Stub for `require(".../*.db")` so tests (and CI on a fresh clone) work
// without the generated, gitignored mobile/assets/data/ directory.
module.exports = { uri: "mock://dictionary.db" };
