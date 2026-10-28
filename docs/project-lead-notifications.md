# Project leads and note notifications

## Behavior

- Project lead is selected from active organization editors/admins with an enabled, verified account and an email address. The editor-only directory shows names and email addresses to distinguish people; the brief retains only a display name and a stable account UID.
- Existing free-text lead names remain intact. Open Edit brief, choose the authorized lead account, and save to enable notifications. No guessed email addresses or name-to-account matching.
- Clearing a selected lead removes the account link and display name. An unchanged legacy name remains unlinked until someone explicitly selects an account.
- Each new meeting note emails the linked project lead, including when the lead authored it. The email identifies the project and links to its notes; it does not reproduce note text. Existing notes are not announced retroactively.
- Membership and account eligibility are checked at notification time. Unlinked, inactive, viewer, disabled, unverified, and missing-account leads do not receive mail.
- The callable directory requires active editor/admin privileges. Firestore validates new lead assignments against organization membership. Notes remain visible only to editors/admins, including when a project is closed.

## Email transport and delivery records

Reuses `emailTransport.js`, the existing SMTP secrets, Elmbrook branding and the organization Reply-To settings. No new email provider or secrets.

Delivery attempts are claimed atomically at `organizations/{orgId}/projects/{projectId}/notes/{noteId}/emailDeliveries/projectLead` before sending. Concurrent/redelivered events do not make a second SMTP attempt. Statuses are `pending`, `sent`, or `failed`. SMTP cannot guarantee exactly-once delivery: a process interrupted after claiming may leave a pending record, and a failed send may already have been accepted by the provider. Investigate these records before manually retrying; do not automatically delete claims. A sent status means the provider accepted the message, not guaranteed inbox delivery.

## Deployment and verification

This change builds on PR #15's editor-only notes restriction. Merge that prerequisite before merging this branch into main.

```bash
firebase deploy --only functions:listProjectLeads,functions:notifyProjectNote,firestore:rules,hosting
```

Existing SMTP secrets must already be configured in the DeaconProjects Firebase project. Hosting's predeploy step runs the production build.

Verify with a test project and accounts you control:

1. Open a legacy project and save an unrelated change: the existing lead name remains unchanged.
2. Select an authorized account as lead; save, reload, and confirm the selection persists.
3. Add a note and verify the lead receives one link-only email and a sent delivery record is created.
4. Verify viewers cannot list eligible leads, select a lead, read notes, or print notes. Inactive editors must also be denied editor operations.
5. Remove a lead's editor privileges or deactivate the account, then add a note: no email is sent to that lead.
6. Clear the linked lead and save: future notes produce no lead notification.

Automated coverage: notifier tests use a mocked SMTP sender and Firestore adapter (no real emails). Lead-selector browser checks use a mocked callable response. The Firestore emulator suite includes assignment and access checks and must run before production deployment.
