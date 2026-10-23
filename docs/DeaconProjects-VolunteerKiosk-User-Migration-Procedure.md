# DeaconProjects — Volunteer Kiosk User Migration Procedure

**Version:** 1.0 · **Date:** October 23, 2026  
**Purpose:** One-time migration of selected Volunteer Kiosk Firebase Email/Password accounts into DeaconProjects, preserving existing passwords and explicitly granting membership in the **Elmbrook** tenant.

## Scope and important distinctions

- **Source Firebase project:** `volunteerkiosk`
- **Destination Firebase project:** `deaconprojects`
- **Tenant membership path:** `organizations/elmbrook/members/{uid}`
- This is **not single sign-on**. Password changes and resets will not synchronize between applications after migration.
- The Firebase Authentication **account import** and the Firestore **tenant membership provisioning** are separate operations.
- Volunteer Kiosk roles do **not** automatically become DeaconProjects roles.
- The supplied provisioning script is hard-coded to `deaconprojects` and `elmbrook`; review it before reusing for another tenant.
- Keep the existing DeaconProjects administrator login available while testing imported accounts.

## Prerequisites

1. Work in PowerShell from `C:\dev\deacon-projects`.
2. Have Firebase CLI and Node.js installed and be logged in (`firebase login`).
3. Have the M5 migration add-on's scripts at:
   - `scripts/prepare-auth-import.cjs`
   - `scripts/check-and-provision.cjs`
4. Have the `firebase-admin` dependency available to the provisioning script.
5. Enable **Email/Password** in DeaconProjects Firebase Authentication.
6. For the provisioning script, configure Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS` for an identity authorized to read destination Auth users and create Firestore membership documents. Confirm these credentials point to **deaconprojects**.
7. Keep exports and signer key private. Never upload them to GitHub, chat, or tickets.

### Protect local files before exporting

Add these patterns to `.gitignore`:

```gitignore
allowlist.json
vk-selected.json
volunteerkiosk-auth.json
vk-auth-export.json
deaconprojects-auth-backup.json
firebase-debug.log
*auth-export*.json
```

The `*` characters are Git ignore wildcards, **not** Windows filename characters. A `.gitignore` entry does not protect a file that Git already tracks; check `git status` before proceeding.

## 1. Create the allowlist

Create `C:\dev\deacon-projects\allowlist.json` with **only** the users to receive Elmbrook membership. Example:

```json
[
  { "email": "person.one@example.org", "role": "admin" },
  { "email": "person.two@example.org", "role": "editor" },
  { "email": "person.three@example.org", "role": "viewer" }
]
```

Allowed roles are exactly `admin`, `editor`, `viewer`. **`user` is not valid.**

Remove accounts you do not want provisioned **from `allowlist.json`**. Removing an account from `vk-selected.json` does not undo an Auth import.

## 2. Back up destination Auth and export source Auth

```powershell
Set-Location C:\dev\deacon-projects

firebase auth:export .\deaconprojects-auth-backup.json `
  --project deaconprojects --format=json

firebase auth:export .\volunteerkiosk-auth.json `
  --project volunteerkiosk --format=json
```

These files can contain password hashes and salts. Store securely, do not commit, and delete securely when no longer required.

## 3. Prepare a filtered source import

The helper selects only allowlisted source users and checks for password hash and salt:

```powershell
node scripts/prepare-auth-import.cjs `
  volunteerkiosk-auth.json allowlist.json vk-selected.json
```

**Important:** The helper refuses to overwrite an existing `vk-selected.json`. Rename or securely remove an outdated file before regenerating it.

Inspect **only non-secret fields**:

```powershell
$selected = Get-Content .\vk-selected.json -Raw | ConvertFrom-Json
$selected.users | Select-Object email, localId, emailVerified,
  @{Name="HasPasswordHash";Expression={[bool]$_.passwordHash}},
  @{Name="HasSalt";Expression={[bool]$_.salt}}
```

Verify the selected accounts, expected count, and that `HasPasswordHash` and `HasSalt` are `True`. Do not share the JSON itself.

### Existing destination accounts and conflicts

Before importing, compare selected emails and UIDs with existing destination Auth accounts. **Do not blindly import an email or UID that already exists.** For an existing DeaconProjects Auth account, omit it from the Auth import but you may still include it in `allowlist.json` for tenant membership provisioning if appropriate. Preserve the existing administrator account and memberships.

The supplied helper uses the allowlist to generate `vk-selected.json`; if you exclude an existing destination account from the import but still want it provisioned, use a temporary *import-only* allowlist to prepare `vk-selected.json`, then retain your desired membership allowlist for the provisioning step. Do not edit password hashes manually.

