const {test} = require('node:test');
const assert = require('node:assert/strict');
const {publicPortfolioProject,canReadLeadContact} = require('./portfolioPolicy');
test('public draft projection never includes brief contents or contact information',()=>{
  const draft={title:'Draft',status:'draft',visibility:'public',longDescription:'secret',leadDeacon:'Private name',projectLeadUid:'uid',workingDetails:'secret',archived:false};
  assert.deepEqual(publicPortfolioProject('p',draft),{id:'p',title:'Draft',status:'draft',visibility:'public',priority:null});
  assert.equal(publicPortfolioProject('p',{...draft,visibility:'private'}),null);
  assert.equal(publicPortfolioProject('p',{...draft,archived:true}),null);
});
test('contact follows draft and confidential membership restrictions',()=>{
  const draft={visibility:'public',status:'draft'};
  assert.equal(canReadLeadContact(draft,'p',undefined),false);
  assert.equal(canReadLeadContact(draft,'p',{role:'viewer'}),true);
  assert.equal(canReadLeadContact(draft,'p',{role:'viewer',status:'inactive'}),false);
  assert.equal(canReadLeadContact({visibility:'private'},'p',{role:'special_access',projectIds:['other']}),false);
  assert.equal(canReadLeadContact({visibility:'private'},'p',{role:'special_access',projectIds:['p']}),true);
  assert.equal(canReadLeadContact({visibility:'public',status:'active'},'p',undefined),true);
});

test('lead contact for public drafts requires the Special Access assignment',()=>{
  const draft={visibility:'public',status:'draft'};
  assert.equal(canReadLeadContact(draft,'p',{role:'special_access',projectIds:[]}),false);
  assert.equal(canReadLeadContact(draft,'p',{role:'special_access',projectIds:['p']}),true);
  assert.equal(canReadLeadContact(draft,'p',{role:'special_access',status:'inactive',projectIds:['p']}),false);
});
