# Branded authentication emails (SMTP2GO)

DeaconProjects uses Firebase Authentication to create and verify accounts and to validate password-reset action codes. The server generates Firebase action links using the Admin SDK and sends them using the existing SMTP2GO Nodemailer transport.

## Callables
- `sendBrandedVerification`: authenticated, only for the calling Firebase Auth user, requires unverified email; one request per user per minute.
- `sendBrandedPasswordReset`: unauthenticated, generic response for unknown email addresses, one request per email every five minutes. Do not disclose account existence.

The throttle state is stored under `authEmailLimits` with SHA-256 document identifiers. Client Firestore rules must deny access to this collection. For public deployment, also consider Firebase App Check and stronger IP/abuse protections, especially on the unauthenticated password-reset callable.

## Test before merging
1. Run `npm run build`, `npm test`, and emulator-backed rules tests.
2. Run `cd functions && npm install && npm test`.
3. Deploy functions first, then hosting. SMTP2GO secrets must be configured for the new callables.
4. Create a test account from an invitation. Confirm the email is from SMTP2GO with subject **Verify your email for DeaconProjects**, and that the Firebase verification link succeeds.
5. Return to the portfolio and confirm automatic role assignment.
6. Test **Resend verification**, including repeat requests within a minute.
7. Test password reset for a known user, unknown user, and repeated requests. Confirm the secure link resets the password and no user existence is exposed.
8. Verify the email action links' continue URL is authorized in Firebase Authentication settings.
9. Review SMTP2GO sending limits, deliverability and abuse monitoring.

**Important:** Do not disable Firebase Authentication's built-in action handling; the links still use Firebase security mechanisms. This change replaces the *delivery* from the app, not the verification or reset mechanisms.
