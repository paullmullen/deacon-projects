# Backlog

## Notify the project lead when a comment / meeting note is added

Requested October 27, 2026. Implemented on `feature/project-lead-notifications`, pending review/deployment. See [Project leads and note notifications](project-lead-notifications.md) for behavior, validation and deployment.

- Send an email to the project's lead when a new comment / meeting note is saved.
- Prerequisite: formalize the project lead as a selection from authorized organization users, rather than relying on a free-text name. Store the selected user's stable UID and resolve their email from the trusted user directory.
- Preserve existing free-text lead names for display while existing projects are assigned an authorized user. Projects without a resolved lead must not send to a guessed address.
- Reuse/adapt the existing Volunteer Kiosk email infrastructure (SMTP2GO via Nodemailer, Firebase Functions secrets, Elmbrook branding).
- Trigger notifications server-side when a note is created, with duplicate-send protection. Link to the project and respect organization membership and confidential-project access.
- Decide during implementation: eligible user roles, handling leads without an account, whether authors receive notifications for their own notes, and whether emails contain note text or only a notification/link.
