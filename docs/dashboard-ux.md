# Dashboard and review package UX

- Drag a card's dotted handle onto another card within its status group to save the new project order. Editors and administrators can reorder current Active, Proposed and Draft projects. Closed and archived projects retain their existing read-only behavior.
- Focus a handle and use arrow keys to move one position with a keyboard. Pointer handles support mouse and touch. Search must be empty and **Priority order** selected before reordering.
- Saves use one Firestore transaction for the group, with sequential priorities. Concurrent order or status changes are detected and ask the user to refresh. Failed saves retain the previous display order. Groups larger than 450 projects cannot currently be reordered in one save.
- The detailed editor no longer exposes or writes priority. Existing priority values seed the dashboard order; no data migration is needed. Review packages always use the saved order within Active, Proposed and Draft, even when viewing an alphabetical dashboard or searching. Only checked statuses are included; Closed and archived projects are excluded.
- Check **Deacon Participation Only** near the top of Edit brief when Deacons participate without leading. The brief (including review packages) then includes only section 1, Project overview, and section 2, Leadership and stakeholders. Schedule, deliverables, progress, assumptions, barriers, next steps, and supporting documents are omitted from that brief; their stored values are retained. Unchecking restores the full brief. These projects have pale blue cards and a text label. Existing projects retain their normal appearance until explicitly changed.
- Supporting documents can be added, edited, and removed in the final editor section. The existing Firestore fields `supportingDocuments` and `links` are used so existing links are preserved. Titled document links require HTTPS; file-host permissions remain authoritative. Links appear in full individual briefs and review packages, with full URLs on paper; Participation Only briefs omit the supporting-documents section.

## Deploy

The drag-and-drop follow-up changes Hosting only, provided the earlier priority/participation rules have already been deployed.

The repository previously omitted `firestore.rules`. This change restores the saved October 25 `firestore(8).rules` baseline and extends its ordinary project-edit allowlist with `priority` and `deaconRole`, including value validation. Compare against any newer locally maintained production rules before deploying.

```powershell
npm test
npm run build
firebase deploy --only firestore:rules,hosting --project deaconprojects
```

No Functions deployment or data migration is required.

## Verification

Unit tests cover priority/tie sorting, title sorting, package filtering/order, and safe document URLs. Firestore emulator tests cover full brief saves, invalid values, and role/closed/archive restrictions, plus existing lifecycle checks.

```powershell
firebase emulators:exec --only firestore --project demo-deacon-ux "npm run test:rules"
```

Manual acceptance: drag an Active project to a different position, refresh, and confirm the saved order; try the same with keyboard arrow keys on its handle. Confirm a normal brief edit preserves that order. Mark one as representation-only and check its card. Reopen the editor after saving and verify priority, involvement, and existing/new document links. Print a package with Active and Proposed selected, check order and page breaks, and confirm links appear. Check a signed-out view and a viewer account retain their existing access.
