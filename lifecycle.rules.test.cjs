const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, query, where, updateDoc, writeBatch, serverTimestamp } = require('firebase/firestore');

(async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'deaconprojects';
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
  const root = 'organizations/rules-test-org';
  const path = id => `${root}/projects/${id}`;
  const seedDraft = async id => env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path(id)), {
      title: id, status: 'draft', visibility: 'private', createdBy: 'editor1'
    });
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, root), { name: 'Rules Test' });
      await setDoc(doc(db, `${root}/members/editor1`), { role: 'editor' });
      await setDoc(doc(db, `${root}/members/viewer1`), { role: 'viewer' });
    });
    const visitor = env.unauthenticatedContext().firestore();
    await env.withSecurityRulesDisabled(async context => {
      for (const status of ['draft', 'proposed', 'active', 'closed']) {
        for (const visibility of ['public', 'private']) {
          await setDoc(doc(context.firestore(), path(`${visibility}-${status}`)), {
            title: 'Shared brief', status, visibility
          });
        }
      }
    });
    for (const status of ['draft', 'proposed', 'active', 'closed']) {
      await assertSucceeds(getDoc(doc(visitor, path(`public-${status}`))));
      await assertFails(getDoc(doc(visitor, path(`private-${status}`))));
      await assertFails(updateDoc(doc(visitor, path(`public-${status}`)), { title: 'Unauthorized edit' }));
    }
    await assertSucceeds(getDocs(query(collection(visitor, `${root}/projects`),
      where('visibility', '==', 'public'), where('status', 'in', ['proposed', 'active', 'closed']))));
    await assertFails(getDocs(collection(visitor, `${root}/projects`)));
    await assertFails(getDocs(collection(visitor, path('public-draft'), 'notes')));
    await assertFails(getDocs(collection(visitor, path('public-draft'), 'history')));
    console.log('PASS: public direct links work at every stage; confidential briefs, edits, notes and history stay protected');
    const editor = env.authenticatedContext('editor1').firestore();
    const viewer = env.authenticatedContext('viewer1').firestore();
    await seedDraft('valid');
    const project = doc(editor, path('valid'));
    const history = doc(collection(project, 'history'));
    const event = { action: 'propose', fromStatus: 'draft', toStatus: 'proposed', actorUid: 'editor1', at: serverTimestamp() };
    const batch = writeBatch(editor);
    batch.update(project, { status: 'proposed', updatedAt: serverTimestamp(), lastEventId: history.id });
    batch.set(history, event);
    try {
      await assertSucceeds(batch.commit());
      console.log('PASS: editor can propose with matching history');
    } catch (e) {
      console.error('FAIL: valid editor lifecycle batch denied:', e.code, e.message);
      process.exitCode = 1;
    }

    await seedDraft('no-history');
    await assertFails(updateDoc(doc(editor, path('no-history')), {
      status: 'proposed', updatedAt: serverTimestamp(), lastEventId: 'missing'
    }));
    console.log('PASS: status change without history rejected');

    await seedDraft('viewer-test');
    const viewerProject = doc(viewer, path('viewer-test'));
    const viewerHistory = doc(collection(viewerProject, 'history'));
    const viewerBatch = writeBatch(viewer);
    viewerBatch.update(viewerProject, { status: 'proposed', updatedAt: serverTimestamp(), lastEventId: viewerHistory.id });
    viewerBatch.set(viewerHistory, { ...event, actorUid: 'viewer1' });
    await assertFails(viewerBatch.commit());
    console.log('PASS: viewer cannot propose');

    await seedDraft('mismatch-test');
    const mismatchProject = doc(editor, path('mismatch-test'));
    const mismatchHistory = doc(collection(mismatchProject, 'history'));
    const mismatchBatch = writeBatch(editor);
    mismatchBatch.update(mismatchProject, { status: 'proposed', updatedAt: serverTimestamp(), lastEventId: mismatchHistory.id });
    mismatchBatch.set(mismatchHistory, { ...event, toStatus: 'active' });
    await assertFails(mismatchBatch.commit());
    console.log('PASS: mismatched history rejected');
  } finally {
    await env.cleanup();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
