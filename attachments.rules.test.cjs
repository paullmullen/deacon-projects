const fs=require('node:fs');
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,deleteDoc,getDoc,getDocs,collection,writeBatch,serverTimestamp}=require('firebase/firestore');
const {ref,uploadBytes,getBytes,updateMetadata,deleteObject}=require('firebase/storage');
let env;
const root='organizations/attachment-org';
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-project-attachments',
    firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')},
    storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync('storage.rules','utf8')},
  });
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const [uid,role,status]of [['editor','editor','active'],['viewer','viewer','active'],['inactive','editor','inactive']])await setDoc(doc(db,root,'members',uid),{role,status});
    for(const [id,status,visibility]of [['public','active','public'],['private','active','private'],['draft','draft','public'],['closed','closed','public']])await setDoc(doc(db,root,'projects',id),{title:id,status,visibility});
  });
});
after(async()=>{if(env)await env.cleanup();});
const context=uid=>uid?env.authenticatedContext(uid):env.unauthenticatedContext();
const fileRef=(uid,id='private',fileId='document1')=>doc(context(uid).firestore(),root,'projects',id,'attachments',fileId);
const data=()=>({name:'Brief.pdf',title:'Project brief',description:'',size:4,contentType:'application/pdf',uploadedBy:'editor',uploadedByName:'Editor',createdAt:serverTimestamp(),status:'uploading'});
const objectRef=(uid,id='private',fileId='document1')=>ref(context(uid).storage(),`${root}/projects/${id}/attachments/${fileId}/file`);
test('only active editors can stage files, and metadata is validated',async()=>{
  await assertSucceeds(setDoc(fileRef('editor'),data()));
  await assertFails(setDoc(fileRef('viewer','private','viewer-file'),{...data(),uploadedBy:'viewer'}));
  await assertFails(setDoc(fileRef('inactive','private','inactive-file'),{...data(),uploadedBy:'inactive'}));
  await assertFails(setDoc(fileRef('editor','closed'),data()));
  await assertFails(setDoc(fileRef('editor','private','invalid'),{...data(),size:26214401}));
  await assertFails(setDoc(fileRef('editor','private','spoofed'),{...data(),uploadedBy:'other'}));
});
test('uploads enforce role, project scope, content type and object immutability',async()=>{
  await assertSucceeds(uploadBytes(objectRef('editor'),new Uint8Array([1,2,3,4]),{contentType:'application/pdf',contentDisposition:'attachment'}));
  await assertFails(uploadBytes(objectRef('editor'),new Uint8Array([5]),{contentType:'application/pdf',contentDisposition:'attachment'}));
  assert.deepEqual([...new Uint8Array(await getBytes(objectRef('editor')))], [1,2,3,4]);
  await assertFails(updateMetadata(objectRef('editor'),{contentType:'text/plain'}));
  await assertFails(deleteObject(objectRef('editor')));
  await assertFails(uploadBytes(objectRef('viewer','private','viewer-upload'),new Uint8Array([1]),{contentType:'application/pdf',contentDisposition:'attachment'}));
  await assertFails(uploadBytes(objectRef('editor','closed','closed-upload'),new Uint8Array([1]),{contentType:'application/pdf',contentDisposition:'attachment'}));
  await assertFails(uploadBytes(objectRef('editor','private','html'),new Uint8Array([1]),{contentType:'text/html',contentDisposition:'attachment'}));
  await assertFails(getBytes(objectRef(null)));
  await assertSucceeds(getBytes(objectRef('viewer')));
  await assertFails(getBytes(objectRef('inactive')));
  await assertFails(getBytes(ref(context('editor').storage(),'organizations/other-org/projects/private/attachments/document1/file')));
});
test('ready publication requires an atomic project edit stamp',async()=>{
  await assertFails(updateDoc(fileRef('editor'),{status:'ready'}));
  const db=context('editor').firestore(),batch=writeBatch(db);
  batch.update(doc(db,root,'projects','private'),{attachmentsEditedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:'editor'});
  batch.update(doc(db,root,'projects','private','attachments','document1'),{status:'ready'});
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(fileRef('editor'),{name:'Replaced.pdf'}));
  await assertFails(deleteDoc(fileRef('viewer')));
});
test('public attachments follow project visibility and drafts stay private',async()=>{
  await assertSucceeds(setDoc(fileRef('editor','public'),data()));
  await assertSucceeds(uploadBytes(objectRef('editor','public'),new Uint8Array([1]),{contentType:'application/pdf',contentDisposition:'attachment'}));
  await assertSucceeds(getBytes(objectRef(null,'public')));
  await assertSucceeds(getDocs(collection(context(null).firestore(),root,'projects','public','attachments')));
  await assertFails(getDoc(fileRef(null,'draft')));
  await assertFails(getDocs(collection(context(null).firestore(),root,'projects','private','attachments')));
  const db=context('editor').firestore();
  await assertSucceeds(updateDoc(doc(db,root,'projects','public'),{visibility:'private',updatedAt:serverTimestamp(),updatedBy:'editor'}));
  await assertFails(getBytes(objectRef(null,'public')));
});
