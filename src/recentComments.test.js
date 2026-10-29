import test from "node:test";
import assert from "node:assert/strict";
import { RECENT_COMMENT_WINDOW, recentComments } from "./recentComments.js";
const now = Date.UTC(2026, 9, 29, 12);
const note = (id, age, body = "Comment") => ({ id, body, editedAt: { toMillis: () => now - age } });
test("rolling 14-day window includes boundary, excludes old, future, blank and undated notes", () => {
  const notes = [note("old", RECENT_COMMENT_WINDOW + 1), note("boundary", RECENT_COMMENT_WINDOW),
    note("latest", 1), note("future", -1), note("blank", 0, "  "), { id: "undated", body: "Legacy" }];
  assert.deepEqual(recentComments(notes, now).map(n => n.id), ["latest", "boundary"]);
});
test("sorts newest first without mutating input and ages comments out", () => {
  const notes = [note("first", RECENT_COMMENT_WINDOW), note("second", 1000)];
  assert.deepEqual(recentComments(notes, now).map(n => n.id), ["second", "first"]);
  assert.equal(notes[0].id, "first");
  assert.deepEqual(recentComments(notes, now + 1).map(n => n.id), ["second"]);
});
