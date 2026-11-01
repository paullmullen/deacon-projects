const {test}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,query,where,setDoc,getDoc,getDocs,updateDoc,deleteDoc,serverTimestamp,writeBatch}=require('firebase/firestore');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
test('Special Access confines edits, notes, lifecycle and uploads to assigned confidential projects',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-special-access',
    firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')},
    storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync('storage.rules','utf8')}});
  const root='organizations/access-test';
  const path=id=>`${root}/projects/${id}`;
  try {
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,`${root}/members/special`),{role:'special_access',projectIds:['assigned','public','closed','archived','draft']});
      await setDoc(doc(db,`${root}/members/viewer`),{role:'viewer'});
      await setDoc(doc(db,`${root}/members/editor`),{role:'editor'});
      await setDoc(doc(db,`${root}/members/inactive`),{role:'special_access',status:'inactive',projectIds:['assigned']});
      for(const id of ['assigned','other','public','closed','archived','draft']){
        await setDoc(doc(db,path(id)),{title:id,status:id==='closed'?'closed':id==='draft'?'draft':'active',visibility:id==='public'?'public':'private',archived:id==='archived'});
        await setDoc(doc(db,`${path(id)}/notes/existing`),{body:'Confidential discussion'});
      }
    });
    const special=env.authenticatedContext('special');const db=special.firestore();
    // Both the portfolio query and direct requests enforce assignments.
    await assertFails(getDocs(collection(db,`${root}/projects`)));
    await assertSucceeds(getDocs(query(collection(db,`${root}/projects`),where('visibility','==','public'))));
    for(const id of ['assigned','public','closed','archived','draft'])await assertSucceeds(getDoc(doc(db,path(id))));
    await assertFails(getDoc(doc(db,path('other'))));
    await assertFails(getDocs(collection(db,`${path('other')}/attachments`)));
    await assertFails(getDocs(collection(db,`${path('other')}/history`)));
    await assertSucceeds(getDocs(collection(db,`${path('assigned')}/history`)));
    await assertSucceeds(getDocs(collection(env.authenticatedContext('viewer').firestore(),`${root}/projects`)));
    await env.withSecurityRulesDisabled(async ctx=>{
      for(const id of ['assigned','other'])await uploadBytes(ref(ctx.storage(),`${path(id)}/attachments/seed/file`),new Uint8Array([1]),{contentType:'application/pdf'});
    });
    await assertSucceeds(getBytes(ref(special.storage(),`${path('assigned')}/attachments/seed/file`)));
    await assertFails(getBytes(ref(special.storage(),`${path('other')}/attachments/seed/file`)));

    await assertSucceeds(updateDoc(doc(db,path('assigned')),{title:'Updated',updatedBy:'special',updatedAt:serverTimestamp()}));
    const briefFields=Object.fromEntries(['shortDescription','longDescription','purpose','leadDeacon','teamMembers','stakeholders','kickoffDate','targetDate','actualDate','expectedOutcome','deliverables','assumptions','barriers','accomplishments','nextSteps','decisionsNeeded','links','projectSponsor','statusNote','scope','nextReviewDate','workingDetails'].map(key=>[key,'Full form save']));
    await assertSucceeds(updateDoc(doc(db,path('assigned')),{...briefFields,assumptionsTable:[],nextStepsTable:[],supportingDocuments:[],deliverableCategories:[],deaconRole:'leadership',projectLeadUid:'special',visibility:'private',updatedBy:'special',updatedAt:serverTimestamp(),progressEditedAt:serverTimestamp()}));
    const metadata={name:'brief.pdf',title:'Brief',description:'',size:2,contentType:'application/pdf',uploadedBy:'special',uploadedByName:'Special User',createdAt:serverTimestamp(),status:'uploading'};
    await assertSucceeds(setDoc(doc(db,`${path('assigned')}/attachments/file1`),metadata));
    await assertFails(setDoc(doc(db,`${path('other')}/attachments/file1`),metadata));
    for(const id of ['other','public','closed','archived'])await assertFails(updateDoc(doc(db,path(id)),{title:'Denied',updatedBy:'special',updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(db,path('assigned')),{visibility:'public'}));
    await assertFails(updateDoc(doc(db,path('assigned')),{priority:1}));
    await assertFails(setDoc(doc(db,`${root}/members/special`),{role:'admin'}));
    await assertFails(setDoc(doc(db,path('new')),{title:'New',status:'draft',visibility:'private',createdBy:'special'}));
    for(const id of ['assigned','closed','archived'])await assertSucceeds(getDocs(collection(db,`${path(id)}/notes`)));
    for(const id of ['other','public'])await assertFails(getDocs(collection(db,`${path(id)}/notes`)));
    const note={body:'New comment',editorUid:'special',editorName:'Special User',editedAt:serverTimestamp()};
    await assertSucceeds(setDoc(doc(db,`${path('assigned')}/notes/new`),note));
    for(const id of ['other','public','closed','archived'])await assertFails(setDoc(doc(db,`${path(id)}/notes/new`),note));
    const batch=writeBatch(db);batch.update(doc(db,path('draft')),{status:'proposed',lastEventId:'propose',updatedBy:'special',updatedAt:serverTimestamp()});
    batch.set(doc(db,`${path('draft')}/history/propose`),{action:'propose',fromStatus:'draft',toStatus:'proposed',actorUid:'special',at:serverTimestamp()});
    await assertSucceeds(batch.commit());
    const upload=(ctx,id)=>uploadBytes(ref(ctx.storage(),`${path(id)}/attachments/file1/file`),new Uint8Array([1,2]),{contentType:'application/pdf',contentDisposition:'attachment'});
    await assertSucceeds(upload(special,'assigned'));
    for(const id of ['other','public','closed','archived'])await assertFails(upload(special,id));
    const inactive=env.authenticatedContext('inactive').firestore();
    await assertFails(getDoc(doc(inactive,path('assigned'))));
    await assertFails(getDocs(collection(inactive,`${path('assigned')}/notes`)));
    await assertFails(updateDoc(doc(inactive,path('assigned')),{title:'Denied'}));
    await assertFails(updateDoc(doc(env.authenticatedContext('viewer').firestore(),path('assigned')),{title:'Denied'}));
    await assertSucceeds(updateDoc(doc(env.authenticatedContext('editor').firestore(),path('other')),{title:'Editor works'}));
    // Revocation is enforced on the next request even with an existing auth session.
    await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),`${root}/members/special`),{projectIds:[]}));
    await assertFails(updateDoc(doc(db,path('assigned')),{title:'Revoked'}));
    await assertFails(getDocs(collection(db,`${path('assigned')}/notes`)));
    await assertFails(upload(special,'draft'));
    await assertFails(getDoc(doc(db,path('assigned'))));
    await assertFails(getDocs(collection(db,`${path('assigned')}/attachments`)));
    await assertFails(getDocs(collection(db,`${path('assigned')}/history`)));
    await assertFails(getBytes(ref(special.storage(),`${path('assigned')}/attachments/seed/file`)));
    await assertSucceeds(getDoc(doc(db,path('public'))));
  } finally {await env.cleanup();}
});
