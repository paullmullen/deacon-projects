'use strict';
// Run from functions/: node scripts/delete-test-user.js --email test@example.com --org elmbrook
// Add --confirm to execute. Requires GOOGLE_APPLICATION_CREDENTIALS or ADC.
const {initializeApp,getApps}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
if(!getApps().length)initializeApp();
const args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const email=(arg('--email')||'').trim().toLowerCase(),org=arg('--org');
const confirm=args.includes('--confirm');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[\w-]{1,80}$/.test(org||'')){
  console.error('Usage: node scripts/delete-test-user.js --email user@example.com --org elmbrook [--confirm]');
  process.exit(2);
}
(async()=>{
  const auth=getAuth(),db=getFirestore();
  const user=await auth.getUserByEmail(email);
  const membership=db.doc(`organizations/${org}/members/${user.uid}`);
  const request=db.doc(`organizations/${org}/membershipRequests/${user.uid}`);
  const invitation=db.doc(`organizations/${org}/invitations/${createHash('sha256').update(email).digest('hex')}`);
  const docs=await Promise.all([membership.get(),request.get(),invitation.get()]);
  const organizations=await db.collectionGroup('members').where('email','==',email).get();
  const otherMemberships=organizations.docs.filter(d=>d.ref.path!==membership.path);
  console.log(JSON.stringify({uid:user.uid,email,org,records:{membership:docs[0].exists,request:docs[1].exists,invitation:docs[2].exists},otherMemberships:otherMemberships.map(d=>d.ref.path),mode:confirm?'DELETE':'DRY RUN'},null,2));
  if(!confirm){console.log('No changes made. Pass --confirm after reviewing the results.');return;}
  if(otherMemberships.length)throw Error('Account has memberships in other organizations. Remove those separately before deleting the global Auth account.');
  if(docs[0].exists&&docs[0].get('role')==='admin'){
    const admins=await db.collection(`organizations/${org}/members`).where('role','==','admin').get();
    if(admins.docs.filter(d=>d.id!==user.uid&&d.get('status')!=='inactive').length===0)throw Error('Cannot delete last active administrator.');
  }
  const batch=db.batch();
  for(let i=0;i<docs.length;i++)if(docs[i].exists)batch.delete([membership,request,invitation][i]);
  await batch.commit();
  await auth.deleteUser(user.uid);
  console.log('Deleted test account and organization membership/request/invitation records.');
})().catch(e=>{console.error(e);process.exitCode=1;});
