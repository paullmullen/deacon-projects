const {initializeApp,getApps} = require('firebase-admin/app');
if (!getApps().length) initializeApp();
Object.assign(exports,require('./lifecycleNotifications'));
