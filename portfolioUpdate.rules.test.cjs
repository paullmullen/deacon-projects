const {test}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,collection,getDocs,serverTimestamp}=require('firebase/firestore');
test('portfolio drafts are private to their active admin owner',async()=>{
  const env=await initializeTestEnvironment({projectId:'demo-portfolio-update',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
  try {
    await env.withSecurityRulesDisabled(async ctx=>{
      for(const [uid,role,status] of [['admin','admin','active'],['other','admin','active'],['editor','editor','active'],['viewer','viewer','active'],['special','special_access','active'],['inactive','admin','inactive']])
        await setDoc(doc(ctx.firestore(),`organizations/test/members/${uid}`),{role,status});
    });
    const path='organizations/test/portfolioUpdates/admin';
    const db=env.authenticatedContext('admin').firestore();
    const draft={statuses:['draft'],includeConfidential:false,excluded:[],updatedAt:serverTimestamp()};
    await assertSucceeds(setDoc(doc(db,path),draft));
    await assertSucceeds(setDoc(doc(db,`${path}/entries/project`),{insights:'Private',recommendation:'Ready',reviewedAt:new Date().toISOString()}));
    await assertSucceeds(getDocs(collection(db,`${path}/entries`)));
    for(const uid of ['other','editor','viewer','special','inactive',null]) {
      const denied=uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(denied,path)));
      await assertFails(getDocs(collection(denied,`${path}/entries`)));
      await assertFails(setDoc(doc(denied,path),draft));
      await assertFails(setDoc(doc(denied,`${path}/entries/project`),{insights:'overwrite',recommendation:'',reviewedAt:''}));
      if(uid && uid!=='other') await assertFails(setDoc(doc(denied,`organizations/test/portfolioUpdates/${uid}`),draft));
    }
    await assertFails(setDoc(doc(db,`${path}/entries/project`),{insights:'a'.repeat(10001),recommendation:'',reviewedAt:''}));
  } finally {await env.cleanup();}
});
