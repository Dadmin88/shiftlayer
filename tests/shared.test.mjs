import test from "node:test";
import assert from "node:assert/strict";

await import("../shared.js");
const SL = globalThis.ShiftLayer;

test("pageInfoFromUrl scopes by origin + pathname and ignores query/hash", () => {
  assert.deepEqual(SL.pageInfoFromUrl("https://example.com/app/inbox?tab=2#message"), {
    origin: "https://example.com",
    pathname: "/app/inbox",
    scopeKey: "https://example.com/app/inbox",
  });
});

test("emptyState uses the current schema version", () => {
  assert.deepEqual(SL.emptyState(), { version: 1, scopes: {} });
});

test("normalizeState fails closed on unknown schemas", () => {
  assert.deepEqual(SL.normalizeState({ version: 99, scopes: { bad: true } }), { version: 1, scopes: {} });
});

test("looksGeneratedToken rejects obvious hashes while keeping semantic ids", () => {
  assert.equal(SL.looksGeneratedToken("save-button"), false);
  assert.equal(SL.looksGeneratedToken("profile_toolbar"), false);
  assert.equal(SL.looksGeneratedToken("9f4e9d8c2a113fab"), true);
  assert.equal(SL.looksGeneratedToken("css-a81kd92"), true);
});

test("clampString normalizes whitespace and caps length", () => {
  assert.equal(SL.clampString("  hello   world  "), "hello world");
  assert.equal(SL.clampString("abcdef", 3), "abc");
});
