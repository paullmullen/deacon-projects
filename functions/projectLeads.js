const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated,onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {getFirestore,FieldValue} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const logger = require('firebase-functions/logger');
const {sendEmail,emailSecrets} = require('./emailTransport');
const {validOrg} = require('./membershipPolicy');
const {eligibleLead,createNoteNotifier,createProjectEditNotifier} = require('./noteNotificationService');
exports.listProjectLeads = onCall({region:'us-central1',invoker:'public'}, async request => {
  const orgId = request.data?.orgId;
  if (!request.auth) throw new HttpsError('unauthenticated','Sign in first.');
  if (!validOrg(orgId)) throw new HttpsError('invalid-argument','Invalid organization.');
  const db = getFirestore();
  const caller = await db.doc(`organizations/${orgId}/members/${request.auth.uid}`).get();
  if (!caller.exists || !eligibleLead(caller.data())) throw new HttpsError('permission-denied','Editor privileges required.');
  const snapshot = await db.collection(`organizations/${orgId}/members`).get();
  const members = snapshot.docs.filter(member => eligibleLead(member.data()));
  const leads = [];
  // Membership controls the organization display name; Auth controls account eligibility and email.
  for (let offset=0; offset<members.length; offset+=100) {
    const result = await getAuth().getUsers(members.slice(offset,offset+100).map(member=>({uid:member.id})));
    for (const user of result.users) {
      if (user.disabled || !user.emailVerified || !user.email) continue;
      const member = members.find(member=>member.id===user.uid);
      const name = ([member.get('displayName'), user.displayName].find(value => typeof value === 'string' && value.trim()) || 'Organization member').trim().slice(0,160);
      leads.push({uid:user.uid,name,email:user.email});
    }
  }
  return {leads:leads.sort((a,b)=>a.name.localeCompare(b.name)||a.uid.localeCompare(b.uid))};
});
exports.notifyProjectNote = onDocumentCreated({
  document:'organizations/{orgId}/projects/{projectId}/notes/{noteId}',
  region:'us-central1', secrets:emailSecrets, retry:true,
}, async event => {
  const notify = createNoteNotifier({db:getFirestore(),auth:getAuth(),sendEmail,
    timestamp:()=>FieldValue.serverTimestamp(),logger,
    appUrl:process.env.PROJECT_APP_URL || 'https://deaconprojects.web.app'});
  await notify({...event.params,note:event.data?.data()});
});

exports.notifyProjectEdited = onDocumentUpdated({
  document:'organizations/{orgId}/projects/{projectId}',
  region:'us-central1', secrets:emailSecrets, retry:true,
}, async event => {
  const notify = createProjectEditNotifier({db:getFirestore(),auth:getAuth(),sendEmail,
    timestamp:()=>FieldValue.serverTimestamp(),logger,
    appUrl:process.env.PROJECT_APP_URL || 'https://deaconprojects.web.app'});
  await notify({...event.params,eventId:event.id,before:event.data?.before.data(),after:event.data?.after.data()});
});
