import test from "node:test";
import assert from "node:assert/strict";
import { compareProjects, reviewPackageProjects, projectPriority, safeDocumentUrl } from "./projectPresentation.js";

test("priority order places numbered projects first, with deterministic ties", () => {
  const projects = [
    { id: "z", title: "Aardvark" },
    { id: "c", title: "Charlie", priority: 2 },
    { id: "b", title: "Bravo", priority: 1 },
    { id: "a", title: "Alpha", priority: 1 },
    { id: "d", title: "Delta", priority: null },
  ];
  assert.deepEqual([...projects].sort(compareProjects).map(p => p.id), ["a", "b", "c", "z", "d"]);
  assert.deepEqual([...projects].sort((a,b) => compareProjects(a,b,"title")).map(p => p.id), ["z", "a", "b", "c", "d"]);
  for (const priority of [0, -1, "", "1", 1.5, NaN]) assert.equal(projectPriority({ priority }), null);
});

test("review package matches dashboard group and priority order and excludes archives/closed", () => {
  const projects = [
    { id: "d", title: "Draft", status: "draft", priority: 1 },
    { id: "p", title: "Proposed", status: "proposed", priority: 1 },
    { id: "a2", title: "Alpha", status: "active", priority: 2 },
    { id: "a1", title: "Zulu", status: "active", priority: 1 },
    { id: "closed", status: "closed", priority: 1 },
    { id: "archived", status: "proposed", archived: true, priority: 1 },
  ];
  const before = [...projects];
  const selected = ["draft", "proposed", "active", "closed"];
  assert.deepEqual(reviewPackageProjects(projects,selected).map(p=>p.id), ["a1","a2","p","d"]);
  assert.deepEqual(reviewPackageProjects(projects,selected,"title").map(p=>p.id), ["a2","a1","p","d"]);
  assert.deepEqual(reviewPackageProjects(projects,["proposed"]).map(p=>p.id), ["p"]);
  assert.deepEqual(reviewPackageProjects(projects,[]), []);
  assert.deepEqual(projects,before);
});

test("document links allow HTTPS and reject executable or credential-bearing URLs", () => {
  assert.equal(safeDocumentUrl("https://example.sharepoint.com/document"), "https://example.sharepoint.com/document");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com", "/relative", "https://user:pass@example.com", ""]) {
    assert.equal(safeDocumentUrl(url),null);
  }
});

test("drag and keyboard moves preserve group membership and do not mutate input", async () => {
  const { reorderProjects } = await import("./projectPresentation.js");
  const group = [{id:"a",status:"active"},{id:"b",status:"active"},{id:"c",status:"active"}];
  assert.deepEqual(reorderProjects(group,"a","c").map(p=>p.id),["b","c","a"]);
  assert.deepEqual(reorderProjects(group,"c","a").map(p=>p.id),["c","a","b"]);
  assert.deepEqual(reorderProjects(group,"b",null,-1).map(p=>p.id),["b","a","c"]);
  assert.equal(reorderProjects(group,"a",null,-1),null);
  assert.equal(reorderProjects(group,"c",null,1),null);
  assert.equal(reorderProjects(group,"a","missing"),null);
  assert.equal(reorderProjects([group[0],{id:"d",status:"draft"}],"a","d"),null);
  assert.deepEqual(group.map(p=>p.id),["a","b","c"]);
});
