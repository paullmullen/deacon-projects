import test from "node:test";
import assert from "node:assert/strict";
import { navigationProjects } from "./projectNavigationOrder.js";
const items = [
  { id: "draft", title: "Draft", status: "draft", visibility: "public" },
  { id: "secret", title: "Secret", status: "active", visibility: "private", priority: 1 },
  { id: "assigned", title: "Assigned", status: "active", visibility: "private", priority: 2 },
  { id: "public", title: "Public", status: "active", visibility: "public", priority: 3 },
  { id: "closed", title: "Closed", status: "closed", visibility: "public" },
];
test("Special Access navigation excludes unassigned confidential projects even when current", () => {
  assert.deepEqual(navigationProjects(items, "special_access", ["assigned"], null, "secret").map(p => p.id), ["assigned", "public", "draft", "closed"]);
});
test("anonymous navigation excludes drafts", () => {
  assert.deepEqual(navigationProjects(items, null, [], null, "draft").map(p => p.id), ["public", "closed"]);
});
test("portfolio search, collapsed closed section and title order are preserved", () => {
  const context = { search: "", sort: "title", showClosed: false };
  assert.deepEqual(navigationProjects(items, "editor", [], context, "public").map(p => p.id), ["assigned", "public", "secret", "draft"]);
  assert.deepEqual(navigationProjects(items, "editor", [], { search: "assigned" }, "assigned").map(p => p.id), ["assigned"]);
});
test("direct links retain the current archived project but exclude other archives", () => {
  const archived = [{ id: "a", archived: true, visibility: "public", status: "proposed" }, { id: "b", archived: true, visibility: "public", status: "proposed" }];
  assert.deepEqual(navigationProjects(archived, "editor", [], null, "a").map(p => p.id), ["a"]);
});
