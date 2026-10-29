# Project file attachments

## Using attachments

Open **Edit brief → Supporting documents → File attachments**. Choose a file, optionally set its title and description, then click **Upload attachment**. Uploads save separately from the rest of the brief. Progress and cancellation are available. Existing document links remain in the section below.

Supported: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, PNG and JPEG. Each file must be nonempty and no larger than 25 MiB. Downloads use the original filename. File type and size checks run in the client and Storage rules; these checks do not perform antivirus scanning or inspect file signatures.

Editors/admins can add and remove files on editable projects. Viewers can download files for projects they can read. Files on public Proposed, Active and Closed projects are public. Draft/confidential files require an active organization membership. Changing project visibility also changes subsequent Storage access.

Uploaded files are listed in the project brief and review packages, with their titles, filenames and descriptions. File contents are not merged into the printed PDF; readers download them from the online project. Participation-only briefs retain their existing overview/leadership-only scope.

## Storage and lifecycle

Metadata: `organizations/{orgId}/projects/{projectId}/attachments/{attachmentId}`. An upload is staged with status `uploading`; after the bytes finish, status changes atomically to `ready` with a project edit stamp. Only ready entries appear in briefs and print packages. Editors can remove incomplete entries after an interrupted upload.

Bytes: `organizations/{orgId}/projects/{projectId}/attachments/{attachmentId}/file`. Paths are derived from project and attachment IDs. The original filename is metadata, not part of the storage path. Browser downloads use the Firebase SDK's `getBlob` authorization checks; the app does not generate or expose permanent token download URLs.

Removing metadata triggers `cleanupProjectAttachment` to delete the bytes. Deleting a draft triggers `cleanupDeletedProjectFiles` to remove its file prefix and project subcollections. Cleanup is idempotent and retries on errors; physical deletion is asynchronous. Storage rules deny overwrites, object listing and direct client deletion.

Interrupted uploads remain staged and can be removed. A browser/network interruption can leave an unfinished upload. If an upload finishes at the same instant another editor removes its staging entry, a file may be left without metadata; deleting the project removes any remaining bytes under its attachment prefix. No file-level sharing URLs are exposed.

Attachment additions/removals are project edits and use the existing lead-edit notification path. No attachment bytes are included in notification emails.

## First deployment

1. In Firebase Console → Storage, initialize the default bucket if it is not already provisioned. Confirm that the app's `VITE_FIREBASE_STORAGE_BUCKET` is that bucket. The existing project configuration uses `deaconprojects.firebasestorage.app`.
2. Apply the one-time browser-download CORS policy (substitute the bucket name if it differs):

   ```bash
   gcloud storage buckets update gs://deaconprojects.firebasestorage.app --cors-file=storage.cors.json
   ```

   The policy includes the production Firebase Hosting domains and localhost port 5173. Add any custom/local test origins before applying. This command replaces the bucket's current CORS policy, so preserve any other rules if this bucket is shared. CORS controls browser interoperability; Firebase rules control file authorization.
3. Deploy the two cleanup functions and access rules before using uploads:

   ```bash
   firebase deploy --only firestore:rules,storage,functions:cleanupProjectAttachment,functions:cleanupDeletedProjectFiles,hosting
   ```

   When deploying Storage rules that consult Firestore for the first time, Firebase may request permission to enable cross-service access. The rules intentionally read at most two Firestore documents per evaluation (project and membership). No new secrets or email-function deployments are needed.
4. Refresh the app and test one small file on a confidential project, a public project, and with a viewer account. Test removal and verify the Storage object is deleted. A closed or archived project must reject uploads/removal.

## Validation

```bash
npm test
npm run build
firebase emulators:exec --only firestore,storage --project demo-project-attachments "npm run test:attachments"
```

The attachment rules suite uses Firestore 8080 and Storage 9199. It covers editor/viewer/inactive access, private/public/draft visibility, object overwrite protection, permitted types, metadata validation, and publication stamps. Client policy tests cover file-size/type rejection and project-path construction. Browser QA uses mocked Firebase adapters to exercise upload, download, removal, failed-upload cleanup, existing links, and printed attachment names. Live Storage, CORS, cleanup triggers and emulator permissions still require verification in a configured Firebase environment.

References: [Firebase SDK downloads and CORS](https://firebase.google.com/docs/storage/web/download-files), [Storage rules with Firestore authorization](https://firebase.google.com/docs/storage/security/rules-conditions).
