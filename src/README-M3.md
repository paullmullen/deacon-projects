# DeaconProjects Milestone 3A — Lifecycle & audit

Copy `App.jsx`, `ProjectBrief.jsx`, and `ProjectBrief.css` into `src/`, and `firestore.rules` into the project root. Deploy with `firebase deploy --only firestore:rules`, then run `npm run dev`.

**Implemented:** Draft → Proposed → Active → Closed; Proposed → Draft; archive Proposed; delete Draft; close with required outcome and lessons learned; member-only lifecycle history; archived dashboard filter. Lifecycle changes use one atomic Firestore batch to update the project and append a history event. The read-only printable brief is retained.

**Deliberately deferred:** Status-change emails, server-managed immutable audit actors, and admin workflow. The client currently performs lifecycle writes under Firestore rules. A draft deletion permanently removes the project document, but Firestore does *not* automatically delete subcollections, so a draft that has been proposed and returned to Draft can leave orphaned history. Avoid using deletion for such drafts until server-side recursive deletion is implemented. Existing project history starts when lifecycle transitions are first performed; prior changes cannot be reconstructed.

**Test:** Create a draft, propose it, return it to draft, propose again, activate, close with outcome and lessons, confirm history. Separately archive a proposed project and check Show archived. Confirm Viewer cannot see lifecycle controls or write; anonymous can only read public projects. Check PDF output remains clean.

**Important:** Firestore security rules have not been run against the Firestore emulator here; verify in your development project before production. Do not deploy these rules blindly to an unrelated production project.
