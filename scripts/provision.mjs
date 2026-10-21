// Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/provision.mjs <orgId> <orgName> <firebaseAuthUid>
// Never run this in the browser. Admin credentials must stay private.
import admin from 'firebase-admin';
const [orgId,orgName,uid]=process.argv.slice(2);
if(!orgId||!orgName||!uid)throw new Error('Expected orgId, orgName, and existing Firebase Auth UID');
admin.initializeApp({credential:admin.credential.applicationDefault()});
const db=admin.firestore();
await db.doc(`organizations/${orgId}`).set({name:orgName,labels:{projectLead:'Lead Deacon',teamMembers:'Project Team Members',stakeholders:'Key Stakeholders',approvingBody:'Council of Elders'},createdAt:admin.firestore.FieldValue.serverTimestamp()});
await db.doc(`organizations/${orgId}/members/${uid}`).set({role:'admin',createdAt:admin.firestore.FieldValue.serverTimestamp()});
console.log(`Provisioned ${orgId} with admin UID ${uid}`);
