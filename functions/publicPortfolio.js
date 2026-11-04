const {onCall,HttpsError} = require('firebase-functions/v2/https');
const {getFirestore} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {validOrg,validUid} = require('./membershipPolicy');
const {publicPortfolioProject, canReadLeadContact} = require('./portfolioPolicy');
exports.publicPortfolio = onCall({region:'us-central1',invoker:'public'}, async request => {
  const orgId = request.data?.orgId;
  if (!validOrg(orgId)) throw new HttpsError('invalid-argument','Invalid organization.');
  const snapshot = await getFirestore().collection(`organizations/${orgId}/projects`).where('visibility','==','public').get();
  return {projects:snapshot.docs.map(doc=>publicPortfolioProject(doc.id,doc.data())).filter(Boolean)};
});
exports.projectLeadContact = onCall({region:'us-central1',invoker:'public'}, async request => {
  const {orgId,projectId} = request.data || {};
  if (!validOrg(orgId) || !validUid(projectId)) throw new HttpsError('invalid-argument','Invalid project.');
  const db = getFirestore();
  const project = await db.doc(`organizations/${orgId}/projects/${projectId}`).get();
  const member = request.auth ? await db.doc(`organizations/${orgId}/members/${request.auth.uid}`).get() : null;
  if (!project.exists || !canReadLeadContact(project.data(),projectId,member?.data()))
    throw new HttpsError('permission-denied','Project not available.');
  const uid = project.get('projectLeadUid');
  if (!validUid(uid)) return {email:null};
  const leadMember = await db.doc(`organizations/${orgId}/members/${uid}`).get();
  if (!leadMember.exists || leadMember.get('status') === 'inactive') return {email:null};
  try {
    const lead = await getAuth().getUser(uid);
    return {email:!lead.disabled && lead.emailVerified ? lead.email || null : null};
  } catch (error) {
    if (error.code === 'auth/user-not-found') return {email:null};
    throw error;
  }
});
