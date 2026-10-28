'use strict';
const eligibleLead = member => !!member && member.status !== 'inactive' && ['editor', 'admin'].includes(member.role);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Claim before SMTP: at most one send attempt per note, including redeliveries.
// Failed or interrupted attempts are recorded for manual investigation, not retried blindly.
function createNoteNotifier({db, auth, sendEmail, timestamp, logger, appUrl}) {
  return async ({orgId, projectId, noteId, note}) => {
    if (!note || noteId === 'current' || !note.body?.trim()) return;
    const ref = db.doc(`organizations/${orgId}/projects/${projectId}`);
    const projectSnap = await ref.get();
    if (!projectSnap.exists) return;
    const project = projectSnap.data();
    const uid = project.projectLeadUid;
    if (typeof uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) return;
    const member = await db.doc(`organizations/${orgId}/members/${uid}`).get();
    if (!member.exists || !eligibleLead(member.data())) return;
    let lead;
    try { lead = await auth.getUser(uid); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      return;
    }
    if (lead.disabled || !lead.emailVerified || !lead.email) return;
    const deliveryRef = ref.collection('notes').doc(noteId).collection('emailDeliveries').doc('projectLead');
    const claimed = await db.runTransaction(async tx => {
      const prior = await tx.get(deliveryRef);
      if (prior.exists) return false;
      tx.create(deliveryRef, {uid, status:'pending', createdAt:timestamp()});
      return true;
    });
    if (!claimed) return;
    try {
      const settingsSnap = await db.doc(`organizations/${orgId}/settings/email`).get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const title = String(project.title || 'Untitled project').replace(/[\r\n]+/g,' ');
      const url = `${appUrl.replace(/\/$/,'')}/org/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`;
      const result = await sendEmail({to:lead.email,
        subject:`DeaconProjects: new meeting note — ${title}`,
        text:`A new comment / meeting note was added to ${title}.\n\nSign in to read the project notes: ${url}\n`,
        html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17253b;background:#f3f4f6"><div style="max-width:600px;margin:24px auto;padding:28px;background:white;border-top:5px solid #245b85"><p>ELMBROOK DEACONS · PROJECT NOTES</p><h2>${escapeHtml(title)}</h2><p>A new comment / meeting note has been added.</p><p><a href="${escapeHtml(url)}">Sign in to read the project notes</a></p></div></body></html>`,
        replyTo:settings.replyToEmail || undefined, replyToName:settings.replyToName || undefined});
      await deliveryRef.update({status:'sent', sentAt:timestamp(), messageId:result?.messageId || null});
    } catch (error) {
      logger.error('Project note email failed', {orgId,projectId,noteId,uid,error:String(error)});
      await deliveryRef.update({status:'failed',failedAt:timestamp(),error:String(error).slice(0,500)});
    }
  };
}
module.exports = {eligibleLead, createNoteNotifier};
