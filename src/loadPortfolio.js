import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
const publicStatuses = ["proposed", "active", "closed"];
export async function loadPortfolio(orgId, role, projectIds = []) {
  if (!role) {
    const result = await httpsCallable(getFunctions(db.app, "us-central1"), "publicPortfolio")({ orgId });
    return result.data.projects;
  }
  const projects = collection(db, "organizations", orgId, "projects");
      if (role === "special_access") {
        const publicSnapshot = await getDocs(query(projects, where("visibility", "==", "public")));
        const assigned = await Promise.all(projectIds.map(id => getDoc(doc(projects, id))));
        const snapshots = [...publicSnapshot.docs, ...assigned.filter(snapshot => snapshot.exists())];
        return [...new Map(snapshots.map(snapshot => [snapshot.id, { id: snapshot.id, ...snapshot.data() }])).values()];
      }
      const q = role ? query(projects) : query(projects,
        where("visibility", "==", "public"), where("status", "in", publicStatuses));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
