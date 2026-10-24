'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./membershipPolicy');

test('organization identifiers cannot escape tenant paths',()=>{
  for(const org of ['elmbrook','org-1','team_2'])assert.equal(p.validOrg(org),true);
  for(const org of ['','a/b','../other','bad org',null,'x'.repeat(81)])assert.equal(p.validOrg(org),false);
});
test('UID validation rejects malformed paths',()=>{
  assert.equal(p.validUid('uid-123'),true);
  for(const uid of ['','x/y','../admin',null])assert.equal(p.validUid(uid),false);
});
test('email normalization and validation',()=>{
  assert.equal(p.normalizeEmail('  PERSON@Example.org  '),'person@example.org');
  assert.equal(p.validEmail('person@example.org'),true);
  for(const email of ['','person','a@b','x y@example.org','x'.repeat(255),null])assert.equal(p.validEmail(email),false);
});
test('invitation identifiers are stable and case-normalized by caller',()=>{
  const email=p.normalizeEmail(' USER@EXAMPLE.ORG ');
  assert.match(p.inviteId(email),/^[a-f0-9]{64}$/);
  assert.equal(p.inviteId(email),p.inviteId('user@example.org'));
  assert.notEqual(p.inviteId(email),p.inviteId('other@example.org'));
});
test('only organization admin role passes policy',()=>{
  for(const role of ['viewer','editor',undefined,null,'Admin'])assert.equal(p.canAdmin(role),false);
  assert.equal(p.canAdmin('admin'),true);
});
test('role changes forbid self-demotion and self-promotion',()=>{
  for(const role of p.ROLES)assert.equal(p.roleChangeAllowed({actorUid:'alice',targetUid:'alice',targetRole:'admin',newRole:role,adminCount:2}),false);
});
test('role changes protect last admin',()=>{
  const input={actorUid:'alice',targetUid:'bob',targetRole:'admin',newRole:'editor'};
  assert.equal(p.roleChangeAllowed({...input,adminCount:1}),false);
  assert.equal(p.roleChangeAllowed({...input,adminCount:2}),true);
});
test('role changes reject invalid roles and allow valid cross-user changes',()=>{
  const input={actorUid:'alice',targetUid:'bob',targetRole:'viewer',adminCount:1};
  assert.equal(p.roleChangeAllowed({...input,newRole:'owner'}),false);
  assert.equal(p.roleChangeAllowed({...input,newRole:'editor'}),true);
  assert.equal(p.roleChangeAllowed({...input,newRole:'admin'}),true);
  assert.equal(p.roleChangeAllowed({...input,targetUid:'../bad',newRole:'admin'}),false);
});
test('reply-to display names strip CRLF',()=>{
  assert.equal(p.clean('Alice\r\nBcc: victim@example.com'),'Alice Bcc: victim@example.com');
});
