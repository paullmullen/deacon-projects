#!/usr/bin/env node
// Run from DeaconProjects root: node scripts/check-and-provision.cjs allowlist.json --dry-run
// After auth:import, run with --apply. Requires GOOGLE_APPLICATION_CREDENTIALS for TARGET project.
const fs=require('node:fs');
const admin=require('firebase-admin');
const [file,mode]=process.argv.slice(2);
if(!file || !['--dry-run','--apply'].includes(mode)) throw Error('Usage: node scripts/check-and-provision.cjs allowlist.json --dry-run|--apply');
const project=process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
if(project!=='deaconprojects') throw Error('Set GOOGLE_CLOUD_PROJECT=deaconprojects; refusing to run against an unspecified or different project.');
admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:project});
const entries=JSON.parse(fs.readFileSync(file,'utf8'));
if(!Array.isArray(entries)||!entries.length) throw Error('Expected nonempty allowlist array');
const roles=['viewer','editor','admin'];
if(entries.some(u=>!u.email || !roles.includes(u.role))) throw Error('Invalid allowlist entry');
(async()=>{
 const db=admin.firestore(), auth=admin.auth();
 for(const entry of entries){
  const email=entry.email.trim().toLowerCase();
  let user;
  try{user=await auth.getUserByEmail(email);}catch(e){if(e.code==='auth/user-not-found'){console.log(`MISSING AUTH ${email} (import account first)`);continue;}throw e;}
  const ref=db.doc(`organizations/elmbrook/members/${user.uid}`);
  const snap=await ref.get();
  if(snap.exists){console.log(`EXISTS ${email}: role=${snap.get('role')} (not changing)`);continue;}
  console.log(`${mode==='--apply'?'CREATING':'WOULD CREATE'} ${email}: ${entry.role} (${user.uid})`);
  if(mode==='--apply') await ref.create({role:entry.role,email:user.email,displayName:user.displayName||'',createdAt:admin.firestore.FieldValue.serverTimestamp(),source:'volunteerkiosk-migration'});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
