# Dashboard and review package UX

- Set a project's **Dashboard priority** in Edit brief. Positive whole numbers sort ascending within each lifecycle status; blank priorities follow numbered projects. Ties sort by title, then document ID.
- The dashboard also offers title sorting. Review packages follow the selected dashboard sort and the same status sequence: Active, Proposed, Draft. Only checked statuses are included; Closed and archived projects are excluded. Dashboard search does not restrict the package.
- Check **Deacon Participation Only** near the top of Edit brief when Deacons participate without leading. The brief (including review packages) then includes only section 1, Project overview, and section 2, Leadership and stakeholders. Schedule, deliverables, progress, assumptions, barriers, next steps, and supporting documents are omitted from that brief; their stored values are retained. Unchecking restores the full brief. These projects have pale blue cards and a text label. Existing projects retain their normal appearance until explicitly changed.
- Supporting documents can be added, edited, and removed in the final editor section. The existing Firestore fields `supportingDocuments` and `links` are used so existing links are preserved. Titled document links require HTTPS; file-host permissions remain authoritative. Links appear in full individual briefs and review packages, with full URLs on paper; Participation Only briefs omit the supporting-documents section.

## Deploy

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

Manual acceptance: assign priorities to two Active projects, leave a third blank, and confirm order. Mark one as representation-only and check its card. Reopen the editor after saving and verify priority, involvement, and existing/new document links. Print a package with Active and Proposed selected, check order and page breaks, and confirm links appear. Check a signed-out view and a viewer account retain their existing access.
