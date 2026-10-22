const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {getFirestore,FieldValue} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const logger = require('firebase-functions/logger');
const {sendEmail,emailSecrets} = require('./emailTransport');

const ACTIONS = Object.freeze({
  propose:'submitted as a proposal',
  withdraw:'returned to draft',
  activate:'activated',
  archive:'archived',
  close:'closed',
});
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const baseUrl = (process.env.PROJECT_APP_URL || 'https://deaconprojects.web.app').replace(/\/$/,'');

exports.notifyProjectLifecycle = onDocumentCreated({
  document:'organizations/{orgId}/projects/{projectId}/history/{eventId}',
  region:'us-central1',
  secrets:emailSecrets,
  retry:false,
}, async event => {
  const {orgId,projectId,eventId} = event.params;
  const data = event.data?.data();
  if (!data || !Object.hasOwn(ACTIONS,data.action)) return;
  const db = getFirestore();
  const projectRef = db.doc(`organizations/${orgId}/projects/${projectId}`);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) { logger.warn('Project missing for lifecycle notification',{orgId,projectId,eventId});return; }
  const project = projectSnap.data();
  // Never send a message for an unlinked or spoofed history entry.
  // Older history events are legitimate even after subsequent transitions.
  const historyRef = projectRef.collection('history').doc(eventId);
  const historySnap = await historyRef.get();
  if (!historySnap.exists || historySnap.data().actorUid !== data.actorUid) return;
  const members = await db.collection(`organizations/${orgId}/members`).get();
  let actor = 'A team member';
  try {const u=await getAuth().getUser(data.actorUid);actor=u.displayName||u.email||actor;} catch(e) {logger.warn('Actor lookup failed',{uid:data.actorUid,code:e.code});}
  const title = String(project.title || 'Untitled project');
  const actionText = ACTIONS[data.action];
  const url = `${baseUrl}/org/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`;
  const subject = `DeaconProjects: ${title} — ${actionText}`;
  const text = `Elmbrook Deacons project update\n\n${title} was ${actionText}.\nChanged by: ${actor}\nPrevious status: ${data.fromStatus || '—'}\nNew status: ${data.toStatus || '—'}\n\nView project: ${url}\n`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#17253b"><div style="max-width:600px;margin:24px auto;padding:28px;background:white;border-top:5px solid #245b85"><div style="font-size:13px;letter-spacing:1px;color:#52718c">ELMBROOK DEACONS · PROJECT UPDATE</div><h2>${escapeHtml(title)}</h2><p>This project was <strong>${escapeHtml(actionText)}</strong>.</p><p>Changed by: ${escapeHtml(actor)}<br>Previous status: ${escapeHtml(data.fromStatus||'—')}<br>New status: ${escapeHtml(data.toStatus||'—')}</p><p><a href="${escapeHtml(url)}">View project brief</a></p></div></body></html>`;
  let sent=0, skipped=0, failed=0;
  for(const member of members.docs){
    const uid=member.id;
    const deliveryRef=historyRef.collection('emailDeliveries').doc(uid);
    let email=member.get('email');
    if (!email){try{email=(await getAuth().getUser(uid)).email;}catch(e){logger.warn('Member email lookup failed',{uid,code:e.code});}}
    if(!email){skipped++;logger.warn('Member has no email',{uid});continue;}
    // Claim before sending to prevent parallel function invocations from duplicating mail.
    // A send failure is recorded and requires an explicit retry; no automatic retry.
    const claimed = await db.runTransaction(async tx=>{
      const existing=await tx.get(deliveryRef);
      if(existing.exists)return false;
      tx.create(deliveryRef,{uid,email,status:'pending',createdAt:FieldValue.serverTimestamp()});
      return true;
    });
    if(!claimed){skipped++;continue;}
    try{
      const result=await sendEmail({to:email,subject,text,html});
      await deliveryRef.update({status:'sent',sentAt:FieldValue.serverTimestamp(),messageId:result.messageId||null});
      sent++;
    }catch(error){
      failed++;
      logger.error('Lifecycle email failed',{orgId,projectId,eventId,uid,error:String(error)});
      await deliveryRef.update({status:'failed',failedAt:FieldValue.serverTimestamp(),error:String(error).slice(0,500)});
    }
  }
  logger.info('Lifecycle notification completed',{orgId,projectId,eventId,sent,skipped,failed});
});
