const {test} = require('node:test');
const assert = require('node:assert/strict');
const {eligibleLead,createNoteNotifier,createProjectEditNotifier} = require('./noteNotificationService');
const projectPath = 'organizations/elmbrook/projects/project1';
function fixture({project={},member={},user={},fail=false}={}) {
  const records = new Map([
    [projectPath,{title:'Test <project>',projectLeadUid:'lead1',...project}],
    ['organizations/elmbrook/members/lead1',{role:'editor',...member}],
  ]);
  const snapshot = value => ({exists:value!==undefined,data:()=>value});
  const ref = path => ({path,get:async()=>snapshot(records.get(path)),
    collection:part=>({doc:id=>ref(`${path}/${part}/${id}`)}),
    update:async patch=>records.set(path,{...records.get(path),...patch})});
  let lock = Promise.resolve();
  const db = {doc:ref, runTransaction:callback=>{
    const next=lock.then(()=>callback({get:r=>r.get(),create:(r,data)=>{
      assert(!records.has(r.path));records.set(r.path,data);
    }}));lock=next.catch(()=>{});return next;
  }};
  const sent=[];
  const dependencies={db,auth:{getUser:async()=>({email:'trusted@example.org',emailVerified:true,...user})},
    sendEmail:async mail=>{sent.push(mail);if(fail)throw Error('SMTP unavailable');return {messageId:'test-id'};},
    timestamp:()=>123,logger:{error:()=>{}},appUrl:'https://deaconprojects.web.app'};
  const notify=createNoteNotifier(dependencies);
  const notifyEdit=createProjectEditNotifier(dependencies);
  const event={orgId:'elmbrook',projectId:'project1',noteId:'note1',note:{body:'Confidential note text',editorUid:'author1',editorName:'Author'}};
  return {notify,notifyEdit,event,sent,records};
}
test('lead eligibility excludes viewers, inactive members, and missing membership',()=>{
  assert(eligibleLead({role:'editor'}));assert(eligibleLead({role:'admin'}));
  for(const member of [null,{role:'viewer'},{role:'editor',status:'inactive'}])assert(!eligibleLead(member));
});
test('new notes notify the trusted lead email without including note contents',async()=>{
  const f=fixture();await f.notify(f.event);assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].to,'trusted@example.org');
  assert(f.sent[0].text.includes('/org/elmbrook/projects/project1'));
  assert(!JSON.stringify(f.sent[0]).includes('Confidential note text'));
  assert(f.sent[0].html.includes('Test &lt;project&gt;'));
});
test('concurrent duplicate events make only one send attempt',async()=>{
  const f=fixture();await Promise.all([f.notify(f.event),f.notify(f.event)]);
  assert.equal(f.sent.length,1);
  assert.equal(f.records.get(`${projectPath}/notes/note1/emailDeliveries/projectLead`).status,'sent');
});
test('unlinked leads, viewers, inactive and disabled accounts do not receive notifications',async()=>{
  for(const options of [{project:{projectLeadUid:''}},{project:{projectLeadUid:'bad/path'}},{member:{role:'viewer'}},{member:{status:'inactive'}},{user:{disabled:true}},{user:{emailVerified:false}},{user:{email:''}}]){
    const f=fixture(options);await f.notify(f.event);assert.equal(f.sent.length,0);
  }
});
test('legacy notes are not announced and new notes notify even when the lead is the author',async()=>{
  const f=fixture();await f.notify({...f.event,noteId:'current'});assert.equal(f.sent.length,0);
  await f.notify({...f.event,note:{...f.event.note,editorUid:'lead1'}});assert.equal(f.sent.length,1);
});
test('SMTP failure is recorded and redelivery does not duplicate a possibly accepted message',async()=>{
  const f=fixture({fail:true});await f.notify(f.event);await f.notify(f.event);
  assert.equal(f.sent.length,1);
  assert.equal(f.records.get(`${projectPath}/notes/note1/emailDeliveries/projectLead`).status,'failed');
});

function editEvent(f, patch={}) {
  const before={title:'Original title',projectLeadUid:'lead1',updatedAt:1};
  const after={...before,title:'Updated project',updatedBy:'author1',updatedAt:2,...patch};
  f.records.set(projectPath, after);
  f.records.set('organizations/elmbrook/members/author1',{role:'editor',displayName:'Editor <Name>'});
  return {orgId:'elmbrook',projectId:'project1',eventId:'event1',before,after};
}
test('project edits by another person notify the lead with trusted membership display name',async()=>{
  const f=fixture();await f.notifyEdit(editEvent(f));assert.equal(f.sent.length,1);
  assert(f.sent[0].text.includes('project leader for Updated project'));
  assert(f.sent[0].text.includes('just edited by Editor <Name>'));
  assert(f.sent[0].html.includes('Editor &lt;Name&gt;'));
  assert(f.sent[0].html.includes('>Updated project</a>'));
});
test('lead edits and saves without a content change do not send edit email',async()=>{
  for(const patch of [{updatedBy:'lead1'},{title:'Original title'},{title:'Original title',priority:2},{updatedBy:undefined},{updatedAt:1}]){
    const f=fixture();await f.notifyEdit(editEvent(f,patch));assert.equal(f.sent.length,0);
  }
});
test('edit event redelivery sends once and a later event sends a new notification',async()=>{
  const f=fixture();const event=editEvent(f);
  await Promise.all([f.notifyEdit(event),f.notifyEdit(event)]);assert.equal(f.sent.length,1);
  await f.notifyEdit({...event,eventId:'event2'});assert.equal(f.sent.length,2);
});
test('stale edits do not notify a newly reassigned lead',async()=>{
  const f=fixture();const event=editEvent(f);
  f.records.set(projectPath,{...event.after,projectLeadUid:'lead2'});
  await f.notifyEdit(event);assert.equal(f.sent.length,0);
});
test('notes explain lead subscription and retain the requested new-note wording',async()=>{
  const f=fixture();await f.notify(f.event);
  assert(f.sent[0].text.includes('You are receiving this message because you are the project leader'));
  assert(f.sent[0].text.includes('That project has a new comment/meeting note.'));
  assert(f.sent[0].text.includes('If you were not expecting updates'));
});
