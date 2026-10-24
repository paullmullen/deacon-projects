'use strict';
const {createHash}=require('node:crypto');
const ROLES=Object.freeze(['viewer','editor','admin']);
const validOrg=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const validUid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const normalizeEmail=v=>typeof v==='string'?v.trim().toLowerCase():'';
const validEmail=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const inviteId=email=>createHash('sha256').update(email).digest('hex');
const canAdmin=role=>role==='admin';
const roleChangeAllowed=({actorUid,targetUid,targetRole,newRole,adminCount})=>
  validUid(actorUid)&&validUid(targetUid)&&ROLES.includes(newRole)&&
  actorUid!==targetUid&&
  !(targetRole==='admin'&&newRole!=='admin'&&adminCount<=1);
module.exports={ROLES,validOrg,validUid,normalizeEmail,validEmail,clean,inviteId,canAdmin,roleChangeAllowed};
