# DeaconProjects — Starter (Milestone 1)

A multi-tenant React + Ant Design + Firebase project brief application.

## Scope implemented

- Google sign-in and public browsing of projects in an organization.
- Organization membership roles: viewer, editor, admin (rules enforced).
- Explicit access to private projects, plus organization-admin override.
- Editors can create private drafts with title and short description and edit those two fields.
- Private-by-default project creation enforced by Firestore rules.
- No self-service tenant creation, public publishing, status changes, or permission editing yet.

## Setup

1. `npm install`
2. Create a Firebase project and register a Web app. Enable **Authentication > Google** and **Cloud Firestore**.
3. Copy `.env.example` to `.env` and fill the Firebase web app configuration.
4. `firebase login`, `firebase use --add`, and `firebase deploy --only firestore:rules`.
5. `npm run dev`; sign in once with Google. Find your Firebase Auth UID in the Firebase console.
6. For first organization provisioning, use a **trusted** service-account credential and run:
   `GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json node scripts/provision.mjs elmbrook Elmbrook YOUR_FIREBASE_AUTH_UID`
   This is a privileged administrative operation. Never commit the service account JSON.
7. Open `/org/elmbrook` and create a private draft.

For local emulator use, start `firebase emulators:start` and set `VITE_USE_EMULATORS=true` in `.env`. Emulator data must be provisioned separately; the script as written targets the credential's configured Firebase project, not the emulator unless the appropriate emulator environment variables are set.

## Important design notes

- Firestore query rules are **not filters**. The dashboard combines public-project and UID-authorized-project queries (admins may query all). These query shapes and their required indexes must be verified in Firebase Emulator rules tests before production. Do not treat this starter as production-ready.
- `organizations/{orgId}` documents are readable publicly: keep only public name and display labels there. Never store private membership or secrets in them.
- The Firestore rules currently restrict the project document to the starter fields. The full brief schema requires an explicit coordinated rules update.
- The status/visibility audit log will be written by a trusted operation in milestone 3, not client-side.
- Google sign-in does not grant editing permissions. Membership must be provisioned by an admin.
- Private access lists use Firebase Auth UIDs, not email addresses, to avoid email-spoofing and stale identity issues.

## Validation before production

Add Firebase Emulator rules tests for public reads, private reads, cross-tenant isolation, role restrictions, draft creation, and immutable ownership. Verify indexes and query behavior, then implement the complete brief and lifecycle transitions.
