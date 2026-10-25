const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const {sendEmail,emailSecrets}=require('./emailTransport');
const {validOrg,normalizeEmail,validEmail}=require('./membershipPolicy');
const appUrl=(process.env.PROJECT_APP_URL||'https://deaconprojects.web.app').replace(/\/$/,'');
const options={region:'us-central1',invoker:'public',secrets:emailSecrets};
const limitMs=60*1000;
function fail(code,message){throw new HttpsError(code,message);}
async function throttle(key,interval=limitMs){
  const ref=getFirestore().doc('authEmailLimits/'+createHash('sha256').update(key).digest('hex'));
  return getFirestore().runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(snap.exists&&Date.now()-(snap.get('sentAtMs')||0)<interval)return false;
    tx.set(ref,{sentAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp()});
    return true;
  });
}
function checkOrg(orgId){if(!validOrg(orgId))fail('invalid-argument','Invalid organization.');}
function continueUrl(orgId){return `${appUrl}/org/${encodeURIComponent(orgId)}`;}
exports.sendBrandedVerification=onCall(options,async req=>{
  if(!req.auth)fail('unauthenticated','Sign in first.');
  const orgId=req.data?.orgId;
  checkOrg(orgId);
  const user=await getAuth().getUser(req.auth.uid);
  if(user.emailVerified)return {status:'verified'};
  const email=normalizeEmail(user.email);
  if(!validEmail(email))fail('failed-precondition','A valid account email is required.');
  if(!await throttle('verify:'+user.uid))return {status:'recently-sent'};
  const link=await getAuth().generateEmailVerificationLink(email,{url:continueUrl(orgId)});
  try{
    await sendEmail({
      to:email,
      subject:'Verify your email for DeaconProjects',
      text:`Hello ${user.displayName||'there'},\n\nWelcome to DeaconProjects. Verify your email address using the secure link below:\n\n${link}\n\nAfter verification, return to ${continueUrl(orgId)} to activate your invitation.\n\nIf you did not create this account, ignore this message.\n\nElmbrook DeaconProjects`,
    });
  }catch(error){console.error('Verification email delivery failed',error);fail('unavailable','Unable to send verification email. Please try again later.');}
  return {status:'sent'};
});
exports.sendBrandedPasswordReset=onCall(options,async req=>{
  const orgId=req.data?.orgId;
  checkOrg(orgId);
  const email=normalizeEmail(req.data?.email);
  if(!validEmail(email))fail('invalid-argument','Enter a valid email address.');
  // Generic responses avoid exposing which email addresses are registered.
  if(!await throttle('reset:'+email,5*60*1000))return {ok:true};
  let user;
  try{user=await getAuth().getUserByEmail(email);}
  catch(error){
    if(error.code==='auth/user-not-found')return {ok:true};
    console.error('Password reset lookup failed',error);
    fail('unavailable','Unable to process password reset right now.');
  }
  if(!user||user.disabled)return {ok:true};
  const link=await getAuth().generatePasswordResetLink(email,{url:continueUrl(orgId)});
  try{
    await sendEmail({
      to:email,
      subject:'Reset your DeaconProjects password',
      text:`Hello ${user.displayName||'there'},\n\nA password reset was requested for your DeaconProjects account. Set a new password using this secure link:\n\n${link}\n\nIf you did not request a password reset, ignore this message.\n\nElmbrook DeaconProjects`,
    });
  }catch(error){console.error('Password reset email delivery failed',error);fail('unavailable','Unable to process password reset right now.');}
  return {ok:true};
});
