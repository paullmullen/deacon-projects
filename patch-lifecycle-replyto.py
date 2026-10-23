"""Run from project root: python patch-lifecycle-replyto.py
Updates existing lifecycleNotifications.js in place; creates .m5-backup first.
"""
from pathlib import Path
p=Path('functions/lifecycleNotifications.js')
s=p.read_text()
needle='const result=await sendEmail({to:email,subject,text,html});'
if needle not in s:
    raise SystemExit('Existing sendEmail call differs; no changes made. Please merge manually.')
if 'tenantReplyTo' in s:
    raise SystemExit('Already patched.')
anchor='  const db = getFirestore();'
if anchor not in s:
    raise SystemExit('Firestore initialization differs; no changes made.')
s=s.replace(anchor,anchor+'''
  const tenantEmailSnap = await db.doc(`organizations/${orgId}/settings/email`).get();
  const tenantSettings = tenantEmailSnap.exists ? tenantEmailSnap.data() : {};
  const tenantReplyTo = tenantSettings.replyToEmail
    ? (tenantSettings.replyToName
      ? `"${String(tenantSettings.replyToName).replace(/["\\r\\n]/g, '')}" <${tenantSettings.replyToEmail}>`
      : tenantSettings.replyToEmail)
    : undefined;
''',1)
s=s.replace(needle,'const result=await sendEmail({to:email,subject,text,html,replyTo:tenantReplyTo});',1)
backup=p.with_suffix('.js.m5-backup')
if backup.exists():raise SystemExit('Backup already exists; no changes made.')
backup.write_text(p.read_text())
p.write_text(s)
print('Updated',p,'backup:',backup)
