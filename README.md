# DeaconProjects — M4 Portfolio Dashboard

Based on the uploaded App.jsx and firestore.rules (October 22, 2026).

## Install

1. Back up your current `src/App.jsx` and `firestore.rules`.
2. Copy `src/App.jsx` and `firestore.rules` from this package into the project root, preserving paths.
3. The public query uses a compound visibility/status filter. Add the supplied composite index to your existing `firestore.indexes.json` (merge, do not overwrite existing indexes). If you have no index file, copy the supplied file and add `"indexes": "firestore.indexes.json"` under the `firestore` object in `firebase.json`.
4. Run `npx prettier --write src/App.jsx`, then `npm run build`.
5. Run Firestore emulator rules tests if configured, then deploy `firebase deploy --only firestore:rules,firestore:indexes` (only if indexes configured).
6. Deploy Hosting as usual after testing.

## Security expectations

- Members: all statuses and visibility values.
- Visitors: public Proposed, Active, Closed only. Public Draft denied even by direct document read.
- The client query must include BOTH `visibility == public` and `status in [proposed, active, closed]`; security rules are not result filters.
- Members' role-based editing remains unchanged.
- Archived proposals are hidden from the default dashboard and visible to members on demand. Public archived proposals are currently readable by visitors through a direct URL because archival is not part of the specified confidentiality policy; revisit if archives should be private.

## Acceptance tests

- Signed-out visitor: no drafts or confidential projects; public Proposed/Active/Closed appear.
- Signed-out direct link to a public Draft: denied.
- Signed-out direct link to a confidential Active project: denied.
- Member (viewer): sees Draft and Confidential, but cannot edit.
- Special Access: same read access as a viewer; editor privileges (brief, lifecycle, comments and attachments) only for confidential projects assigned in User administration. Cannot create projects, reorder the portfolio or change project visibility. Closed and archived projects remain read-only. Removing assignments, changing role or deactivating membership revokes editing access.
- User administration: select Special Access as the role and save the confidential-project assignments. Invitations and membership approvals can include assignments. Deploy Functions, Firestore rules, Storage rules and Hosting together for this feature.
- Security verification: `firebase emulators:exec --only firestore,storage --project demo-special-access "npm run test:special-access"`.
- Member (editor/admin): sees all and can create drafts.
- Closed projects appear last, collapsed by default; search finds matching closed projects.
- Existing lifecycle actions, history, email notifications, and print brief still work.

Note: Creating a Public project is not exposed in the uploaded UI; this change does not add a visibility editor or change the stored `private` value.
