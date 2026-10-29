const {initializeApp,getApps} = require('firebase-admin/app');
if (!getApps().length) initializeApp();
Object.assign(exports,require('./lifecycleNotifications'));

Object.assign(exports,require('./membershipAdmin'));
Object.assign(exports,require('./authEmails'));

Object.assign(exports,require('./projectLeads'));

Object.assign(exports,require('./attachmentCleanup'));
