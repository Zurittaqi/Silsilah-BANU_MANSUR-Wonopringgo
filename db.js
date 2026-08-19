/* ============================================================
   db.js — Lapisan Penyimpanan: IndexedDB (lokal) + Firebase (sinkronisasi)
   Arsitektur: UI → IndexedDB → Firebase Sync → Backup JSON
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHQpABAZ5yTkPA9O44XZK1yvCGyBfN9uU",
  authDomain: "bani-kuzari-pedigree.firebaseapp.com",
  projectId: "bani-kuzari-pedigree",
  storageBucket: "bani-kuzari-pedigree.firebasestorage.app",
  messagingSenderId: "275802499453",
  appId: "1:275802499453:web:a5013654f81d718d984414"
};

let db_firestore = null, db_auth = null;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db_firestore = firebase.firestore();
  db_auth      = firebase.auth();
} catch (e) {
  console.error('Firebase gagal diinisialisasi:', e);
}

/* ===== IndexedDB ===== */
const IDB_NAME = 'silsilah_banu_mansur';
const IDB_VER  = 1;
let idb = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (idb) { resolve(idb); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('people'))
        d.createObjectStore('people', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta'))
        d.createObjectStore('meta');
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbGetAll() {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction('people', 'readonly');
    const req = tx.objectStore('people').getAll();
    req.onsuccess = () => {
      const obj = {};
      req.result.forEach(r => { obj[r.id] = r; delete obj[r.id].id; });
      resolve(obj);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function idbGetMeta(key) {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbPutMeta(key, value) {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction('meta', 'readwrite');
    const req = tx.objectStore('meta').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbPutPerson(id, data) {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction('people', 'readwrite');
    const req = tx.objectStore('people').put({ ...data, id });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbDeletePerson(id) {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction('people', 'readwrite');
    const req = tx.objectStore('people').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbClearAll() {
  const d = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(['people', 'meta'], 'readwrite');
    tx.objectStore('people').clear();
    tx.objectStore('meta').clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

/* ===== Sync Conflict: Firebase Menang (last-write-wins) ===== */
// Strategi sederhana: Firebase dianggap source-of-truth.
// IndexedDB hanya cache lokal untuk offline. Saat online, perubahan
// lokal langsung dikirim ke Firebase (optimistic write). Saat ada
// perbedaan saat sinkronisasi online, Firebase selalu menang.

let unsubPeople = null, unsubMeta = null;

function startRealtimeSync(onData) {
  if (!db_firestore) return;

  unsubPeople = db_firestore.collection('people').onSnapshot(async snap => {
    const loaded = {};
    snap.forEach(doc => { loaded[doc.id] = doc.data(); });
    // tulis ke IndexedDB
    for (const [id, data] of Object.entries(loaded)) {
      await idbPutPerson(id, data).catch(() => {});
    }
    onData({ type: 'people', data: loaded });
  }, err => console.error('Sync people gagal:', err));

  unsubMeta = db_firestore.collection('meta').doc('tree').onSnapshot(async doc => {
    if (doc.exists && Array.isArray(doc.data().rootIds)) {
      const rootIds = doc.data().rootIds;
      await idbPutMeta('rootIds', rootIds).catch(() => {});
      onData({ type: 'meta', data: rootIds });
    }
  }, err => console.error('Sync meta gagal:', err));
}

function stopRealtimeSync() {
  if (unsubPeople) { unsubPeople(); unsubPeople = null; }
  if (unsubMeta)   { unsubMeta();   unsubMeta   = null; }
}

/* ===== Load data: IndexedDB dulu, Firebase sebagai sinkronisasi ===== */
async function loadDataLocal() {
  const people  = await idbGetAll().catch(() => ({}));
  const rootIds = await idbGetMeta('rootIds').catch(() => null) || [];
  return { people, rootIds };
}

/* ===== Tulis ke IndexedDB + Firebase ===== */
let pendingSaves = 0;
function setSaveStatus(mode, text) {
  const el  = document.getElementById('saveStatus');
  const txt = document.getElementById('saveStatusText');
  if (!el || !txt) return;
  el.className  = 'save-status' + (mode ? ' ' + mode : '');
  txt.textContent = text;
}
function refreshSaveStatus() {
  if (!navigator.onLine) { setSaveStatus('offline', 'Offline — data tersimpan di perangkat'); return; }
  if (pendingSaves > 0)  { setSaveStatus('saving',  'Menyimpan…'); return; }
  setSaveStatus('saved', 'Tersimpan');
}
function trackSave(promise) {
  pendingSaves++; refreshSaveStatus();
  return promise
    .then(() => { pendingSaves--; refreshSaveStatus(); })
    .catch(err => {
      pendingSaves--;
      console.error('Gagal menyimpan ke Firebase:', err);
      setSaveStatus('error', 'Gagal menyimpan — periksa koneksi');
      setTimeout(refreshSaveStatus, 4000);
      throw err;
    });
}
window.addEventListener('online',  refreshSaveStatus);
window.addEventListener('offline', refreshSaveStatus);

/* ===== Simpan orang: IndexedDB + Firebase, dengan metadata revisi otomatis =====
   Setiap panggilan savePersonToDB menaikkan `revision` +1 dan mencatat
   `updatedAt`/`updatedBy`, supaya field revisi selalu konsisten di
   semua alur (edit manual, tambah anak, tambah pasangan, dst).
   `actorProfile`/`actorUser` opsional — kalau tidak diisi, dicoba ambil
   dari currentUserProfile/db_auth.currentUser secara global. */
async function savePersonToDB(id, data, actorProfile, actorUser) {
  const profile = actorProfile !== undefined ? actorProfile : (typeof currentUserProfile !== 'undefined' ? currentUserProfile : null);
  const user    = actorUser    !== undefined ? actorUser    : (db_auth ? db_auth.currentUser : null);
  const payload = {
    ...data,
    revision: (data.revision || 0) + 1,
    updatedAt: db_firestore ? firebase.firestore.FieldValue.serverTimestamp() : Date.now(),
    updatedBy: profile ? profile.name : (user ? user.email : 'Tidak diketahui'),
  };
  // Mutasi objek asli di memori supaya pemanggil (people[id]) tetap sinkron
  Object.assign(data, payload);
  // 1. Tulis ke IndexedDB (langsung, lokal, selalu berhasil)
  await idbPutPerson(id, payload).catch(e => console.warn('IndexedDB write gagal:', e));
  // 2. Kirim ke Firebase (async, bisa gagal kalau offline)
  if (db_firestore) {
    trackSave(db_firestore.collection('people').doc(id).set(payload)).catch(() => {});
  }
  return payload;
}

/* ===== Cek konflik revisi sebelum menyimpan =====
   Mengambil dokumen terbaru dari Firestore untuk dibandingkan
   revision-nya dengan yang dilihat pengguna saat form edit dibuka.
   Mengembalikan { conflict: false } atau { conflict: true, cloudData }. */
async function checkRevisionConflict(id, localRevision) {
  if (!db_firestore) return { conflict: false };
  try {
    const doc = await db_firestore.collection('people').doc(id).get();
    if (!doc.exists) return { conflict: false };
    const cloudData = doc.data();
    const cloudRevision = cloudData.revision || 0;
    if ((localRevision || 0) !== cloudRevision) {
      return { conflict: true, cloudData };
    }
    return { conflict: false };
  } catch (e) {
    console.warn('Gagal memeriksa revisi (mode offline?):', e);
    return { conflict: false };
  }
}

async function saveRootIdsToDB(rootIds) {
  await idbPutMeta('rootIds', rootIds).catch(e => console.warn('IndexedDB meta gagal:', e));
  if (db_firestore) {
    trackSave(db_firestore.collection('meta').doc('tree').set({ rootIds })).catch(() => {});
  }
}

async function deletePersonFromDB(id) {
  await idbDeletePerson(id).catch(e => console.warn('IndexedDB delete gagal:', e));
  if (db_firestore) {
    db_firestore.collection('people').doc(id).delete()
      .catch(err => console.error('Gagal menghapus dari Firebase:', err));
  }
}

/* ===== Backup JSON ===== */
function downloadBackupJSON(people, rootIds) {
  const backup = {
    formatVersi: 2,
    aplikasi: 'Silsilah Banu Mansur',
    diunduhPada: new Date().toISOString(),
    rootIds,
    people,
  };
  const blob  = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a     = document.createElement('a');
  a.href = url;
  a.download = `backup-silsilah-banu-mansur-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreFromBackup(data, onSuccess) {
  if (!data || typeof data.people !== 'object' || !Array.isArray(data.rootIds)) {
    alert('Struktur file backup tidak dikenali.');
    return;
  }
  const jumlah = Object.keys(data.people).length;
  if (!confirm(`Pulihkan dari backup ini?\n\nBerisi ${jumlah} orang.\n\nSELURUH data saat ini akan DITIMPA. Lanjutkan?`)) return;

  // 1. Bersihkan IndexedDB lokal
  await idbClearAll();
  // 2. Tulis data baru ke IndexedDB
  for (const [id, person] of Object.entries(data.people)) {
    await idbPutPerson(id, person).catch(() => {});
  }
  await idbPutMeta('rootIds', data.rootIds);

  // 3. Tulis ke Firebase (batch)
  if (db_firestore) {
    const existing = await db_firestore.collection('people').get();
    const ops = [];
    existing.forEach(doc => ops.push({ del: true, ref: doc.ref }));
    Object.keys(data.people).forEach(id =>
      ops.push({ del: false, ref: db_firestore.collection('people').doc(id), data: data.people[id] })
    );
    ops.push({ del: false, ref: db_firestore.collection('meta').doc('tree'), data: { rootIds: data.rootIds } });
    for (let i = 0; i < ops.length; i += 450) {
      const batch = db_firestore.batch();
      ops.slice(i, i + 450).forEach(op => op.del ? batch.delete(op.ref) : batch.set(op.ref, op.data));
      await batch.commit();
    }
  }

  onSuccess(data.people, data.rootIds);
}

/* ===== Seed data (hanya jika Firestore & IndexedDB kosong) ===== */
async function ensureSeedData(people, rootIds) {
  if (!db_firestore) return;
  const localPeople = await idbGetAll().catch(() => ({}));
  // Kalau IndexedDB sudah ada data, tidak perlu seed
  if (Object.keys(localPeople).length > 0) return;
  // Kalau Firebase kosong, seed dari memori
  const snap = await db_firestore.collection('people').get();
  if (snap.empty && Object.keys(people).length > 0) {
    const batch = db_firestore.batch();
    Object.keys(people).forEach(id =>
      batch.set(db_firestore.collection('people').doc(id), people[id])
    );
    batch.set(db_firestore.collection('meta').doc('tree'), { rootIds });
    await batch.commit();
  }
}

/* ===== Audit Log ===== */
function logAudit(action, personId, summary, changes, userProfile, currentUser) {
  if (!db_firestore) return;
  const displayName = userProfile
    ? (userProfile.region ? `${userProfile.name} (${userProfile.region})` : userProfile.name)
    : (currentUser ? currentUser.email : 'Tidak diketahui');
  const entry = {
    ts: firebase.firestore.FieldValue.serverTimestamp(),
    userId: currentUser ? currentUser.uid : null,
    userName: displayName,
    action,
    personId: personId || null,
    summary,
  };
  if (changes && changes.length) entry.changes = changes;
  db_firestore.collection('auditLog').add(entry)
    .catch(err => console.error('Gagal mencatat audit log:', err));
}
