const {test} = require('node:test');
const assert = require('node:assert/strict');
const {eligibleLead,createNoteNotifier} = require('./noteNotificationService');
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
  const notify=createNoteNotifier({db,auth:{getUser:async()=>({email:'trusted@example.org',emailVerified:true,...user})},
    sendEmail:async mail=>{sent.push(mail);if(fail)throw Error('SMTP unavailable');return {messageId:'test-id'};},
    timestamp:()=>123,logger:{error:()=>{}},appUrl:'https://deaconprojects.web.app'});
  const event={orgId:'elmbrook',projectId:'project1',noteId:'note1',note:{body:'Confidential note text',editorUid:'author1',editorName:'Author'}};
  return {notify,event,sent,records};
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
