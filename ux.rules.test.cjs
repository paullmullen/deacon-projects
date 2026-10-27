const fs = require("node:fs");
const { test, before, after } = require("node:test");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc } = require("firebase/firestore");
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
    for (const [id, status, archived] of [["active","active",false],["closed","closed",false],["archived","proposed",true]]) {
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
