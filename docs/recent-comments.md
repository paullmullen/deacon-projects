# Recent dashboard comments

Editors and admins see a live count of comments / meeting notes saved in the last 14 × 24 hours. Existing comment permissions are unchanged; viewers and public visitors neither query nor see notes.

The statistic includes every accessible project, including closed projects and archived proposals, independently of dashboard search. Clicking View recent comments opens a newest-first list with project, author, timestamp, excerpt, and discussion links. Cards show a hover/click preview only while they have recent notes. Excerpts are limited to 500 characters; discussion links open the full record at the comments section.

Each project has its own recent-note Firestore subscription, using the existing editedAt timestamp (notes are immutable). This requires no new indexes, rules, or Functions deployment. The client ages notes out every minute. Failed queries display an unavailable state instead of a misleading total.

Validation: npm test; npm run build. Manual deployment check: sign in as editor/admin, add a note, return to the dashboard, inspect statistic and hover/click previews, then follow a discussion link. Confirm viewer/public sessions show no comment UI.
