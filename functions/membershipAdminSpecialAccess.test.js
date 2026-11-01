const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {inviteId}=require('./membershipPolicy');
function fixture(){
  const root='organizations/org1';
  const records=new Map([
    [`${root}/members/admin1`,{role:'admin'}],
    [`${root}/members/user1`,{role:'viewer'}],
    [`${root}/projects/confidential`,{visibility:'private'}],
    [`${root}/projects/public`,{visibility:'public'}],
  ]);
  const snapshot=path=>({exists:records.has(path),get:key=>records.get(path)?.[key],data:()=>records.get(path)});
  const doc=path=>({path,get:async()=>snapshot(path),set:async data=>records.set(path,data),delete:async()=>records.delete(path)});
  const db={doc,collection:path=>({doc:id=>doc(`${path}/${id}`),where:(key,op,value)=>({query:true,path,key,value})}),runTransaction:async handler=>handler({
    get:async ref=>ref.query?{docs:[...records].filter(([path,data])=>path.startsWith(ref.path+'/')&&data[ref.key]===ref.value).map(([path])=>snapshot(path)),size:1}:snapshot(ref.path),
    update:(ref,patch)=>records.set(ref.path,{...records.get(ref.path),...patch}),
    set:(ref,data)=>records.set(ref.path,{...records.get(ref.path),...data}),
    create:(ref,data)=>{assert.equal(records.has(ref.path),false);records.set(ref.path,data);},
  })};
  class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
  const dependencies={
    'firebase-functions/v2/https':{onCall:(options,handler)=>handler,HttpsError},
    'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>123}},
    'firebase-admin/auth':{getAuth:()=>({getUser:async uid=>({uid,email:'user@example.com',emailVerified:true,displayName:'User'})})},
    './emailTransport':{sendEmail:async()=>{},emailSecrets:[]},
  };
  const api={};
  const load=vm.runInThisContext(`(function(require,exports){${fs.readFileSync(__dirname+'/membershipAdmin.js','utf8')}\n})`);
  load(name=>dependencies[name]||require(name),api);
  const request=(data,uid='admin1')=>({auth:uid?{uid}:null,data:{orgId:'org1',...data}});
  return {api,records,root,request};
}
test('only active administrators can assign Special Access, and assignments stay within confidential tenant projects',async()=>{
  const {api,records,root,request}=fixture();
  for(const uid of [null,'user1'])await assert.rejects(api.changeMemberRole(request({uid:'user1',role:'special_access',projectIds:['confidential']},uid)));
  for(const projectIds of [['public'],['missing'],['../outside'],['confidential','confidential']])await assert.rejects(api.changeMemberRole(request({uid:'user1',role:'special_access',projectIds})),{code:'invalid-argument'});
  assert.equal(records.get(`${root}/members/user1`).role,'viewer');
  await api.changeMemberRole(request({uid:'user1',role:'special_access',projectIds:['confidential']}));
  assert.deepEqual(records.get(`${root}/members/user1`).projectIds,['confidential']);
  await api.changeMemberRole(request({uid:'user1',role:'special_access',projectIds:[]}));
  assert.deepEqual(records.get(`${root}/members/user1`).projectIds,[]);
  await api.changeMemberRole(request({uid:'user1',role:'editor'}));
  assert.deepEqual(records.get(`${root}/members/user1`).projectIds,[]);
  records.set(`${root}/members/admin1`,{role:'admin',status:'inactive'});
  await assert.rejects(api.changeMemberRole(request({uid:'user1',role:'special_access',projectIds:['confidential']})),{code:'permission-denied'});
});
test('Special Access invitation assignments survive acceptance and resending',async()=>{
  const {api,records,root,request}=fixture();
  const data={email:'new@example.com',role:'special_access',projectIds:['confidential']};
  await api.inviteMember(request(data));
  await api.inviteMember(request(data));
  const invitation=records.get(`${root}/invitations/${inviteId(data.email)}`);
  assert.deepEqual(invitation.projectIds,['confidential']);
  const token='a'.repeat(64);
  records.set(`${root}/invitations/${inviteId('user@example.com')}`,{...invitation,email:'user@example.com',tokenHash:createHash('sha256').update(token).digest('hex')});
  await api.acceptInvitation(request({token},'new-user'));
  const member=records.get(`${root}/members/new-user`);
  assert.equal(member.role,'special_access');
  assert.deepEqual(member.projectIds,['confidential']);
});
