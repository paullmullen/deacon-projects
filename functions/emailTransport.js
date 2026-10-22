// Adapted from VolunteerKisok/functions/emailTransport.js (same secret names).
const nodemailer = require('nodemailer');
const { defineSecret } = require('firebase-functions/params');
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
const SMTP_FROM = defineSecret('SMTP_FROM');
const SMTP_REPLY_TO = defineSecret('SMTP_REPLY_TO');
const emailSecrets = [SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,SMTP_FROM,SMTP_REPLY_TO];
async function sendEmail({to,subject,text,html}) {
  const port = Number((SMTP_PORT.value() || '587').trim());
  const host = (SMTP_HOST.value() || '').trim();
  const user = (SMTP_USER.value() || '').trim();
  const pass = (SMTP_PASSWORD.value() || '').trim();
  const from = (SMTP_FROM.value() || '').trim();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !host || !user || !pass || !from) throw new Error('Invalid or missing SMTP configuration');
  const transporter = nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});
  return transporter.sendMail({from,to,replyTo:(SMTP_REPLY_TO.value() || '').trim() || undefined,subject,text,html});
}
module.exports = {sendEmail,emailSecrets};
