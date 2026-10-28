const fs = require("node:fs");
const { test, before, after } = require("node:test");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, runTransaction, getDoc, getDocs, collection, deleteDoc, serverTimestamp } = require("firebase/firestore");
let env;
const root = "organizations/ux-test-org";
before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT || "demo-deacon-ux",
    firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, root, "members", "editor"), { role: "editor" });
    await setDoc(doc(db, root, "members", "viewer"), { role: "viewer" });
    await setDoc(doc(db, root, "members", "admin"), { role: "admin" });
    await setDoc(doc(db, root, "members", "inactiveEditor"), { role: "editor", status: "inactive" });
    for (const [id, status, archived] of [["second","active",false],["active","active",false],["closed","closed",false],["archived","proposed",true]]) {
      await setDoc(doc(db, root, "projects", id), {
        title: id, status, archived, visibility: "private", createdBy: "editor",
      });
    }
  });
});
after(async () => { if (env) await env.cleanup(); });
const project = (uid, id = "active") => doc(
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore(),
  root, "projects", id,
);
test("editors can save priority, involvement, and existing-schema document links", async () => {
  await assertSucceeds(updateDoc(project("editor"), {
    shortDescription: "", longDescription: "", purpose: "", leadDeacon: "", teamMembers: "",
    stakeholders: "", kickoffDate: "", targetDate: "", actualDate: "", nextReviewDate: "",
    expectedOutcome: "", projectSponsor: "", scope: "", statusNote: "", barriers: "",
    accomplishments: "", decisionsNeeded: "", assumptionsTable: [], nextStepsTable: [], deliverableCategories: [],
    priority: 1, deaconRole: "representation",
    supportingDocuments: [{ title: "Budget", url: "https://example.com/budget", description: "", addedBy: "editor", dateAdded: "2026-10-26" }],
    links: "[Original folder](https://example.com/folder)",
  }));
  await assertSucceeds(updateDoc(project("editor"), { priority: null, deaconRole: "leadership" }));
});
test("invalid priorities, involvement, and excessive document counts are rejected", async () => {
  for (const priority of [-1, 0, 1.5, "1", 1000000]) {
    await assertFails(updateDoc(project("editor"), { priority }));
  }
  await assertFails(updateDoc(project("editor"), { deaconRole: "other" }));
  await assertFails(updateDoc(project("editor"), { supportingDocuments: Array.from({ length: 21 }, () => ({ title: "Too many" })) }));
});
test("viewers, visitors, closed projects and archived proposals remain protected", async () => {
  await assertFails(updateDoc(project("viewer"), { priority: 2 }));
  await assertFails(updateDoc(project(null), { priority: 2 }));
  await assertFails(updateDoc(project("editor", "closed"), { priority: 2 }));
  await assertFails(updateDoc(project("editor", "archived"), { priority: 2 }));
});

test("project order saves atomically for editors", async () => {
  const db = env.authenticatedContext("editor").firestore();
  const first = doc(db, root, "projects", "active");
  const second = doc(db, root, "projects", "second");
  await assertSucceeds(runTransaction(db, async tx => {
    await tx.get(first); await tx.get(second);
    tx.update(first, { priority: 2 }); tx.update(second, { priority: 1 });
  }));
  const assert = require("node:assert/strict");
  assert.equal((await getDoc(first)).data().priority, 2);
  assert.equal((await getDoc(second)).data().priority, 1);
});

const note = (uid, id = "active", noteId = "meeting-one") => doc(
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore(),
  root, "projects", id, "notes", noteId,
);
const noteData = () => ({ body: "### Meeting notes\n\n**Decision:** Proceed.", editorUid: "editor", editorName: "Editor Name", editedAt: serverTimestamp() });
test("notes append independently and cannot be changed or deleted", async () => {
  await assertSucceeds(setDoc(note("editor"), noteData()));
  await assertSucceeds(setDoc(note("editor", "active", "meeting-two"), noteData()));
  await assertFails(updateDoc(note("editor"), { body: "Replacement" }));
  await assertFails(setDoc(note("editor"), noteData()));
  await assertFails(deleteDoc(note("editor")));
  await assertFails(setDoc(note("editor", "active", "current"), noteData()));
});
test("notes enforce authorship, timestamps and project permissions", async () => {
  const fresh = (uid, id = "active") => note(uid, id, "validation");
  await assertFails(setDoc(fresh("viewer"), { ...noteData(), editorUid: "viewer" }));
  await assertFails(setDoc(fresh("editor"), { ...noteData(), editorUid: "other" }));
  await assertFails(setDoc(fresh("editor"), { ...noteData(), editedAt: new Date(0) }));
  await assertFails(setDoc(fresh("editor"), { ...noteData(), body: "x".repeat(20001) }));
  await assertFails(setDoc(fresh("editor"), { ...noteData(), body: "" }));
  await assertFails(setDoc(fresh("editor", "closed"), noteData()));
  await assertFails(setDoc(fresh("editor", "archived"), noteData()));
  await assertFails(setDoc(fresh("editor", "missing"), noteData()));
});
test("only editors and admins can read notes including legacy notes on public projects", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), root, "projects", "active"), { visibility: "public" });
    await setDoc(doc(context.firestore(), root, "projects", "active", "notes", "current"), noteData());
  });
  await assertSucceeds(getDoc(project(null)));
  await assertFails(getDoc(note("viewer", "active", "current")));
  await assertSucceeds(getDoc(note("editor", "active", "current")));
  await assertSucceeds(getDoc(note("admin", "active", "current")));
  await assertFails(getDoc(note("viewer")));
  await assertFails(updateDoc(note("editor", "active", "current"), { body: "Overwrite old record" }));
  await assertFails(getDoc(note(null)));
  await assertFails(getDoc(note("outsider")));
  const notes = uid => collection(uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore(), root, "projects", "active", "notes");
  await assertFails(getDocs(notes("viewer")));
  await assertSucceeds(getDocs(notes("editor")));
  await assertSucceeds(getDocs(notes("admin")));
  await assertFails(getDocs(notes(null)));
  await assertFails(getDocs(notes("outsider")));
});

test("project lead assignments require an active editor or admin in the same organization", async () => {
  await assertSucceeds(updateDoc(project("editor"), {projectLeadUid:"editor",leadDeacon:"Editor"}));
  await assertSucceeds(updateDoc(project("editor"), {projectLeadUid:"admin",leadDeacon:"Administrator"}));
  for (const uid of ["viewer", "inactiveEditor", "outsider", "bad/path"]) {
    await assertFails(updateDoc(project("editor"), {projectLeadUid:uid}));
  }
  await assertFails(updateDoc(project("viewer"), {projectLeadUid:"editor"}));
  await assertFails(updateDoc(project("inactiveEditor"), {projectLeadUid:"editor"}));
  await assertFails(getDoc(note("inactiveEditor")));
  await assertSucceeds(updateDoc(project("editor"), {projectLeadUid:"",leadDeacon:""}));
});