## 4. Obtain source SCRYPT parameters

Get the **Volunteer Kiosk source project's** password hash configuration. The tested values in our pilot were:

```text
algorithm: SCRYPT
rounds: 8
mem_cost: 14
base64_salt_separator: Bw==
base64_signer_key: [SECRET — obtain from source project]
```

These values describe the pilot configuration; **verify them again** before a later production migration.

The Firebase Console UI may not expose the parameters where older instructions say. Use the supported Firebase/Google Cloud project interface and an appropriately privileged account. Never paste the actual signer key into chat.

## 5. Import selected authentication users

**Correct CLI flag:** `--hash-key` (not `--signer-key`). Use the source project's SCRYPT parameters.

```powershell
$signerKey = Read-Host "Enter Volunteer Kiosk source signer key"

firebase auth:import .\vk-selected.json `
  --project deaconprojects `
  --hash-algo=SCRYPT `
  --rounds=8 `
  --mem-cost=14 `
  --salt-separator="Bw==" `
  --hash-key="$signerKey"

Remove-Variable signerKey
```

`Read-Host` keeps the key out of the *typed command history*, but the CLI still receives it as a process argument and it may appear in logs or process inspection. Run in a trusted environment; do not share unredacted debug logs.

**Do not continue unless the CLI reports that users were imported successfully.** The earlier generic “unexpected error” was caused by a missing file, not by SCRYPT.

If the file cannot be found:

```powershell
Test-Path C:\dev\deacon-projects\vk-selected.json
```

For further troubleshooting, append `--debug` to the import command and inspect `firebase-debug.log`, **redacting all secrets**.

## 6. Provision Elmbrook tenant memberships

Set the destination project explicitly:

```powershell
$env:GOOGLE_CLOUD_PROJECT = "deaconprojects"
node scripts/check-and-provision.cjs allowlist.json --dry-run
```

Interpret the output:

- `MISSING AUTH`: no matching account in destination Firebase Auth; import or investigate before proceeding.
- `WOULD CREATE`: Auth account exists, but `organizations/elmbrook/members/{uid}` does not.
- `EXISTS`: the membership document exists; the script will not change its role.

**Do not assume an account with the same email has the same UID.** Google sign-in and imported Email/Password identities can have different UIDs. The script uses the destination Auth UID as the membership document ID.

Check the email, role, UID, and intended tenant for **every** entry. If an unwanted account appears, edit `allowlist.json` and rerun the dry run.

To create the missing membership documents:

```powershell
node scripts/check-and-provision.cjs allowlist.json --apply
```

**`--apply` is mandatory**; running without it produces a usage error. The script uses Firestore `create`, so existing membership documents are not overwritten.

## 7. Validate the result

1. Run the dry run again. Intended users should now show `EXISTS` with the expected roles.
2. In a private/incognito browser, sign in to DeaconProjects with an imported user's **original Volunteer Kiosk password**.
3. Verify that the user sees the Elmbrook projects appropriate to their role.
4. Verify that a `viewer` cannot edit; an `editor` cannot administer users; and tenant administration is limited to its own organization.
5. Keep the original administrator account accessible until these tests pass.
6. Record the migration date, selected user count, successful sign-in tests, and any excluded/conflicting accounts. Do **not** record passwords, hashes, salts, or the signer key.

## 8. Cleanup and follow-up

- Securely dispose of temporary exports, filtered import files, and any debug logs that may contain sensitive data once backups and validation requirements are satisfied.
- Check `git status` to ensure no authentication data is staged or committed.
- Notify migrated users that their familiar password should work initially, but password changes in Volunteer Kiosk and DeaconProjects will be independent.
- For Google-only/federated users without an exported password hash, use a separate account-linking or password-setup workflow; this password-hash import does not cover them.

## Lessons from the October 2026 pilot

1. `allowlist.json` must exist and use only `admin`, `editor`, or `viewer`.
2. `GOOGLE_CLOUD_PROJECT=deaconprojects` is required by the provisioning script.
3. The correct import flag is **`--hash-key`**, not `--signer-key`.
4. `ENOENT ... vk-selected.json` means the file is missing at the invoked path; check the path before troubleshooting SCRYPT.
5. “Imported successfully” confirms Auth import, **not** tenant membership.
6. `WOULD CREATE` refers to a missing Firestore membership, even when Auth already exists.
7. The provisioning command requires **`--apply`** for writes.
8. A pre-existing Google-authenticated administrator may have a different UID from an imported account; do not assume the two are the same identity.
9. Preserve existing administrator access and test with a small batch before migrating real users.
