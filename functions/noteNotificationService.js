'use strict';
const {isDeepStrictEqual} = require('node:util');
const {createHash} = require('node:crypto');
const eligibleLead = member => !!member && member.status !== 'inactive' && ['editor', 'admin'].includes(member.role);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Claim before SMTP: at most one send attempt per note, including redeliveries.
// Failed or interrupted attempts are recorded for manual investigation, not retried blindly.
function createNoteNotifier({db, auth, sendEmail, timestamp, logger, appUrl}) {
  return async ({orgId, projectId, noteId, note, edit}) => {
    if (!note || noteId === 'current' || !note.body?.trim()) return;
    const ref = db.doc(`organizations/${orgId}/projects/${projectId}`);
    const projectSnap = await ref.get();
    if (!projectSnap.exists) return;
    const project = projectSnap.data();
    const uid = project.projectLeadUid;
    if (edit && (uid !== edit.projectLeadUid || uid === edit.updatedBy)) return;
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
    let editorName = 'an organization editor';
    if (edit) {
      const editor = await db.doc(`organizations/${orgId}/members/${edit.updatedBy}`).get();
      if (editor.exists && typeof editor.data().displayName === 'string' && editor.data().displayName.trim()) editorName = editor.data().displayName.trim();
      else {
        try { const account = await auth.getUser(edit.updatedBy); editorName = account.displayName || editorName; }
        catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      }
    }
    const deliveryRef = edit
      ? ref.collection('editEmailDeliveries').doc(createHash('sha256').update(noteId).digest('hex'))
      : ref.collection('notes').doc(noteId).collection('emailDeliveries').doc('projectLead');
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
      const update = edit ? `That project was just edited by ${editorName}.` : 'That project has a new comment/meeting note.';
      const guidance = 'If you were not expecting updates to this project, you may want to check it now.';
      const result = await sendEmail({to:lead.email,
        subject:`DeaconProjects: ${edit ? 'project updated' : 'new meeting note'} — ${title}`,
        text:`You are receiving this message because you are the project leader for ${title}.\n\n${update}\n\n${guidance}\n\nView project: ${url}\n`,
        html:`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17253b;background:#f3f4f6"><div style="max-width:600px;margin:24px auto;padding:28px;background:white;border-top:5px solid #245b85"><p>ELMBROOK DEACONS · PROJECT UPDATE</p><p>You are receiving this message because you are the project leader for <a href="${escapeHtml(url)}">${escapeHtml(title)}</a>.</p><p>${escapeHtml(update)}</p><p>${guidance}</p><p><a href="${escapeHtml(url)}">View project</a></p></div></body></html>`,
        replyTo:settings.replyToEmail || undefined, replyToName:settings.replyToName || undefined});
      await deliveryRef.update({status:'sent', sentAt:timestamp(), messageId:result?.messageId || null});
    } catch (error) {
      logger.error('Project lead email failed', {orgId,projectId,noteId,uid,error:String(error)});
      await deliveryRef.update({status:'failed',failedAt:timestamp(),error:String(error).slice(0,500)});
    }
  };
}
const auditOnlyKeys = new Set(['updatedAt','updatedBy','priority','lastEventId','progressEditedAt']);
function createProjectEditNotifier(dependencies) {
  const notify = createNoteNotifier(dependencies);
  return async ({orgId,projectId,eventId,before,after}) => {
    if (!before || !after || typeof eventId !== 'string' || !eventId ||
        typeof after.updatedBy !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(after.updatedBy) ||
        !after.updatedAt || isDeepStrictEqual(before.updatedAt,after.updatedAt) ||
        after.updatedBy === after.projectLeadUid) return;
    const changed = [...new Set([...Object.keys(before),...Object.keys(after)])]
      .some(key => !auditOnlyKeys.has(key) && !isDeepStrictEqual(before[key],after[key]));
    if (!changed) return;
    await notify({orgId,projectId,noteId:eventId,note:{body:'Project edit'},edit:after});
  };
}
module.exports = {eligibleLead, createNoteNotifier, createProjectEditNotifier};
