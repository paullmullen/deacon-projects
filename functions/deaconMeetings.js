const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {validOrg, validUid} = require('./membershipPolicy');
const {canReadLeadContact: canReadProject} = require('./portfolioPolicy');

exports.upcomingDeaconMeetings = onCall({region: 'us-central1', invoker: 'public'}, async request => {
  const orgId = request.data?.orgId;
  if (!validOrg(orgId)) throw new HttpsError('invalid-argument', 'Invalid organization.');
  const db = getFirestore();
  const org = db.collection('organizations').doc(orgId);
  const [meetings, memberSnapshot] = await Promise.all([
    org.collection('deaconMeetings').where('endsAt', '>=', Timestamp.now()).get(),
    request.auth ? org.collection('members').doc(request.auth.uid).get() : null,
  ]);
  const member = memberSnapshot?.data();
  const canManage = member?.role === 'admin' && member.status !== 'inactive';
  const projectIds = new Set(meetings.docs.flatMap(meeting =>
    meeting.get('agenda').map(item => item?.projectId).filter(validUid)));
  const projectRefs = [...projectIds].map(id => org.collection('projects').doc(id));
  const projects = new Map(projectRefs.length
    ? (await db.getAll(...projectRefs)).filter(doc => doc.exists).map(doc => [doc.id, doc.data()])
    : []);

  return {meetings: meetings.docs.map(doc => {
    const {startsAt, endsAt, location, agenda} = doc.data();
    return {
      id: doc.id,
      startsAt: startsAt.toMillis(),
      endsAt: endsAt.toMillis(),
      location,
      agenda: agenda.flatMap(item => {
        if (typeof item?.text === 'string') return [{text: item.text}];
        if (!validUid(item?.projectId)) return [];
        const project = projects.get(item.projectId);
        if (project && canReadProject(project, item.projectId, member)) {
          return [{projectId: item.projectId, title: project.title}];
        }
        return canManage ? [{projectId: item.projectId, title: 'Unavailable project'}] : [];
      }),
    };
  }).sort((a, b) => a.startsAt - b.startsAt)};
});
