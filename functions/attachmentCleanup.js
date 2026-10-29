const {onDocumentDeleted} = require('firebase-functions/v2/firestore');
const {getStorage} = require('firebase-admin/storage');
const {getFirestore} = require('firebase-admin/firestore');
exports.cleanupProjectAttachment = onDocumentDeleted({
  document:'organizations/{orgId}/projects/{projectId}/attachments/{attachmentId}',region:'us-central1',retry:true,
},async event=>{
  const {orgId,projectId,attachmentId}=event.params;
  await getStorage().bucket().file(`organizations/${orgId}/projects/${projectId}/attachments/${attachmentId}/file`).delete({ignoreNotFound:true});
});
exports.cleanupDeletedProjectFiles = onDocumentDeleted({
  document:'organizations/{orgId}/projects/{projectId}',region:'us-central1',retry:true,
},async event=>{
  const {orgId,projectId}=event.params;
  await getStorage().bucket().deleteFiles({prefix:`organizations/${orgId}/projects/${projectId}/attachments/`,force:true});
  // Firestore does not automatically delete subcollections when a draft is deleted.
  await getFirestore().recursiveDelete(getFirestore().doc(`organizations/${orgId}/projects/${projectId}`));
});
