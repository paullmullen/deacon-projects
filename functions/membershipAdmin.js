const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {ROLES,validOrg,validUid,normalizeEmail,validEmail,clean,inviteId,canAdmin,roleChangeAllowed}=require('./membershipPolicy');
const {sendEmail,emailSecrets}=require('./emailTransport');

const REGION='us-central1';
const fail=(code,msg)=>{throw new HttpsError(code,msg);};
const appUrl=(process.env.PROJECT_APP_URL||'https://deaconprojects.web.app').replace(/\/$/,'');
const callable=(handler,secrets=[])=>onCall({region:REGION,secrets,invoker:'public'},async request=>{
  if(!request.auth)fail('unauthenticated','Sign in first.');
  const orgId=request.data?.orgId;
  if(!validOrg(orgId))fail('invalid-argument','Invalid organization.');
  return handler(request,orgId,getFirestore());
});
async function adminOnly(req,orgId,db){
  const snap=await db.doc(`organizations/${orgId}/members/${req.auth.uid}`).get();
  if(!snap.exists||!canAdmin(snap.get('role')))fail('permission-denied','Organization administrator required.');
}
const memberRef=(db,orgId,uid)=>db.doc(`organizations/${orgId}/members/${uid}`);
const requestRef=(db,orgId,uid)=>db.doc(`organizations/${orgId}/membershipRequests/${uid}`);
const profile=user=>({email:user.email||'',displayName:user.displayName||user.email||''});

exports.requestMembership=callable(async(req,orgId,db)=>{
  const user=await getAuth().getUser(req.auth.uid);
  if(!user.emailVerified)fail('failed-precondition','Verify your email first.');
  const email=normalizeEmail(user.email);
  if(!validEmail(email))fail('failed-precondition','Account requires a valid email.');
  const ref=requestRef(db,orgId,user.uid);
  const inviteRef=db.doc(`organizations/${orgId}/invitations/${inviteId(email)}`);
  const result=await db.runTransaction(async tx=>{
    const [member,prior,invite]=await Promise.all([tx.get(memberRef(db,orgId,user.uid)),tx.get(ref),tx.get(inviteRef)]);
    if(member.exists)return {status:'member'};
    if(prior.exists&&prior.get('status')==='pending')return {status:'pending'};
    const invited=invite.exists&&invite.get('email')===email;
    tx.set(ref,{uid:user.uid,email,displayName:user.displayName||email,status:'pending',invited,requestedAt:FieldValue.serverTimestamp()},{merge:true});
    return {status:'pending'};
  });
  return result;
});
exports.inviteMember=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const email=normalizeEmail(req.data?.email);
  if(!validEmail(email))fail('invalid-argument','Valid email required.');
  const ref=db.doc(`organizations/${orgId}/invitations/${inviteId(email)}`);
  await ref.set({email,invitedBy:req.auth.uid,createdAt:FieldValue.serverTimestamp()},{merge:true});
  const link=`${appUrl}/org/${encodeURIComponent(orgId)}/register`;
  try{
    await sendEmail({to:email,subject:'Invitation to DeaconProjects',text:`You have been invited to join ${orgId} on DeaconProjects.\n\nCreate an account or sign in, verify your email, then request membership. An administrator will approve your request.\n\n${link}\n`});
  }catch(error){
    throw new HttpsError('internal','Invitation recorded, but email delivery failed. Check SMTP configuration and retry.');
  }
  return {ok:true};
},emailSecrets);
exports.approveMembership=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const {uid,role}=req.data||{};
  if(!validUid(uid)||!ROLES.includes(role))fail('invalid-argument','Valid user and role required.');
  const user=await getAuth().getUser(uid).catch(()=>fail('not-found','User account not found.'));
  if(!user.emailVerified)fail('failed-precondition','User must verify email before approval.');
  await db.runTransaction(async tx=>{
    const request=await tx.get(requestRef(db,orgId,uid));
    if(!request.exists||request.get('status')!=='pending')fail('failed-precondition','No pending membership request.');
    tx.set(memberRef(db,orgId,uid),{...profile(user),role,joinedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.update(requestRef(db,orgId,uid),{status:'approved',reviewedBy:req.auth.uid,reviewedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.rejectMembership=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const uid=req.data?.uid;
  if(!validUid(uid))fail('invalid-argument','Valid user required.');
  await db.runTransaction(async tx=>{
    const ref=requestRef(db,orgId,uid),snap=await tx.get(ref);
    if(!snap.exists||snap.get('status')!=='pending')fail('failed-precondition','No pending request.');
    tx.update(ref,{status:'rejected',reviewedBy:req.auth.uid,reviewedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
exports.changeMemberRole=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const {uid,role}=req.data||{};
  if(!validUid(uid)||!ROLES.includes(role))fail('invalid-argument','Valid user and role required.');
  if(uid===req.auth.uid)fail('failed-precondition','Administrators cannot change their own role.');
  const members=db.collection(`organizations/${orgId}/members`);
  await db.runTransaction(async tx=>{
    const [target,admins]=await Promise.all([tx.get(members.doc(uid)),tx.get(members.where('role','==','admin'))]);
    if(!target.exists)fail('not-found','Member not found.');
    if(!roleChangeAllowed({actorUid:req.auth.uid,targetUid:uid,targetRole:target.get('role'),newRole:role,adminCount:admins.size}))fail('failed-precondition','Role change would violate administrator protections.');
    tx.update(members.doc(uid),{role,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.auth.uid});
  });
  return {ok:true};
});
exports.saveTenantEmailSettings=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const replyToEmail=normalizeEmail(req.data?.replyToEmail);
  const replyToName=clean(req.data?.replyToName);
  if(replyToEmail&&!validEmail(replyToEmail))fail('invalid-argument','Invalid Reply-To email.');
  if(replyToName.length>100)fail('invalid-argument','Display name is too long.');
  await db.doc(`organizations/${orgId}/settings/email`).set({
    replyToEmail,replyToName,updatedAt:FieldValue.serverTimestamp(),updatedBy:req.auth.uid
  },{merge:true});
  return {ok:true};
});
exports.testTenantEmail=callable(async(req,orgId,db)=>{
  await adminOnly(req,orgId,db);
  const user=await getAuth().getUser(req.auth.uid);
  if(!user.email)fail('failed-precondition','Your account has no email.');
  const snap=await db.doc(`organizations/${orgId}/settings/email`).get();
  const settings=snap.exists?snap.data():{};
  await sendEmail({
    to:user.email,
    subject:`DeaconProjects email test — ${orgId}`,
    text:`This is a test message for ${orgId}.\nReply-To settings: ${settings.replyToName||''} <${settings.replyToEmail||'not configured'}>.\n`,
    replyTo:settings.replyToEmail||undefined,
    replyToName:settings.replyToName||undefined,
  });
  return {ok:true};
},emailSecrets);
