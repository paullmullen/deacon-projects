const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const crypto = require('node:crypto');
const {sendEmail, emailSecrets} = require('./emailTransport');
const REGION = 'us-central1';
const ROLES = ['viewer','editor','admin'];
const emailKey = email => crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
const normalizeEmail = email => String(email || '').trim().toLowerCase();
const orgPath = orgId => `organizations/${orgId}`;
const safeOrgId = value => {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(id)) throw new HttpsError('invalid-argument','Invalid organization ID.');
  return id;
};
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const appUrl = (process.env.PROJECT_APP_URL || 'https://deaconprojects.web.app').replace(/\/$/,'');
async function adminOnly(request, orgId) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first.');
  const snap = await getFirestore().doc(`${orgPath(orgId)}/members/${request.auth.uid}`).get();
  if (!snap.exists || snap.data().role !== 'admin') throw new HttpsError('permission-denied','Tenant administrator access required.');
}
async function settingsFor(orgId) {
  const snap = await getFirestore().doc(`${orgPath(orgId)}/settings/email`).get();
  return snap.exists ? snap.data() : {};
}
function replyTo(settings) {
  if (!settings.replyToEmail) return undefined;
  return settings.replyToName ? `"${settings.replyToName.replace(/["\r\n]/g,'')}" <${settings.replyToEmail}>` : settings.replyToEmail;
}
async function sendTenantMail(orgId, email) {
  const settings = await settingsFor(orgId);
  return sendEmail({...email, replyTo:replyTo(settings)});
}
exports.requestMembership = onCall({region:REGION}, async request => {
  const orgId = safeOrgId(request.data?.orgId);
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in first.');
  const user = await getAuth().getUser(request.auth.uid);
  if (!user.email || !user.emailVerified) throw new HttpsError('failed-precondition','Verify your email address first.');
  const db = getFirestore();
  const org = await db.doc(orgPath(orgId)).get();
  if (!org.exists) throw new HttpsError('not-found','Organization not found.');
  if ((await db.doc(`${orgPath(orgId)}/members/${user.uid}`).get()).exists) return {status:'member'};
  const ref = db.doc(`${orgPath(orgId)}/membershipRequests/${user.uid}`);
  const existing = await ref.get();
  if (existing.exists) return {status:existing.data().status};
  const email = normalizeEmail(user.email);
  const invited = await db.doc(`${orgPath(orgId)}/invitations/${emailKey(email)}`).get();
  const displayName = String(request.data?.displayName || user.displayName || '').trim().slice(0,120);
  await ref.create({uid:user.uid, email, displayName, status:'pending', invited:invited.exists,
    createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
  return {status:'pending'};
});
exports.approveMembership = onCall({region:REGION, secrets:emailSecrets}, async request => {
  const orgId = safeOrgId(request.data?.orgId);
  await adminOnly(request,orgId);
  const uid = String(request.data?.uid || '');
  const role = String(request.data?.role || 'viewer');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(uid) || !ROLES.includes(role)) throw new HttpsError('invalid-argument','Invalid user or role.');
  const db = getFirestore();
  const reqRef = db.doc(`${orgPath(orgId)}/membershipRequests/${uid}`);
  const memberRef = db.doc(`${orgPath(orgId)}/members/${uid}`);
  let email, displayName;
  await db.runTransaction(async tx => {
    const [reqSnap, memberSnap] = await Promise.all([tx.get(reqRef),tx.get(memberRef)]);
    if (!reqSnap.exists || reqSnap.data().status !== 'pending' || memberSnap.exists)
      throw new HttpsError('failed-precondition','Request is not pending or user is already a member.');
    const data=reqSnap.data(); email=data.email; displayName=data.displayName;
    tx.create(memberRef,{role,email,displayName,active:true,joinedAt:FieldValue.serverTimestamp(),approvedBy:request.auth.uid});
    tx.update(reqRef,{status:'approved',role,decidedBy:request.auth.uid,decidedAt:FieldValue.serverTimestamp()});
  });
  try {await sendTenantMail(orgId,{to:email,subject:'DeaconProjects membership approved',
    text:`Your membership in ${orgId} has been approved. Sign in at ${appUrl}/org/${encodeURIComponent(orgId)}.`,
    html:`<p>Your membership in ${escapeHtml(orgId)} has been approved.</p><p><a href="${appUrl}/org/${encodeURIComponent(orgId)}">Open DeaconProjects</a></p>`});}
  catch(error) {console.error('Approval email failed; membership was approved', {orgId,uid,error:String(error)});}
  return {status:'approved'};
});
exports.rejectMembership = onCall({region:REGION}, async request => {
  const orgId=safeOrgId(request.data?.orgId); await adminOnly(request,orgId);
  const uid=String(request.data?.uid||'');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(uid)) throw new HttpsError('invalid-argument','Invalid user.');
  const ref=getFirestore().doc(`${orgPath(orgId)}/membershipRequests/${uid}`);
  await getFirestore().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if (!snap.exists || snap.data().status!=='pending') throw new HttpsError('failed-precondition','Not pending.');
    tx.update(ref,{status:'rejected',decidedBy:request.auth.uid,decidedAt:FieldValue.serverTimestamp()});
  });
  return {status:'rejected'};
});
exports.changeMemberRole = onCall({region:REGION},async request=>{
  const orgId=safeOrgId(request.data?.orgId);await adminOnly(request,orgId);
  const uid=String(request.data?.uid||'');const role=String(request.data?.role||'');
  if(!ROLES.includes(role)||!/^[a-zA-Z0-9_-]{8,128}$/.test(uid)) throw new HttpsError('invalid-argument','Invalid user or role.');
  if(uid===request.auth.uid && role!=='admin') throw new HttpsError('failed-precondition','Cannot remove your own admin role.');
  const ref=getFirestore().doc(`${orgPath(orgId)}/members/${uid}`);
  if(!(await ref.get()).exists) throw new HttpsError('not-found','Member not found.');
  await ref.update({role,updatedAt:FieldValue.serverTimestamp()});return {role};
});
exports.inviteMember = onCall({region:REGION,secrets:emailSecrets},async request=>{
  const orgId=safeOrgId(request.data?.orgId);await adminOnly(request,orgId);
  const email=normalizeEmail(request.data?.email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) throw new HttpsError('invalid-argument','Invalid email.');
  const db=getFirestore();
  await db.doc(`${orgPath(orgId)}/invitations/${emailKey(email)}`).set({email,invitedBy:request.auth.uid,invitedAt:FieldValue.serverTimestamp()},{merge:true});
  const url=`${appUrl}/org/${encodeURIComponent(orgId)}/register`;
  await sendTenantMail(orgId,{to:email,subject:`Invitation to DeaconProjects — ${orgId}`,
    text:`You've been invited to request membership in ${orgId}. Register and verify your email at ${url}. An administrator will approve your request.`,
    html:`<p>You've been invited to request membership in ${escapeHtml(orgId)}.</p><p><a href="${url}">Register and verify your email</a>. An administrator will approve your request.</p>`});
  return {sent:true};
});
exports.saveTenantEmailSettings=onCall({region:REGION},async request=>{
  const orgId=safeOrgId(request.data?.orgId);await adminOnly(request,orgId);
  const replyToEmail=normalizeEmail(request.data?.replyToEmail);
  const replyToName=String(request.data?.replyToName||'').trim();
  if(replyToEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToEmail)||replyToEmail.length>254)) throw new HttpsError('invalid-argument','Invalid Reply-To email.');
  if(replyToName.length>100 || /[\r\n]/.test(replyToName)) throw new HttpsError('invalid-argument','Invalid display name.');
  await getFirestore().doc(`${orgPath(orgId)}/settings/email`).set({replyToEmail,replyToName,updatedBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()});
  return {saved:true};
});
exports.testTenantEmail=onCall({region:REGION,secrets:emailSecrets},async request=>{
  const orgId=safeOrgId(request.data?.orgId);await adminOnly(request,orgId);
  const user=await getAuth().getUser(request.auth.uid);
  if(!user.email) throw new HttpsError('failed-precondition','Your account needs an email address.');
  await sendTenantMail(orgId,{to:user.email,subject:`DeaconProjects ${orgId} test email`,text:`Test email for ${orgId}. Reply to verify the Reply-To setting.`});
  return {sent:true};
});
