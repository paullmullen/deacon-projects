'use strict';
const {isDeepStrictEqual} = require('node:util');
const {createHash} = require('node:crypto');
const eligibleLead = member => !!member && member.status !== 'inactive' && ['editor', 'admin'].includes(member.role);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatLeadEmail({title,url,editorName,isEdit,guidance}) {
  const heading = isEdit ? 'Your project has been updated' : 'A new meeting note was added';
  const summary = isEdit ? `Edited by <strong>${escapeHtml(editorName)}</strong>` : 'A new comment/meeting note is ready to read.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#eef2f5;color:#253540;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(heading)}: ${escapeHtml(title)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef2f5;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dce4ea;">
<tr><td style="padding:22px 28px;background-color:#244e67;"><p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:1.5px;color:#ffffff;">ELMBROOK DEACONS</p><p style="margin:7px 0 0;font-size:11px;letter-spacing:1px;color:#d7e5ed;">PROJECT LEAD NOTIFICATION</p></td></tr>
<tr><td style="padding:28px 28px 12px;"><h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:#253540;">${heading}</h1><p style="margin:0;font-size:20px;font-weight:bold;line-height:1.4;"><a href="${escapeHtml(url)}" style="color:#245b85;text-decoration:underline;">${escapeHtml(title)}</a></p></td></tr>
<tr><td style="padding:8px 28px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#edf4f8;border-left:4px solid #477b9a;"><tr><td style="padding:16px 18px;"><p style="margin:0 0 7px;font-size:11px;letter-spacing:1px;font-weight:bold;color:#53697a;">${isEdit ? 'PROJECT BRIEF UPDATED' : 'NEW COMMENT / MEETING NOTE'}</p><p style="margin:0;font-size:16px;line-height:1.5;color:#253540;">${summary}</p></td></tr></table>
</td></tr>
<tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:15px;line-height:1.6;color:#53697a;">${escapeHtml(guidance)}</p></td></tr>
<tr><td style="padding:0 28px 28px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#245b85" style="background-color:#245b85;border:1px solid #245b85;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:15px;line-height:1.2;font-weight:bold;text-decoration:none;">View project &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e2e8ed;background-color:#f8fafb;"><p style="margin:0;font-size:12px;line-height:1.6;color:#637785;">You are receiving this message because you are the project leader for this project. Sign in to view its latest details and meeting notes.</p></td></tr>
</table></td></tr></table></body></html>`;
}

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
        html:formatLeadEmail({title,url,editorName,isEdit:!!edit,guidance}),
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
module.exports = {eligibleLead, createNoteNotifier, createProjectEditNotifier, formatLeadEmail};
