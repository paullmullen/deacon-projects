# Invitation onboarding — test plan

## Intended flows

1. Admin invites an email and chooses Viewer, Editor, or Admin.
2. Recipient follows the invitation link, signs in or registers using the **same email address**, and verifies email.
3. On returning to the portfolio, `claimInvitation` atomically creates their membership with the preassigned role. Refresh after verification if necessary.
4. An uninvited verified user may still request membership and await manual approval.
5. Admin can inspect invitations and resend pending invitations.
6. Admins receive a notification for membership requests, and users receive an approval notification.
7. Existing members retain their existing role if an invitation is encountered.

## Security checks

- Unauthenticated users cannot claim invitations.
- Unverified email addresses cannot claim invitations.
- Invitations are bound to the verified Firebase Auth email (normalized lowercase).
- Client cannot select or change an invitation role when claiming.
- Two concurrent claims cannot create duplicate memberships; invitation and membership updates are transactional.
- Non-admin users cannot create invitations or enumerate invitations.
- Invitation emails do not contain access credentials or tokens.

## Manual QA before merge/deploy

- Run `npm install && npm run build && npm test && npm run test:rules`.
- Run `cd functions && npm install && npm test`.
- Verify SMTP secrets and functions deployment, including new callable exports.
- Test invited **new user**, invited **existing Auth user**, uninvited user, unverified user, wrong email, duplicate invite, resend, and concurrent claim.
- Confirm invitation delivery, admin request notification, approval email, and admin role selection.
- Confirm Firestore security rules still prohibit direct client membership writes.
- Check browser after email verification: a full page refresh may be needed for Auth state to reflect verification.

## Deployment note

Deploy Cloud Functions before deploying the UI, since the UI invokes `claimInvitation` and `listInvitations`.
