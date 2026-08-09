const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBHQpABAZ5yTkPA9O44XZK1yvCGyBfN9uU",
    authDomain: "bani-kuzari-pedigree.firebaseapp.com",
    projectId: "bani-kuzari-pedigree",
    storageBucket: "bani-kuzari-pedigree.firebasestorage.app",
    messagingSenderId: "275802499453",
    appId: "1:275802499453:web:a5013654f81d718d984414"
  };
  let db = null, auth = null;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    auth = firebase.auth();
  }catch(e){
    console.error('Firebase gagal diinisialisasi. Cek FIREBASE_CONFIG di atas.', e);
  }

  /* ================= LOGIN / AUTENTIKASI ================= */
  let authMode = 'login'; // 'login' atau 'register'
  function toggleAuthMode(){
    authMode = authMode === 'login' ? 'register' : 'login';
    document.getElementById('loginError').textContent = '';
    const nameField = document.getElementById('loginName');
    const regionField = document.getElementById('loginRegion');
    if(authMode === 'register'){
      document.getElementById('loginSubtitle').textContent = 'Buat akun baru untuk keluarga (email & kata sandi bebas Anda tentukan).';
      document.getElementById('loginSubmitBtn').textContent = 'Daftar';
      document.getElementById('loginToggleMode').textContent = 'Sudah punya akun? Masuk di sini';
      nameField.style.display = 'block';
      regionField.style.display = 'block';
    } else {
      document.getElementById('loginSubtitle').textContent = 'Masuk dengan email keluarga untuk melihat & mengedit data.';
      document.getElementById('loginSubmitBtn').textContent = 'Masuk';
      document.getElementById('loginToggleMode').textContent = 'Belum punya akun? Daftar di sini';
      nameField.style.display = 'none';
      regionField.style.display = 'none';
    }
  }
  function doLogin(){
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errBox = document.getElementById('loginError');
    errBox.textContent = '';
    if(!auth){ errBox.textContent = 'Firebase belum dikonfigurasi (lihat FIREBASE_CONFIG).'; return; }
    if(!email || !password){ errBox.textContent = 'Email dan kata sandi wajib diisi.'; return; }
    if(authMode === 'register'){
      const name = document.getElementById('loginName').value.trim();
      const region = document.getElementById('loginRegion').value.trim();
      if(!name){ errBox.textContent = 'Nama Anda wajib diisi (dipakai untuk mencatat riwayat perubahan).'; return; }
      auth.createUserWithEmailAndPassword(email, password)
        .then(cred => {
          if(db) return db.collection('users').doc(cred.user.uid).set({name, region, email});
        })
        .catch(err => { errBox.textContent = terjemahErrorAuth(err); });
    } else {
      auth.signInWithEmailAndPassword(email, password)
        .catch(err => { errBox.textContent = terjemahErrorAuth(err); });
    }
  }
  function doLogout(){
    if(auth) auth.signOut();
  }
  function doForgotPassword(){
    const errBox = document.getElementById('loginError');
    errBox.textContent = '';
    if(!auth){ errBox.textContent = 'Firebase belum dikonfigurasi (lihat FIREBASE_CONFIG).'; return; }
    const email = document.getElementById('loginEmail').value.trim();
    if(!email){ errBox.textContent = 'Isi dulu email Anda di kolom atas, lalu klik "Lupa kata sandi?" lagi.'; return; }
    auth.sendPasswordResetEmail(email)
      .then(()=>{ errBox.style.color = 'var(--teal)'; errBox.textContent = `Tautan reset kata sandi sudah dikirim ke ${email}. Cek kotak masuk (atau folder spam).`; })
      .catch(err=>{ errBox.style.color = ''; errBox.textContent = terjemahErrorAuth(err); });
  }

  // ===== Dropdown toolbar (Aksi & Akun) =====
  function toggleDropdown(wrapId){
    const wrap = document.getElementById(wrapId);
    const menu = wrap.querySelector('.dropdown-menu');
    const isOpen = menu.classList.contains('open');
    closeDropdowns();
    if(!isOpen) menu.classList.add('open');
  }
  function closeDropdowns(){
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  }
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.dropdown-wrap')) closeDropdowns();
  });
  function terjemahErrorAuth(err){
    const map = {
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/user-not-found': 'Email belum terdaftar. Coba "Daftar di sini".',
      'auth/wrong-password': 'Kata sandi salah.',
      'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba "Masuk di sini".',
      'auth/weak-password': 'Kata sandi minimal 6 karakter.',
      'auth/invalid-credential': 'Email atau kata sandi salah.',
    };
    return map[err.code] || ('Gagal: ' + err.message);
  }
  let currentUserProfile = null; // {name, region, email}
  async function loadUserProfile(uid, fallbackEmail){
    const fallback = { name: fallbackEmail.split('@')[0], region:'', email: fallbackEmail };
    if(!db){ currentUserProfile = fallback; return; }
    try{
      const doc = await db.collection('users').doc(uid).get();
      currentUserProfile = doc.exists ? doc.data() : fallback;
    }catch(e){
      console.error('Gagal memuat profil pengguna:', e);
      currentUserProfile = fallback;
    }
  }
  function displayNameForAudit(){
    if(!currentUserProfile) return (auth && auth.currentUser) ? auth.currentUser.email : 'Tidak diketahui';
    return currentUserProfile.region
      ? `${currentUserProfile.name} (${currentUserProfile.region})`
      : currentUserProfile.name;
  }

  if(auth){
    auth.onAuthStateChanged(user => {
      const loginScreen = document.getElementById('loginScreen');
      const appRoot = document.getElementById('appRoot');
      if(user){
        loginScreen.style.display = 'none';
        appRoot.style.display = 'grid';
        const label = document.getElementById('userEmailLabel');
        if(label) label.textContent = user.email;
        loadUserProfile(user.uid, user.email);
        refreshSaveStatus();
        if(typeof ensureSeedData === 'function'){
          ensureSeedData().then(startRealtimeSync).catch(err=>{
            console.error('Gagal menyiapkan data awal dari Firestore:', err);
            render();
          });
        }
      } else {
        if(typeof stopRealtimeSync === 'function') stopRealtimeSync();
        currentUserProfile = null;
        appRoot.style.display = 'none';
        loginScreen.style.display = 'block';
      }
    });
  } else {
    // Firebase belum dikonfigurasi -> tetap tampilkan app (akan kosong sampai diisi manual)
    document.getElementById('appRoot').style.display = 'grid';
  }

/* ============================================================ */

/* ================= DATA AWAL =================
   Sengaja dikosongkan — sebelumnya berisi data contoh (nama, no. HP, email, alamat)
   untuk keperluan mockup. Data sesungguhnya sekarang sepenuhnya berasal dari Firestore
   (lihat startRealtimeSync di bawah). Kalau Firestore masih benar-benar kosong, gunakan
   tombol "Tambah Ortu" di aplikasi untuk mulai mengisi silsilah. */
let people = {};
let rootIds = []; // leluhur tanpa parentId yang jadi akar pohon (bisa lebih dari satu)
const genColors = ['#9C5A2E','#2E7D74','#3D6B4B','#8A3B3B'];

/* ================= PENYIMPANAN PERMANEN (Firestore) =================
   - Koleksi "people": 1 dokumen per orang, id dokumen = id orang.
   - Dokumen "meta/tree": menyimpan { rootIds: [...] }.
   - "people"/"rootIds" di atas sengaja kosong (lihat catatan di atasnya). Kalau Firestore
     ternyata masih kosong juga, ensureSeedData() di bawah ini praktis tidak melakukan
     apa-apa — aplikasi akan tampil kosong sampai Anda menambah leluhur pertama lewat UI.
   - Dipasang REAL-TIME LISTENER (onSnapshot) supaya perubahan yang dibuat di
     perangkat/anggota keluarga lain langsung muncul di sini tanpa perlu refresh. */
let unsubPeople = null, unsubMeta = null;

async function ensureSeedData(){
  if(!db) return; // Firebase belum dikonfigurasi -> tetap pakai people/rootIds di memori (kosong)
  const peopleSnap = await db.collection('people').get();
  if(peopleSnap.empty){
    const batch = db.batch();
    Object.keys(people).forEach(id => batch.set(db.collection('people').doc(id), people[id]));
    batch.set(db.collection('meta').doc('tree'), {rootIds});
    await batch.commit();
  }
}
function startRealtimeSync(){
  if(!db) return;
  unsubPeople = db.collection('people').onSnapshot(snap => {
    const loaded = {};
    snap.forEach(doc => { loaded[doc.id] = doc.data(); });
    people = loaded;
    migrateAllSiblingOrders(); // migrasi siblingOrder legacy dijalankan sekali di sini saja
    // jangan render di tengah-tengah user sedang mengisi form (edit/tambah),
    // supaya isian yang sedang diketik tidak tiba-tiba hilang/tertimpa
    if(!editingMode) render();
  }, err => console.error('Gagal sinkronisasi real-time (people):', err));

  unsubMeta = db.collection('meta').doc('tree').onSnapshot(doc => {
    if(doc.exists && Array.isArray(doc.data().rootIds)){
      rootIds = doc.data().rootIds;
      if(!editingMode) render();
    }
  }, err => console.error('Gagal sinkronisasi real-time (rootIds):', err));
}
/* ---- Indikator status simpan & koneksi ----
   Sebelumnya: perubahan lokal langsung dianggap "tersimpan" (optimistic UI) begitu
   people/rootIds dimutasi + render() dipanggil, padahal tulisan ke Firestore-nya
   berjalan async di background dan kalau device sedang offline/gagal, error-nya
   cuma masuk console.error -- pengguna awam tidak tahu perubahannya sebenarnya
   belum tersimpan permanen. `pendingSaves` menghitung berapa banyak tulisan yang
   masih "dalam perjalanan" supaya titik status di toolbar mencerminkan itu. */
let pendingSaves = 0;
function setSaveStatus(mode, text){
  const el = document.getElementById('saveStatus');
  const txt = document.getElementById('saveStatusText');
  if(!el || !txt) return;
  el.className = 'save-status' + (mode? ' '+mode : '');
  txt.textContent = text;
}
function refreshSaveStatus(){
  if(!navigator.onLine){ setSaveStatus('offline', 'Offline — perubahan disimpan di perangkat ini'); return; }
  if(pendingSaves > 0){ setSaveStatus('saving', 'Menyimpan…'); return; }
  setSaveStatus('saved', 'Tersimpan');
}
function trackSave(promise){
  pendingSaves++; refreshSaveStatus();
  return promise
    .then(()=>{ pendingSaves--; refreshSaveStatus(); })
    .catch(err=>{
      pendingSaves--;
      console.error('Gagal menyimpan ke Firestore:', err);
      setSaveStatus('error', 'Gagal menyimpan — periksa koneksi lalu coba lagi');
      setTimeout(refreshSaveStatus, 4000);
      throw err;
    });
}
window.addEventListener('online', refreshSaveStatus);
window.addEventListener('offline', refreshSaveStatus);

function stopRealtimeSync(){
  if(unsubPeople){ unsubPeople(); unsubPeople = null; }
  if(unsubMeta){ unsubMeta(); unsubMeta = null; }
}
function savePersonToDB(id){
  if(!db) return; // mode tanpa database: perubahan hanya tersimpan sementara di memori
  trackSave(db.collection('people').doc(id).set(people[id])).catch(()=>{});
}
function saveRootIdsToDB(){
  if(!db) return;
  trackSave(db.collection('meta').doc('tree').set({rootIds})).catch(()=>{});
}

/* ================= BACKUP & PEMULIHAN (JSON) =================
   Manual saja (tidak ada penjadwalan/otomatis) — pengguna menekan tombol saat
   ingin membuat cadangan. Struktur file: { formatVersi, diunduhPada, rootIds, people }.
   File hasil unduhan ini juga bisa dipakai langsung lewat tombol "Pulihkan Backup"
   untuk mengembalikan seluruh data (mis. kalau ada kesalahan besar/data terhapus). */
function downloadBackupJSON(){
  const backup = {
    formatVersi: 1,
    aplikasi: 'Silsilah Bani Kuzari',
    diunduhPada: new Date().toISOString(),
    rootIds,
    people,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-silsilah-banu-mansur-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function restoreFromBackupFile(inputEl){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  const resetInput = ()=>{ inputEl.value = ''; };
  let raw;
  try{
    raw = await file.text();
  }catch(err){
    alert('Gagal membaca file backup: ' + err.message);
    resetInput(); return;
  }
  let data;
  try{
    data = JSON.parse(raw);
  }catch(err){
    alert('File yang dipilih bukan JSON yang valid. Pastikan ini adalah file backup dari aplikasi ini.');
    resetInput(); return;
  }
  if(!data || typeof data.people !== 'object' || !Array.isArray(data.rootIds)){
    alert('Struktur file backup tidak dikenali (field "people"/"rootIds" tidak ditemukan).');
    resetInput(); return;
  }
  const jumlahOrang = Object.keys(data.people).length;
  const konfirmasi = confirm(
    `Pulihkan dari backup ini?\n\nBerisi ${jumlahOrang} orang dan ${data.rootIds.length} leluhur akar.\n\n` +
    `PERHATIAN: seluruh data silsilah yang ada SAAT INI akan DITIMPA oleh isi file ` +
    `backup ini dan tidak bisa dibatalkan. Lanjutkan?`
  );
  if(!konfirmasi){ resetInput(); return; }

  try{
    if(db){
      const existing = await db.collection('people').get();
      const ops = [];
      existing.forEach(doc => ops.push({del:true, ref:doc.ref}));
      Object.keys(data.people).forEach(id => ops.push({del:false, ref:db.collection('people').doc(id), data:data.people[id]}));
      ops.push({del:false, ref:db.collection('meta').doc('tree'), data:{rootIds:data.rootIds}});
      // Firestore membatasi maksimal 500 operasi per batch — dipecah supaya aman.
      for(let i=0; i<ops.length; i+=450){
        const batch = db.batch();
        ops.slice(i, i+450).forEach(op => op.del ? batch.delete(op.ref) : batch.set(op.ref, op.data));
        await batch.commit();
      }
      logAudit('restore', null, `Memulihkan seluruh data silsilah dari file backup (${jumlahOrang} orang)`);
      people = data.people;
      rootIds = data.rootIds;
    } else {
      people = data.people;
      rootIds = data.rootIds;
    }
    migrateAllSiblingOrders();
    currentId = rootIds[0] || null;
    render();
    alert('Pemulihan data dari backup selesai.');
  }catch(err){
    console.error('Gagal memulihkan backup:', err);
    alert('Gagal memulihkan backup: ' + err.message);
  } finally {
    resetInput();
  }
}

/* ================= AUDIT LOG (riwayat perubahan) =================
   Setiap tambah/ubah/hapus data anggota dicatat sebagai satu dokumen di koleksi
   "auditLog": siapa (userName, dari profil di koleksi "users"), kapan (ts, pakai
   serverTimestamp supaya urutannya akurat lintas perangkat), dan ringkasan apa yang
   berubah. Ini melengkapi backup penuh — kalau ada 1 kesalahan kecil, cukup lihat
   riwayatnya di sini tanpa perlu memulihkan seluruh database.
   Catatan: perubahan URUTAN saudara (drag & drop / Jadikan Kakak-Adik) sengaja TIDAK
   dicatat di sini karena murni kosmetik, bukan perubahan data — supaya riwayat tetap
   fokus ke perubahan yang benar-benar berarti (tambah/ubah/hapus). */
function logAudit(action, personId, summary, changes){
  if(!db) return; // tanpa Firestore, tidak ada riwayat yang bisa disimpan permanen
  const entry = {
    ts: firebase.firestore.FieldValue.serverTimestamp(),
    userId: (auth && auth.currentUser) ? auth.currentUser.uid : null,
    userName: (typeof displayNameForAudit === 'function') ? displayNameForAudit() : 'Tidak diketahui',
    action, // 'add' | 'edit' | 'delete'
    personId: personId || null,
    summary,
  };
  if(changes && changes.length) entry.changes = changes;
  db.collection('auditLog').add(entry).catch(err=>console.error('Gagal mencatat riwayat perubahan:', err));
}
function countDescendants(id){
  let count = 0;
  childrenOf(id).forEach(kid=>{ count += 1 + countDescendants(kid); });
  return count;
}

function rawChildrenOf(id){
  return Object.keys(people).filter(pid => people[pid].parents.includes(id));
}
// Migrasi otomatis & aman: kid yang SUDAH punya siblingOrder (mis. hasil urutan manual
// sebelumnya) urutannya TIDAK PERNAH diacak ulang oleh fungsi ini. Hanya kid yang benar-benar
// belum punya nomor (data lama/legacy) yang disisipkan, memakai tahun lahir sebagai perkiraan
// posisi awal yang wajar (fallback ke akhir kalau tidak ada info tahun lahir sama sekali).
function ensureSiblingOrder(parentId){
  const kids = rawChildrenOf(parentId);
  const missing = kids.filter(kid => typeof people[kid].siblingOrder !== 'number');
  if(!missing.length) return;
  const already = kids.filter(kid => typeof people[kid].siblingOrder === 'number')
                      .sort((a,b)=> people[a].siblingOrder - people[b].siblingOrder);
  missing.sort((a,b)=>{
    const ba = parseInt(people[a].birth,10), bb = parseInt(people[b].birth,10);
    const aHas = !isNaN(ba), bHas = !isNaN(bb);
    if(aHas && bHas && ba!==bb) return ba-bb;
    if(aHas && !bHas) return -1;
    if(!aHas && bHas) return 1;
    return people[a].name.localeCompare(people[b].name, 'id');
  });
  missing.forEach(kid=>{
    const kb = parseInt(people[kid].birth,10);
    let insertAt = already.length; // default: taruh di akhir kalau tak ada info tahun lahir
    if(!isNaN(kb)){
      const idx = already.findIndex(aid=>{
        const ab = parseInt(people[aid].birth,10);
        return !isNaN(ab) && ab > kb;
      });
      if(idx !== -1) insertAt = idx;
    }
    already.splice(insertAt, 0, kid);
  });
  already.forEach((kid,idx)=>{
    if(people[kid].siblingOrder !== idx){ people[kid].siblingOrder = idx; savePersonToDB(kid); }
  });
}
// Dulu ensureSiblingOrder() dipanggil di DALAM childrenOf() setiap kali dipanggil —
// dan childrenOf() dipanggil puluhan/ratusan kali per render (sidebar rekursif, grid,
// tree view, hitung generasi, NRB). Itu bikin sebuah fungsi "baca" diam-diam punya efek
// samping (bisa menulis ke Firestore) di jalur yang seharusnya cuma menampilkan data.
// Sekarang migrasi dijalankan SEKALI saja lewat migrateAllSiblingOrders() setiap data
// selesai dimuat/direstore, dan childrenOf() murni hanya mengambil + mengurutkan.
function migrateAllSiblingOrders(){
  const parentIdsInUse = new Set();
  Object.values(people).forEach(p => (p.parents||[]).forEach(pid => parentIdsInUse.add(pid)));
  parentIdsInUse.forEach(pid => ensureSiblingOrder(pid));
}
function childrenOf(id){
  return rawChildrenOf(id).sort((a,b)=> (people[a].siblingOrder??0) - (people[b].siblingOrder??0));
}

function getGeneration(id, memo={}, visiting=new Set()){
  if(memo[id]!==undefined) return memo[id];
  if(visiting.has(id)){
    console.warn('Lingkaran data terdeteksi pada getGeneration, id:', id);
    memo[id]=1; return 1;
  }
  visiting.add(id);
  const p = people[id].parents;
  if(p.length){
    const g = Math.max(...p.map(pp=>getGeneration(pp,memo,visiting))) + 1;
    memo[id]=g; visiting.delete(id); return g;
  }
  if(rootIds.includes(id)){ memo[id]=1; visiting.delete(id); return 1; }
  const sp = (people[id].spouses||[])[0];
  if(sp){ const g = getGeneration(sp, memo, visiting); memo[id]=g; visiting.delete(id); return g; }
  memo[id]=1; visiting.delete(id); return 1;
}
function totalGenerations(){
  const gens = Object.keys(people).map(id=>getGeneration(id));
  return gens.length ? Math.max(...gens) : 0;
}

/* ===== NRB (Nomor Rekening Bani) =====
   Format: <indeks-leluhur-akar>.<urutan-anak-2digit>.<urutan-cucu-2digit>...
   Contoh: 1.02.01  ->  anak ke-2 dari leluhur akar #1, lalu anak pertamanya.
   Urutan anak di sini mengikuti childrenOf() (siblingOrder), supaya nomor NRB selalu
   sesuai dengan urutan tampil di pohon & grid — bukan lagi murni berdasar tahun lahir. */
function canonicalChildren(id){
  return childrenOf(id).filter(pid => people[pid].parents[0] === id);
}
function getNRB(id, memo={}){
  if(memo[id]) return memo[id];
  const p = people[id].parents;
  let nrb;
  if(p.length){
    const parent = p[0];
    const parentNRB = getNRB(parent, memo);
    const sibs = canonicalChildren(parent);
    const idx = sibs.indexOf(id) + 1;
    nrb = parentNRB + '.' + String(idx).padStart(2,'0');
  } else if(rootIds.includes(id)){
    nrb = String(rootIds.indexOf(id) + 1);
  } else {
    // pasangan yang menikah masuk: pakai NRB pasangannya + tanda "-P" (pasangan)
    const sp = (people[id].spouses||[])[0];
    nrb = sp ? (getNRB(sp, memo) + '-P') : '—';
  }
  memo[id] = nrb; return nrb;
}

/* current open folder = person id (breadcrumb path is ancestor chain); null = belum ada data */
let currentId = null;
let viewMode = 'grid';
let searchTerm = '';
let editingMode = false; // true saat kartu sedang dalam mode entri/edit data (popup sensitif, tidak boleh tertutup otomatis)

function ancestorChain(id){
  // root -> ... -> id  (urutan tua ke muda, dipakai untuk breadcrumb ala folder)
  const chain=[id];
  let cur=id;
  while(people[cur].parents.length){
    cur = people[cur].parents[0]; // ambil garis salah satu ortu untuk jalur folder
    chain.unshift(cur);
  }
  return chain;
}
function kinshipChain(id){
  // id -> ... -> root (urutan muda ke tua, dipakai untuk label "bin/binti")
  const chain=[id];
  let cur=id;
  while(people[cur].parents.length){
    cur = people[cur].parents[0];
    chain.push(cur);
  }
  return chain;
}

function renderBreadcrumb(){
  const bc = document.getElementById('breadcrumb');
  const kinship = document.getElementById('kinshipLine');
  if(!currentId || !people[currentId]){ bc.innerHTML=''; if(kinship) kinship.innerHTML=''; return; }
  const chain = ancestorChain(currentId);
  bc.innerHTML='';
  chain.forEach((id,i)=>{
    const span=document.createElement('span');
    span.className='crumb'+(i===chain.length-1?' current':'');
    span.textContent=people[id].name;
    span.onclick=()=>{ if(i!==chain.length-1){ currentId=id; render(); } };
    bc.appendChild(span);
    if(i<chain.length-1){
      const sep=document.createElement('span');
      sep.className='crumb-sep'; sep.textContent='›';
      bc.appendChild(sep);
    }
  });

  // baris kedua toolbar: nama silsilah gaya bin/binti, urutan muda -> tua (grammar yang benar)
  if(kinship){
    const kchain = kinshipChain(currentId);
    const parts = kchain.map((id,i)=>{
      if(i===0) return `<b>${escapeHtml(people[id].name)}</b>`;
      const connector = people[kchain[i-1]].gender==='P' ? 'binti' : 'bin';
      return `${connector} ${escapeHtml(people[id].name)}`;
    });
    kinship.innerHTML = parts.join(' ');
  }
}

function renderSidebar(){
  const container = document.getElementById('sidebarTree');
  container.innerHTML='';
  rootIds.forEach(id=> container.appendChild(buildTreeNode(id)) );
}
const expanded = new Set();
let highlightedId = null;   // id yang lagi disorot di sidebar (kartu yang sedang terbuka)

function buildTreeNode(id){
  const wrap=document.createElement('div');
  wrap.className='tree-node';
  const kids = childrenOf(id);
  const row=document.createElement('div');
  row.className='tree-row'+(id===(highlightedId||currentId)?' active':'');
  const isOpen = expanded.has(id);
  row.innerHTML = `
    <span class="twisty ${kids.length?'':'leaf'}">${isOpen?'▾':'▸'}</span>
    <span class="folder-ico">${kids.length?'📂':'📁'}</span>
    <span class="tree-name">${escapeHtml(people[id].name)}</span>
    <span class="tree-badge">${kids.length||''}</span>`;
  // Klik tunggal pada folder sidebar = navigasi + buka/tutup cabang (seperti sebelumnya).
  // Klik ganda = langsung buka kartu rincian orang tsb.
  // Klik tunggal DITUNDA 250ms (pola yang sama persis dengan kartu di grid konten):
  // kalau klik kedua datang cepat (dblclick), aksi navigasi dibatalkan dan diganti
  // buka kartu rincian. Tanpa penundaan ini, klik pertama dari sebuah dblclick sudah
  // keburu memicu navigasi/toggle cabang sebelum klik kedua sempat terdeteksi.
  row.onclick=(e)=>{
    e.stopPropagation();
    if(row._clickTimer){ clearTimeout(row._clickTimer); row._clickTimer = null; return; }
    row._clickTimer = setTimeout(()=>{
      row._clickTimer = null;
      if(kids.length){
        if(isOpen) expanded.delete(id); else expanded.add(id);
      }
      currentId=id;
      render();
    }, 250);
  };
  // Klik kanan pada folder di pohon keluarga membuka menu yang sama persis dengan
  // menu klik kanan di kartu grid (Buka/Tambah Anak/Edit/Jadikan Kakak/Jadikan Adik/Hapus),
  // berlaku untuk SEMUA folder termasuk leluhur/akar yang tidak punya orang tua.
  row.oncontextmenu = (e)=>{ e.preventDefault(); e.stopPropagation(); openCtxMenu(e, id); };
  row.ondblclick = (e)=>{
    e.stopPropagation();
    if(row._clickTimer){ clearTimeout(row._clickTimer); row._clickTimer = null; }
    openDetail(id);
  };
  wrap.appendChild(row);
  if(kids.length && isOpen){
    const childWrap=document.createElement('div');
    childWrap.className='tree-children';
    kids.forEach(kid=> childWrap.appendChild(buildTreeNode(kid)));
    wrap.appendChild(childWrap);
  }
  return wrap;
}

// Auto-format input tanggal lahir menjadi tt/bb/tttt saat mengetik angka
function formatTglLahir(el){
  let digits = el.value.replace(/\D/g,'').slice(0,8); // hanya angka, maksimal 8 digit (ddmmyyyy)
  let out = digits;
  if(digits.length > 4) out = digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
  else if(digits.length > 2) out = digits.slice(0,2)+'/'+digits.slice(2);
  el.value = out;
}

/* Semua data orang (nama, alamat, dsb.) berasal dari input anggota keluarga sendiri lewat
   form, lalu disisipkan ke innerHTML di banyak tempat (kartu, sidebar, pohon, panel rincian).
   Tanpa di-escape, nama yang (sengaja/tidak sengaja) berisi tag HTML/script bisa dieksekusi
   di browser SEMUA orang yang membuka folder itu. escapeHtml() WAJIB dipakai untuk setiap
   nilai dari `people[...]` (atau input pengguna lain) sebelum masuk ke template string HTML. */
function escapeHtml(str){
  return String(str==null? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function initials(name){
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

/* ===== Konversi tanggal Masehi -> Hari + Pasaran Jawa + Hijriyah =====
   Dipakai untuk menampilkan tabel 4-sel tanggal lahir/wafat secara otomatis,
   cukup dari input tanggal Masehi (tt/bb/tttt).

   Kalibrasi & verifikasi rumus (dicek terhadap 2 tanggal acuan yang umum dikutip):
   - 26 Desember 1975 -> Jumat Wage, 22 Dzulhijjah 1395 H
   - 17 Agustus 1945  -> Jumat Legi (hari kemerdekaan RI, sering dikutip)
   Catatan: hasil Hijriyah memakai algoritma tabular (bukan hasil rukyat/hisab resmi),
   jadi bisa selisih 1-2 hari dari catatan lokal/keluarga untuk tanggal tertentu -
   wajar untuk metode konversi aritmetik seperti ini. */
const HARI_NAMA = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const PASARAN_NAMA = ['Legi','Pahing','Pon','Wage','Kliwon'];
const HIJRI_BULAN = ['Muharram','Safar','Rabiul Awal','Rabiul Akhir','Jumadil Awal','Jumadil Akhir','Rajab',"Sya'ban",'Ramadhan','Syawal',"Dzulqa'dah",'Dzulhijjah'];

function gregorianToJD(gy, gm, gd){
  return Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4) +
         Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12) -
         Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) +
         gd - 32075;
}
function jdToHijri(jd){
  const EPOCH_ADJ = 1948442; // dikalibrasi terhadap tanggal acuan di atas
  let l = jd - EPOCH_ADJ + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return {day, month, year};
}
// Parse string "tt/bb/tttt" -> {y,m,d} kalau lengkap & valid, atau null kalau tidak
// (mis. field lama yang cuma berisi tahun saja, atau kosong).
function parseTglLengkap(str){
  if(!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const test = new Date(y, mo-1, d);
  if(test.getFullYear()!==y || test.getMonth()!==mo-1 || test.getDate()!==d) return null; // tanggal tidak valid (mis. 31/02)
  return {y, m: mo, d};
}
// Bangun HTML tabel 4-sel (Hari | Tanggal Masehi | Pasaran | Tanggal Hijriyah).
// Kalau tanggal tidak lengkap/tidak valid, kembalikan teks aslinya apa adanya (fallback).
function renderTanggalLengkap(str){
  const parsed = parseTglLengkap(str);
  if(!parsed) return escapeHtml(str || '-');
  const {y, m, d} = parsed;
  const jd = gregorianToJD(y, m, d);
  const dow = new Date(y, m-1, d).getDay();
  const hariNama = HARI_NAMA[dow];
  const pasaran = PASARAN_NAMA[(jd + 3) % 5];
  const h = jdToHijri(jd);
  const bulanMasehi = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const tglMasehi = `${d} ${bulanMasehi[m-1]} ${y}`;
  const tglHijri = `${h.day} ${HIJRI_BULAN[h.month-1]} ${h.year}`;
  return `<div class="tgl-lengkap-table">
    <div class="tgl-cell">${escapeHtml(hariNama)}</div><div class="tgl-cell tgl-cell-masehi">${escapeHtml(tglMasehi)}</div>
    <div class="tgl-cell">${escapeHtml(pasaran)}</div><div class="tgl-cell tgl-cell-hijri">${escapeHtml(tglHijri)}</div>
  </div>`;
}

function renderContent(){
  const heading = document.getElementById('heading');
  const pairLabel = document.getElementById('pairLabel');
  const grid = document.getElementById('cardGrid');
  const emptyHint = document.getElementById('emptyHint');

  if(!currentId || !people[currentId]){
    heading.textContent = 'Belum ada data';
    heading.onclick = null;
    pairLabel.innerHTML = '';
    grid.innerHTML = '';
    emptyHint.textContent = 'Belum ada leluhur yang tercatat.';
    emptyHint.style.display = 'block';
    return;
  }

  const kids = childrenOf(currentId).filter(id=>
    people[id].name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const person = people[currentId];
  const spouseNames = person.spouses.map(sid=>people[sid].name).join(' & ');

  // judul nama folder aktif: klik satu kali membuka kartu rincian orang itu sendiri
  heading.textContent = person.name;
  heading.onclick = ()=> openDetail(currentId);

  // label pasangan: setiap nama pasangan bisa diklik terpisah untuk membuka kartunya
  if(person.spouses.length){
    pairLabel.innerHTML = 'bersama ' + person.spouses.map(sid =>
      `<span class="spouse-link" data-open="${sid}">${escapeHtml(people[sid].name)}</span>`
    ).join(' &amp; ');
    pairLabel.querySelectorAll('.spouse-link').forEach(el=>{
      el.onclick = ()=> openDetail(el.dataset.open);
    });
  } else {
    pairLabel.innerHTML = '';
  }
  // Saat orang yang sedang dibuka belum punya anak: selain teks hint, tampilkan
  // tombol kotak kecil bergaya kartu/folder (warna --gen-color sama seperti kartu)
  // untuk membuka kartu rincian orang ini sendiri, dan satu tombol lagi per pasangan
  // (kalau ada) di sebelah kanannya - sampai maksimal 4 pasangan.
  const hintGenColor = genColors[(getGeneration(currentId)-1)%genColors.length];
  emptyHint.innerHTML = `
    <div>Belum ada anak yang tercatat di sini. Gunakan "Tambah Anak" untuk menambahkan.</div>
    <div class="empty-hint-actions">
      <button type="button" class="mini-open-card" style="--gen-color:${hintGenColor}" data-open-detail="${currentId}" title="Buka kartu ${escapeHtml(person.name)}">
        <span class="mini-open-card-ico">📂</span><span>Buka</span>
      </button>
      ${(person.spouses||[]).filter(sid=>people[sid]).map(sid=>`
        <button type="button" class="mini-open-card" style="--gen-color:${hintGenColor}" data-open-detail="${sid}" title="Buka kartu ${escapeHtml(people[sid].name)}">
          <span class="mini-open-card-ico">📂</span><span>Buka</span>
        </button>
      `).join('')}
    </div>
  `;
  emptyHint.querySelectorAll('[data-open-detail]').forEach(btn=>{
    btn.onclick = ()=> openDetail(btn.dataset.openDetail);
  });
  emptyHint.style.display = kids.length? 'none':'block';

  grid.innerHTML='';
  kids.forEach(id=>{
    const p = people[id];
    const gen = getGeneration(id);
    const grandkids = childrenOf(id);
    const card=document.createElement('div');
    card.className='card';
    card.style.setProperty('--gen-color', genColors[(gen-1)%genColors.length]);
    card.innerHTML = `
      <span class="drag-handle" title="Seret untuk mengubah urutan anak" aria-hidden="true">⠿</span>
      ${grandkids.length? `<button type="button" class="open-desc-btn" data-nav="${id}" title="Buka keturunan">📂 ${grandkids.length}</button>`:''}
      <div class="avatar">${initials(p.name)}</div>
      <div class="card-name">${escapeHtml(p.name)}</div>
      <div class="card-meta">${escapeHtml(p.birth)}${p.death? ' – '+escapeHtml(p.death):' – sekarang'}</div>
      <div class="card-pills">
        <span class="pill pill-gender-${p.gender}">${p.gender==='L'?'Laki-laki':'Perempuan'}</span>
        ${p.death? '<span class="pill pill-alm">Alm.</span>':''}
      </div>`;
    // klik tunggal pada kartu = navigasi masuk ke folder anak-anaknya (folder-style).
    // klik ganda (double click) atau klik kanan -> "Buka" = membuka kartu rincian orang tsb.
    // Klik tunggal DITUNDA sebentar (250ms): kalau klik kedua datang cepat (dblclick),
    // aksi navigasi folder dibatalkan dan diganti buka kartu rincian. Ini perlu karena
    // klik tunggal me-render ulang kartu, sehingga kartu lama hilang sebelum dblclick sempat terdeteksi.
    card.onclick = ()=>{
      if(card._clickTimer){ clearTimeout(card._clickTimer); card._clickTimer = null; return; }
      card._clickTimer = setTimeout(()=>{
        card._clickTimer = null;
        currentId = id;
        expanded.add(id);
        render();
      }, 250);
    };
    card.ondblclick = ()=>{
      if(card._clickTimer){ clearTimeout(card._clickTimer); card._clickTimer = null; }
      openDetail(id);
    };
    // tombol kecil di pojok kartu yang navigasi ke daftar keturunannya (folder-style),
    // dipisah dengan stopPropagation supaya tidak memicu openDetail.
    const navBtn = card.querySelector('.open-desc-btn');
    if(navBtn){
      navBtn.onclick = (e)=>{ e.stopPropagation(); currentId=id; expanded.add(id); render(); };
    }
    card.oncontextmenu = (e)=>{ e.preventDefault(); openCtxMenu(e, id); };
    // Seret & lepas untuk mengubah URUTAN anak (siblingOrder) di folder ini saja —
    // tidak pernah mengubah data orang tua siapa pun.
    card.draggable = true;
    card.dataset.id = id;
    card.addEventListener('dragstart', e=>{ e.stopPropagation(); card.classList.add('dragging'); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed='move'; });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
    card.addEventListener('dragover', e=>{ e.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', ()=> card.classList.remove('drag-over'));
    card.addEventListener('drop', e=>{
      e.preventDefault(); e.stopPropagation();
      card.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if(draggedId && draggedId !== id) reorderSiblingBeforeTarget(draggedId, id);
    });
    grid.appendChild(card);
  });

  renderTreeView();
}

/* ================= TAMPILAN POHON (org chart) =================
   Menampilkan currentId sebagai simpul teratas dan keturunannya bercabang ke
   bawah, memakai teknik CSS <ul>/<li> murni untuk garis penghubung. Setiap
   simpul yang punya anak bisa di-collapse/expand sendiri (state disimpan di
   Set `expanded` yang sama dipakai sidebar), supaya data besar tidak
   berantakan. Seluruh kanvas bisa di-zoom & di-geser (pan). */
let treeScale = 1, treeX = 0, treeY = 0;
let lastTreeRootId = null;

function buildOrgNode(id, isRoot){
  const p = people[id];
  const kids = childrenOf(id);
  const hasKids = kids.length > 0;
  const isOpen = isRoot || expanded.has(id);
  const gen = getGeneration(id);
  const words = p.name.trim().split(/\s+/);
  const line1 = escapeHtml(words[0] || '');
  const line2 = escapeHtml(words.slice(1).join(' '));
  return `<li>
    <div class="org-node" data-id="${id}" style="--gen-color:${genColors[(gen-1)%genColors.length]}">
      <div class="org-name"><span>${line1}</span>${line2? `<span>${line2}</span>`:''}</div>
      ${hasKids? `<span class="org-toggle" data-toggle="${id}" title="${isOpen? 'Tutup cabang':'Buka cabang'}">${isOpen? '−':'+'}</span>`:''}
    </div>
    ${hasKids && isOpen? `<ul>${kids.map(kid=>buildOrgNode(kid,false)).join('')}</ul>` : ''}
  </li>`;
}

function renderTreeView(){
  const canvas = document.getElementById('treeViewCanvas');
  if(!canvas) return;
  if(!currentId || !people[currentId]){ canvas.innerHTML=''; return; }
  // buka cabang tingkat pertama secara otomatis setiap kali pindah folder,
  // supaya pengguna langsung melihat anak-anaknya begitu masuk tampilan pohon
  if(currentId !== lastTreeRootId){
    expanded.add(currentId);
    treeScale = 1; treeX = 0; treeY = 0;
    lastTreeRootId = currentId;
  }
  canvas.innerHTML = `<ul class="org-tree">${buildOrgNode(currentId, true)}</ul>`;
  updateTreeTransform();
}

function updateTreeTransform(){
  const canvas = document.getElementById('treeViewCanvas');
  if(canvas) canvas.style.transform = `translate(${treeX}px, ${treeY}px) scale(${treeScale})`;
}

function treeZoom(factor, clientX, clientY){
  const wrap = document.getElementById('treeViewWrap');
  const rect = wrap.getBoundingClientRect();
  const px = (clientX!==undefined? clientX-rect.left : rect.width/2);
  const py = (clientY!==undefined? clientY-rect.top : rect.height/2);
  const newScale = Math.min(2.5, Math.max(0.3, treeScale*factor));
  treeX = px - (px-treeX)*(newScale/treeScale);
  treeY = py - (py-treeY)*(newScale/treeScale);
  treeScale = newScale;
  updateTreeTransform();
}

function treeResetView(){
  treeScale = 1; treeX = 0; treeY = 0;
  updateTreeTransform();
}

(function initTreeViewInteraction(){
  const wrap = document.getElementById('treeViewWrap');
  const canvas = document.getElementById('treeViewCanvas');
  if(!wrap || !canvas) return;

  // klik pada simpul (buka kartu rincian) atau tombol ⊖/⊕ (buka/tutup cabang)
  canvas.addEventListener('click', e=>{
    const toggle = e.target.closest('.org-toggle');
    if(toggle){
      e.stopPropagation();
      const id = toggle.dataset.toggle;
      if(expanded.has(id)) expanded.delete(id); else expanded.add(id);
      renderSidebar();
      renderTreeView();
      return;
    }
    const node = e.target.closest('.org-node');
    if(node) openDetail(node.dataset.id);
  });

  // geser (pan) dengan drag mouse/sentuh, kecuali kalau mulai dari kartu/tombol
  let panning=false, panStartX=0, panStartY=0, startTX=0, startTY=0;
  function panStart(x,y,target){
    if(target.closest && target.closest('.org-node')) return;
    panning = true; panStartX=x; panStartY=y; startTX=treeX; startTY=treeY;
    wrap.classList.add('panning');
  }
  function panMove(x,y){
    if(!panning) return;
    treeX = startTX + (x-panStartX);
    treeY = startTY + (y-panStartY);
    updateTreeTransform();
  }
  function panEnd(){ panning=false; wrap.classList.remove('panning'); }

  wrap.addEventListener('mousedown', e=> panStart(e.clientX, e.clientY, e.target));
  document.addEventListener('mousemove', e=> panMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', panEnd);

  // Sentuhan: 1 jari = geser (pan), 2 jari = cubit untuk zoom (pinch-to-zoom).
  // Sebelumnya tree view di HP cuma bisa di-zoom lewat tombol +/- kecil di pojok,
  // padahal gestur cubit dua jari itu yang paling wajar diharapkan pengguna HP.
  let pinchStartDist = null, pinchStartScale = 1;
  function touchDist(t0,t1){ return Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY); }
  function touchMid(t0,t1){ return {x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2}; }
  wrap.addEventListener('touchstart', e=>{
    if(e.touches.length === 2){
      panning = false; wrap.classList.remove('panning');
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartScale = treeScale;
    } else if(e.touches.length === 1){
      const t=e.touches[0]; panStart(t.clientX, t.clientY, e.target);
    }
  }, {passive:true});
  wrap.addEventListener('touchmove', e=>{
    if(e.touches.length === 2 && pinchStartDist){
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const mid = touchMid(e.touches[0], e.touches[1]);
      const factor = (dist / pinchStartDist) * pinchStartScale / treeScale;
      treeZoom(factor, mid.x, mid.y);
    } else if(panning && e.touches.length === 1){
      const t=e.touches[0]; panMove(t.clientX, t.clientY);
    }
  }, {passive:false});
  wrap.addEventListener('touchend', e=>{
    if(e.touches.length < 2) pinchStartDist = null;
    if(e.touches.length === 0) panEnd();
  });

  // scroll mouse = zoom in/out, berpusat pada posisi kursor
  wrap.addEventListener('wheel', e=>{
    e.preventDefault();
    treeZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
  }, {passive:false});

  document.getElementById('treeZoomIn').onclick = ()=> treeZoom(1.2);
  document.getElementById('treeZoomOut').onclick = ()=> treeZoom(0.8);
  document.getElementById('treeZoomReset').onclick = treeResetView;
})();

function renderStatus(){
  if(!currentId || !people[currentId]){
    document.getElementById('statGen').textContent = 'Belum ada data';
    document.getElementById('statPath').textContent = 'Presented by zurittaqi';
    return;
  }
  const kids = childrenOf(currentId);
  document.getElementById('statGen').textContent = `${kids.length} anggota di folder ini · ${totalGenerations()} generasi total`;
  document.getElementById('statPath').textContent = 'Presented by zurittaqi';
}

function openDetail(id){
  // sorot folder kartu ini di sidebar, pastikan folder induknya tetap terbuka
  highlightedId = id;
  expanded.add(currentId);
  renderSidebar();

  const p = people[id];
  const gen = getGeneration(id);
  const nrb = getNRB(id);
  const isMenantu = !p.parents.length && !rootIds.includes(id);

  const alamatAda = p.provinsi || p.kabupaten || p.kecamatan || p.desa;

  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <button class="panel-back" onclick="closeDetail()" aria-label="Tutup">x</button>
      <div class="avatar" style="background:${genColors[(gen-1)%genColors.length]}">${initials(p.name)}</div>
      <div>
      <h3>${escapeHtml(p.name)}</h3>
        <p>Generasi ke-${gen}${isMenantu? ' · Menantu':''}${p.death?' · Almarhum/ah':''}</p>
        <span class="panel-nrb">NRB ${escapeHtml(nrb)}</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Jenis kelamin</span><span>${p.gender==='L'?'Laki-laki':'Perempuan'}</span></div>
      <div class="panel-row panel-row-tgl"><span>Tanggal Lahir</span><span>${renderTanggalLengkap(p.birth)}</span></div>
      <div class="panel-row panel-row-tgl"><span>Tanggal Wafat</span><span>${p.death? renderTanggalLengkap(p.death) : '—'}</span></div>
      ${(()=>{
        // Mendukung hingga 4 pasangan (poligami/poliandri): setiap slot Pasangan I-IV
        // ditampilkan sebagai baris terpisah. Slot yang sudah terisi menampilkan link
        // ke kartu pasangan tsb; slot kosong PERTAMA menampilkan tombol "+ Tambah pasangan";
        // slot kosong setelahnya tidak ditampilkan sampai slot sebelumnya terisi.
        const romawi = ['I','II','III','IV'];
        return romawi.map((r, idx)=>{
          const sid = p.spouses[idx];
          if(sid && people[sid]){
            return `<div class="panel-row"><span>Pasangan ${r}</span><span><a href="#" onclick="openDetail('${sid}');return false;">${escapeHtml(people[sid].name)}</a></span></div>`;
          }
          if(idx === p.spouses.length && p.spouses.length < 4){
            return `<div class="panel-row"><span>Pasangan ${r}</span><span><button class="btn btn-ghost btn-sm" onclick="enterAddSpouseMode('${id}')">＋ Tambah pasangan</button></span></div>`;
          }
          return '';
        }).join('');
      })()}
      <div class="panel-row"><span>Orang tua</span><span>${p.parents.map(s=>escapeHtml(people[s].name)).join(' & ')||'—'}</span></div>

      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><span>${escapeHtml(p.provinsi)||'—'}</span></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><span>${escapeHtml(p.kabupaten)||'—'}</span></div>
      <div class="panel-row"><span>Kecamatan</span><span>${escapeHtml(p.kecamatan)||'—'}</span></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><span>${escapeHtml(p.desa)||'—'}</span></div>
      <div class="panel-row"><span>RT/RW</span><span>${escapeHtml(p.rtrw)||'—'}</span></div>
      <div class="panel-row"><span>No. HP</span><span>${escapeHtml(p.phone)||'—'}</span></div>
      <div class="panel-row"><span>Email</span><span>${escapeHtml(p.email)||'—'}</span></div>

      <div class="panel-row"><span>Lokasi (Google Maps)</span><span>${
        p.mapsUrl && /^https?:\/\//i.test(p.mapsUrl.trim())
          ? `<a class="panel-maps" href="${escapeHtml(p.mapsUrl)}" target="_blank" rel="noopener">📍 Buka lokasi</a>`
          : '—'
      }</span></div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-text" onclick="enterAddChildMode('${id}')">Tambah Anak</button>
      <button class="btn btn-ghost btn-flex" onclick="closeDetail()"><span class="btn-full">Tutup</span><span class="btn-short">T</span></button>
      <button class="btn btn-primary btn-flex" onclick="enterEditMode('${id}')"><span class="btn-full">Edit data</span><span class="btn-short">E</span></button>
    </div>`;
  editingMode = false; // membuka kartu selalu mulai dari mode lihat (bukan mode entri)
  document.getElementById('overlay').classList.add('show');
  // tunda pemasangan listener sampai klik pembuka ini selesai, agar popup tidak langsung tertutup
  // listener dipasang di fase CAPTURE (true) supaya tetap terpicu walau elemen yang diklik
  // (mis. folder di pohon keluarga / tombol buka keturunan) memanggil e.stopPropagation()
  setTimeout(()=>{ document.addEventListener('click', outsideClickCloseDetail, true); }, 0);
}

/* ---- Mode entri/edit data pada kartu detail ----
   Selama editingMode = true, popup TIDAK boleh tertutup karena klik di luar kartu
   (lihat outsideClickCloseDetail). Popup hanya menutup lewat tombol "Simpan"
   (atau "Batal" bila pengguna sengaja membatalkan perubahan). */
function enterEditMode(id){
  const p = people[id];
  editingMode = true;
  document.getElementById('detailPanel').querySelector('.panel-footer')?.remove();
  const body = document.getElementById('detailPanel').querySelector('.panel-body');
  if(body){
    body.innerHTML = `
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_name" type="text" value="${escapeHtml(p.name)}"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_gender">
          <option value="L" ${p.gender==='L'?'selected':''}>Laki-laki</option>
          <option value="P" ${p.gender==='P'?'selected':''}>Perempuan</option>
        </select></div>
      <div class="panel-row"><span>Tanggal Lahir</span><input id="f_birth" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" value="${escapeHtml(p.birth)}" oninput="formatTglLahir(this)"></div>
      <div class="panel-row"><span>Tanggal Wafat</span><input id="f_death" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" value="${escapeHtml(p.death)}" oninput="formatTglLahir(this)"></div>

      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_provinsi" type="text" value="${escapeHtml(p.provinsi)}"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_kabupaten" type="text" value="${escapeHtml(p.kabupaten)}"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_kecamatan" type="text" value="${escapeHtml(p.kecamatan)}"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_desa" type="text" value="${escapeHtml(p.desa)}"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_rtrw" type="text" value="${escapeHtml(p.rtrw)}"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_phone" type="text" value="${escapeHtml(p.phone)}"></div>
      <div class="panel-row"><span>Email</span><input id="f_email" type="text" value="${escapeHtml(p.email)}"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_maps" type="text" placeholder="https://maps.google.com/?q=..." value="${escapeHtml(p.mapsUrl)}"></div>
      <div class="panel-hint" style="margin-top:8px;font-size:11.5px;color:var(--ink-soft);">
        Sedang mengedit data — kartu ini tidak akan tertutup meski Anda mengklik di luar. Klik <b>Simpan</b> untuk menyimpan, atau <b>Batal</b> untuk membatalkan.
      </div>`;
  }
  const panel = document.getElementById('detailPanel');
  const footer = document.createElement('div');
  footer.className = 'panel-footer';
  footer.innerHTML = `
    <button class="btn btn-ghost" onclick="cancelEditMode('${id}')">Batal</button>
    <button class="btn btn-primary" onclick="saveEditMode('${id}')">Simpan</button>`;
  panel.appendChild(footer);
}
function saveEditMode(id){
  const p = people[id];
  const before = {...p}; // salin nilai lama sebelum diubah, khusus untuk keperluan audit log
  const val = sel => { const el = document.getElementById(sel); return el? el.value.trim() : ''; };
  const newName = val('f_name');
  if(!newName){ alert('Nama lengkap wajib diisi.'); return; }
  p.name = newName;
  p.gender = val('f_gender') || p.gender;
  p.birth = val('f_birth');
  p.death = val('f_death');
  p.provinsi = val('f_provinsi');
  p.kabupaten = val('f_kabupaten');
  p.kecamatan = val('f_kecamatan');
  p.desa = val('f_desa');
  p.rtrw = val('f_rtrw');
  p.phone = val('f_phone');
  p.email = val('f_email');
  p.mapsUrl = val('f_maps');

  // audit log: catat kolom apa saja yang benar-benar berubah (bukan seluruh isi form)
  const fieldLabels = {
    name:'Nama', gender:'Jenis kelamin', birth:'Tanggal lahir', death:'Tanggal wafat',
    provinsi:'Provinsi', kabupaten:'Kabupaten/Kota', kecamatan:'Kecamatan', desa:'Desa/Kelurahan',
    rtrw:'RT/RW', phone:'No. HP', email:'Email', mapsUrl:'Link Maps',
  };
  const changes = [];
  Object.keys(fieldLabels).forEach(f=>{
    const oldV = before[f] || '';
    const newV = p[f] || '';
    if(oldV !== newV) changes.push({field: fieldLabels[f], from: oldV || '—', to: newV || '—'});
  });
  if(changes.length){
    const summary = changes.length === 1
      ? `Mengubah ${changes[0].field}: ${changes[0].from} → ${changes[0].to}`
      : `Mengubah data ${p.name} (${changes.length} kolom): ` + changes.map(c=>c.field).join(', ');
    logAudit('edit', id, summary, changes);
  }

  editingMode = false;
  savePersonToDB(id);
  openDetail(id);   // kembali ke tampilan lihat dengan data terbaru
  render();         // refresh tampilan utama (kartu/pohon) jika ada data yang berubah
}
function cancelEditMode(id){
  editingMode = false;
  openDetail(id);   // kembali ke tampilan lihat tanpa menyimpan perubahan
}

/* ---- Tambah Pasangan: mengubah status "belum menikah" menjadi menikah ----
   Kartu pasangan baru otomatis dibuat setara kartu keturunan langsung (nama, data
   diri, alamat/kontak, link maps, dsb), dan NRB-nya otomatis "ikut" NRB suami/istri
   (lihat getNRB: orang tanpa parents yang punya spouses akan memakai NRB pasangan + "-P"). */
function enterAddSpouseMode(id){
  const romawi = ['I','II','III','IV'];
  const existingCount = (people[id].spouses||[]).length;
  if(existingCount >= 4){ alert('Maksimal 4 pasangan (Pasangan I-IV) per orang.'); return; }
  const nextLabel = romawi[existingCount];
  editingMode = true;
  document.getElementById('detailPanel').querySelector('.panel-footer')?.remove();
  const body = document.getElementById('detailPanel').querySelector('.panel-body');
  if(body){
    body.innerHTML = `
      <div class="panel-section-title">Tambah Data Pasangan ${nextLabel}</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_sp_name" type="text" placeholder="Nama pasangan"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_sp_gender">
          <option value="P">Perempuan</option>
          <option value="L">Laki-laki</option>
        </select></div>
      <div class="panel-row"><span>Tahun lahir</span><input id="f_sp_birth" type="text"></div>
      <div class="panel-row"><span>Tahun wafat</span><input id="f_sp_death" type="text"></div>

      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_sp_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_sp_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_sp_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_sp_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_sp_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_sp_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_sp_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_sp_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>
      <div class="panel-hint" style="margin-top:8px;font-size:11.5px;color:var(--ink-soft);">
        NRB pasangan otomatis mengikuti NRB ${escapeHtml(people[id].name)}. Kartu ini tidak akan tertutup sampai Anda menekan <b>Simpan</b> atau <b>Batal</b>.
      </div>`;
  }
  const panel = document.getElementById('detailPanel');
  const footer = document.createElement('div');
  footer.className = 'panel-footer';
  footer.innerHTML = `
    <button class="btn btn-ghost" onclick="cancelAddSpouse('${id}')">Batal</button>
    <button class="btn btn-primary" onclick="saveAddSpouse('${id}')">Simpan</button>`;
  panel.appendChild(footer);
}
function saveAddSpouse(id){
  if((people[id].spouses||[]).length >= 4){ alert('Maksimal 4 pasangan (Pasangan I-IV) per orang.'); return; }
  const val = sel => { const el = document.getElementById(sel); return el? el.value.trim() : ''; };
  const name = val('f_sp_name');
  if(!name){ alert('Nama pasangan wajib diisi.'); return; }
  const newId = 'sp_' + id + '_' + Date.now(); // id unik, tidak ditampilkan ke pengguna
  people[newId] = {
    name, gender: val('f_sp_gender') || 'P',
    birth: val('f_sp_birth'), death: val('f_sp_death'),
    parents: [], spouses: [id],
    provinsi: val('f_sp_provinsi'), kabupaten: val('f_sp_kabupaten'),
    kecamatan: val('f_sp_kecamatan'), desa: val('f_sp_desa'), rtrw: val('f_sp_rtrw'),
    phone: val('f_sp_phone'), email: val('f_sp_email'), mapsUrl: val('f_sp_maps'),
  };
  people[id].spouses.push(newId); // menikahkan: status "belum menikah" -> "menikah"
  editingMode = false;
  savePersonToDB(newId);
  savePersonToDB(id);
  logAudit('add', newId, `Menambah pasangan: ${name} (untuk ${people[id].name})`);
  openDetail(id);
  render();
}
function cancelAddSpouse(id){
  editingMode = false;
  openDetail(id);
}

/* ---- Tambah Anak: menambahkan anak baru di folder yang sedang dibuka ----
   Orang tua anak baru otomatis = orang yang folder-nya sedang dibuka beserta
   pasangannya (jika sudah menikah), sehingga anak langsung tampil di folder yang benar. */
function enterAddChildMode(parentId){
  if(!parentId || !people[parentId]){
    alert('Belum ada leluhur/akar yang tercatat. Fitur "Tambah Ortu" untuk saat ini dinonaktifkan.');
    return;
  }
  editingMode = true;
  const parent = people[parentId];
  const spouseIds = parent.spouses || [];
  const parentNames = escapeHtml([parent.name, ...spouseIds.map(s=>people[s].name)].join(' & '));
  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">＋</div>
      <div>
        <h3>Tambah Anak Baru</h3>
        <p>Anak dari ${parentNames}</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_ch_name" type="text" placeholder="Nama lengkap"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_ch_gender">
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select></div>
      <div class="panel-row"><span>Tahun lahir</span><input id="f_ch_birth" type="text"></div>
      <div class="panel-row"><span>Tahun wafat</span><input id="f_ch_death" type="text"></div>

      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_ch_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_ch_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_ch_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_ch_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_ch_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_ch_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_ch_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_ch_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>
      <div style="margin-top:8px;font-size:11.5px;color:var(--ink-soft);">
        Kartu ini tidak akan tertutup sampai Anda menekan <b>Simpan</b> atau <b>Batal</b>.
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelAddChild()">Batal</button>
      <button class="btn btn-primary" onclick="saveAddChild('${parentId}')">Simpan</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(()=>{ document.addEventListener('click', outsideClickCloseDetail, true); }, 0);
}
function saveAddChild(parentId){
  const val = sel => { const el = document.getElementById(sel); return el? el.value.trim() : ''; };
  const name = val('f_ch_name');
  if(!name){ alert('Nama anggota wajib diisi.'); return; }
  const parent = people[parentId];
  const parentIds = [parentId, ...(parent.spouses||[])];
  const newId = 'ch_' + parentId + '_' + Date.now();
  const existingSiblings = childrenOf(parentId); // sudah urut & sudah termigrasi
  const nextOrder = existingSiblings.length
    ? Math.max(...existingSiblings.map(sid=>people[sid].siblingOrder)) + 1
    : 0;
  people[newId] = {
    name, gender: val('f_ch_gender') || 'L',
    birth: val('f_ch_birth'), death: val('f_ch_death'),
    parents: parentIds, spouses: [], siblingOrder: nextOrder,
    provinsi: val('f_ch_provinsi'), kabupaten: val('f_ch_kabupaten'),
    kecamatan: val('f_ch_kecamatan'), desa: val('f_ch_desa'), rtrw: val('f_ch_rtrw'),
    phone: val('f_ch_phone'), email: val('f_ch_email'), mapsUrl: val('f_ch_maps'),
  };
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  expanded.add(parentId);
  currentId = parentId;
  savePersonToDB(newId);
  logAudit('add', newId, `Menambah anak: ${name}`);
  render();
}
function cancelAddChild(){
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
}

/* ---- Tambah Orang Tua ----
   Kalau ada anggota yang sedang dipilih (currentId), orang baru ini menjadi
   salah satu orang tua dari anggota tersebut (maksimal 2 orang tua tercatat).
   Kalau anggota tersebut sebelumnya adalah leluhur/akar pohon, ia otomatis
   "turun" satu generasi karena kini punya orang tua baru.
   Kalau belum ada anggota yang dipilih (mis. pohon keluarga masih kosong),
   orang baru ini menjadi leluhur/akar pohon — leluhur (akar) lama yang sudah
   ada otomatis menjadi anak dari leluhur baru ini. */
function enterAddParentMode(){
  editingMode = true;
  const targetId = (currentId && people[currentId]) ? currentId : null;
  let introText;
  if(targetId){
    const existingParents = people[targetId].parents || [];
    if(existingParents.length >= 2){
      editingMode = false;
      alert(`${people[targetId].name} sudah memiliki 2 orang tua tercatat.`);
      return;
    }
    introText = `Akan menjadi orang tua dari ${escapeHtml(people[targetId].name)}`;
  } else {
    const oldRootNames = rootIds.length ? escapeHtml(rootIds.map(id=>people[id].name).join(', ')) : null;
    introText = oldRootNames
      ? `Akan menjadi leluhur di atas ${oldRootNames}`
      : `Akan menjadi leluhur/akar pertama di pohon keluarga ini`;
  }
  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">⏫</div>
      <div>
        <h3>Tambah Orang Tua</h3>
        <p>${introText}</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_an_name" type="text" placeholder="Nama lengkap"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_an_gender">
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select></div>
      <div class="panel-row"><span>Tahun lahir</span><input id="f_an_birth" type="text"></div>
      <div class="panel-row"><span>Tahun wafat</span><input id="f_an_death" type="text"></div>

      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_an_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_an_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_an_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_an_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_an_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_an_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_an_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_an_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>
      <div style="margin-top:8px;font-size:11.5px;color:var(--ink-soft);">
        Kartu ini tidak akan tertutup sampai Anda menekan <b>Simpan</b> atau <b>Batal</b>.
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelAddParent()">Batal</button>
      <button class="btn btn-primary" onclick="saveAddParent('${targetId || ''}')">Simpan</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(()=>{ document.addEventListener('click', outsideClickCloseDetail, true); }, 0);
}
function saveAddParent(targetId){
  const val = sel => { const el = document.getElementById(sel); return el? el.value.trim() : ''; };
  const name = val('f_an_name');
  if(!name){ alert('Nama orang tua wajib diisi.'); return; }
  const newId = 'par_' + Date.now();
  people[newId] = {
    name, gender: val('f_an_gender') || 'L',
    birth: val('f_an_birth'), death: val('f_an_death'),
    parents: [], spouses: [],
    provinsi: val('f_an_provinsi'), kabupaten: val('f_an_kabupaten'),
    kecamatan: val('f_an_kecamatan'), desa: val('f_an_desa'), rtrw: val('f_an_rtrw'),
    phone: val('f_an_phone'), email: val('f_an_email'), mapsUrl: val('f_an_maps'),
  };
  if(targetId && people[targetId]){
    // orang baru menjadi orang tua dari anggota yang sedang dipilih
    const person = people[targetId];
    person.parents = [...(person.parents || []), newId];
    savePersonToDB(targetId);
    const idx = rootIds.indexOf(targetId);
    if(idx !== -1){
      // anggota ini sebelumnya leluhur/akar -> kini "turun" jadi anak, leluhur baru jadi akar
      rootIds.splice(idx, 1);
      rootIds.push(newId);
      saveRootIdsToDB();
    }
  } else {
    // belum ada anggota yang dipilih -> orang baru jadi leluhur/akar baru,
    // leluhur (akar) lama menjadi anak dari leluhur baru ini
    const oldRootIds = [...rootIds];
    oldRootIds.forEach(rid => { people[rid].parents = [newId]; savePersonToDB(rid); });
    rootIds.length = 0;
    rootIds.push(newId);
    saveRootIdsToDB();
  }
  currentId = newId;
  expanded.add(newId);
  editingMode = false;
  savePersonToDB(newId);
  logAudit('add', newId, `Menambah orang tua: ${name}`);
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  render();
}
function cancelAddParent(){
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
}

/* ================= HAPUS ORANG =================
   Keputusan desain "yatim piatu":
   - Kalau anak masih punya orang tua lain yang tidak dihapus (co-parent), anak itu
     TIDAK dianggap yatim piatu — dia tetap tersambung normal lewat orang tua yang tersisa,
     tidak perlu tindakan apa pun.
   - Kalau orang yang dihapus adalah SATU-SATUNYA orang tua yang tercatat untuk anak itu,
     baru berlaku pilihan pengguna:
       "naik"    -> anak dinaikkan jadi anak dari kakek/neneknya (orang tua dari yang dihapus).
                    Jika yang dihapus sendiri tidak punya orang tua (dia leluhur/akar),
                    anak otomatis jadi leluhur/akar baru.
       "root"    -> anak langsung dijadikan leluhur/akar baru terpisah, tidak dinaikkan.
       "cascade" -> anak (dan seluruh keturunannya) dihapus juga, tanpa kecuali. */
function enterDeleteMode(id){
  editingMode = true;
  const p = people[id];
  const kids = childrenOf(id);
  const trulyOrphaned = kids.filter(k => (people[k].parents||[]).length === 1);
  const grandParentNames = escapeHtml((p.parents||[]).map(pp=>people[pp].name).join(' & '));
  const safeName = escapeHtml(p.name);

  let bodyHtml;
  if(kids.length === 0){
    bodyHtml = `<div style="font-size:13px;">Orang ini belum punya anak yang tercatat, jadi datanya bisa langsung dihapus dengan aman.</div>`;
  } else {
    bodyHtml = `
      <div class="panel-section-title">${safeName} tercatat punya ${kids.length} anak.</div>
      <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px;">
        ${trulyOrphaned.length
          ? trulyOrphaned.length+' dari anak tsb. hanya punya '+safeName+' sbg orang tua tercatat (akan jadi "yatim piatu" data kalau tidak diurus). Anak lain yang masih punya orang tua satunya (co-parent) akan tetap tersambung normal seperti biasa.'
          : 'Untungnya semua anak tsb. masih punya orang tua lain (co-parent) yang tidak ikut dihapus, jadi mereka tetap tersambung normal.'}
      </div>
      <div class="panel-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="naik" checked style="margin-top:3px;">
          <span>Anak yang jadi yatim piatu dinaikkan jadi anak dari ${grandParentNames||'leluhur/akar baru'} ${grandParentNames?'(kakek/neneknya)':''} — <i>disarankan</i></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="root" style="margin-top:3px;">
          <span>Anak yang jadi yatim piatu dijadikan leluhur/akar baru terpisah (bukan dinaikkan ke kakek/nenek)</span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="cascade" style="margin-top:3px;">
          <span style="color:var(--maroon);">Hapus juga SEMUA anak &amp; keturunan ${safeName} (termasuk yang masih punya co-parent) — tidak bisa dibatalkan</span>
        </label>
      </div>`;
  }

  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:var(--maroon)">🗑️</div>
      <div>
        <h3>Hapus ${safeName}?</h3>
        <p>Tindakan ini akan langsung tersimpan permanen setelah Anda menekan "Ya, Hapus".</p>
      </div>
    </div>
    <div class="panel-body">${bodyHtml}</div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelDelete('${id}')">Batal</button>
      <button class="btn" style="background:var(--maroon);color:#fff;" onclick="confirmDelete('${id}')">🗑️ Ya, Hapus</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(()=>{ document.addEventListener('click', outsideClickCloseDetail, true); }, 0);
}
function confirmDelete(id){
  const kids = childrenOf(id);
  let orphanChoice = 'naik';
  if(kids.length){
    const checked = document.querySelector('input[name="f_del_orphan"]:checked');
    orphanChoice = checked ? checked.value : 'naik';
  }
  const deletedName = people[id].name; // simpan dulu sebelum terhapus, khusus utk audit log
  if(orphanChoice === 'cascade'){
    const totalAffected = 1 + countDescendants(id); // hitung dulu sebelum data ikut terhapus
    deletePersonCascade(id);
    logAudit('delete', null, totalAffected > 1
      ? `Menghapus ${totalAffected} data (${deletedName} beserta keturunannya)`
      : `Menghapus data: ${deletedName}`);
  } else {
    deletePersonKeepChildren(id, orphanChoice);
    logAudit('delete', null, `Menghapus data: ${deletedName}`);
  }
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  // kalau folder yang sedang dibuka ikut terhapus, pindah ke akar pertama yang masih ada
  if(!people[currentId]) currentId = rootIds[0] || Object.keys(people)[0];
  render();
}
function cancelDelete(id){
  editingMode = false;
  openDetail(id);
}
function deletePersonKeepChildren(id, orphanChoice){
  const p = people[id];
  const kids = childrenOf(id);
  const grandParents = p.parents || [];
  kids.forEach(kid=>{
    const kp = people[kid];
    kp.parents = kp.parents.filter(pp=>pp!==id);
    if(kp.parents.length === 0){
      // benar-benar yatim piatu: id adalah satu-satunya orang tua yang tercatat
      if(orphanChoice === 'naik' && grandParents.length){
        grandParents.forEach(gp=>{ if(!kp.parents.includes(gp)) kp.parents.push(gp); });
      }
      if(kp.parents.length === 0 && !rootIds.includes(kid)) rootIds.push(kid);
    }
    // kalau kp.parents masih py isi (co-parent lain masih ada), tidak perlu apa-apa —
    // anak tetap tersambung normal lewat orang tua yang tersisa.
    savePersonToDB(kid);
  });
  removePersonEverywhere(id);
}
function deletePersonCascade(id){
  // hapus rekursif dari bawah (anak & keturunan) dulu, baru orangnya sendiri
  childrenOf(id).forEach(kid => deletePersonCascade(kid));
  removePersonEverywhere(id);
}
function removePersonEverywhere(id){
  const p = people[id];
  if(!p) return;
  // lepaskan status "menikah" dari pasangan-pasangannya
  (p.spouses||[]).forEach(spId=>{
    const sp = people[spId];
    if(!sp) return;
    sp.spouses = (sp.spouses||[]).filter(s=>s!==id);
    // kalau pasangan itu jadi "melayang" (tidak py orang tua & tidak py pasangan lain & bukan akar),
    // jadikan leluhur/akar baru supaya datanya tetap terlihat & bisa dibuka, bukan hilang begitu saja.
    if(!sp.parents.length && !sp.spouses.length && !rootIds.includes(spId)) rootIds.push(spId);
    savePersonToDB(spId);
  });
  if(rootIds.includes(id)) rootIds.splice(rootIds.indexOf(id),1);
  expanded.delete(id);
  delete people[id];
  deletePersonFromDB(id);
  saveRootIdsToDB();
}
function deletePersonFromDB(id){
  if(!db) return;
  db.collection('people').doc(id).delete().catch(err=>console.error('Gagal menghapus data orang:', err));
}

/* ================= URUTAN ANAK (drag & drop) =================
   Fitur ini HANYA mengubah urutan tampil antar saudara kandung/tiri yang sama-sama
   berada di folder currentId (field people[id].siblingOrder). Fitur ini TIDAK PERNAH
   mengubah people[id].parents — jadi hierarki/silsilah (siapa anak siapa) dijamin
   tidak akan berubah, hanya urutan tampilnya di pohon & grid yang berubah. */
function reorderSiblingBeforeTarget(draggedId, targetId){
  if(draggedId === targetId) return;
  const siblings = childrenOf(currentId); // daftar lengkap & sudah urut, folder yang sedang aktif
  if(!siblings.includes(draggedId) || !siblings.includes(targetId)) return;
  const without = siblings.filter(sid => sid !== draggedId);
  const idx = without.indexOf(targetId);
  without.splice(idx, 0, draggedId);
  without.forEach((sid,i)=>{ if(people[sid].siblingOrder !== i){ people[sid].siblingOrder = i; savePersonToDB(sid); } });
  render();
}
function makeOlderSibling(id){
  // "Jadikan kakak": naik satu tingkat/posisi, tukar tempat dengan yang persis di atasnya
  // (melangkahinya). Kalau sudah paling atas (kakak tertua/akar pertama), tidak ada yang
  // dilangkahi -> diam saja. Dipakai dari kartu grid maupun folder di pohon keluarga, jadi
  // TIDAK bergantung pada folder mana yang sedang dibuka (currentId) — konteks saudaranya
  // diambil dari data orang itu sendiri (orang tuanya, atau rootIds kalau dia leluhur/akar).
  if(!people[id].parents.length){
    // leluhur/akar tanpa orang tua: "saudaranya" adalah sesama akar lain di rootIds
    const idx = rootIds.indexOf(id);
    if(idx <= 0) return;
    [rootIds[idx-1], rootIds[idx]] = [rootIds[idx], rootIds[idx-1]];
    saveRootIdsToDB();
    render();
    return;
  }
  const siblings = childrenOf(people[id].parents[0]);
  const idx = siblings.indexOf(id);
  if(idx <= 0) return;
  const above = siblings[idx-1];
  const tmp = people[id].siblingOrder;
  people[id].siblingOrder = people[above].siblingOrder;
  people[above].siblingOrder = tmp;
  savePersonToDB(id); savePersonToDB(above);
  render();
}
function makeYoungerSibling(id){
  // "Jadikan adik": turun satu tingkat/posisi, tukar tempat dengan yang persis di bawahnya
  // (melangkahinya). Kalau sudah paling bawah (adik termuda/akar terakhir), diam saja.
  if(!people[id].parents.length){
    const idx = rootIds.indexOf(id);
    if(idx === -1 || idx >= rootIds.length-1) return;
    [rootIds[idx], rootIds[idx+1]] = [rootIds[idx+1], rootIds[idx]];
    saveRootIdsToDB();
    render();
    return;
  }
  const siblings = childrenOf(people[id].parents[0]);
  const idx = siblings.indexOf(id);
  if(idx === -1 || idx >= siblings.length-1) return;
  const below = siblings[idx+1];
  const tmp = people[id].siblingOrder;
  people[id].siblingOrder = people[below].siblingOrder;
  people[below].siblingOrder = tmp;
  savePersonToDB(id); savePersonToDB(below);
  render();
}

function closeDetail(){
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  // sorotan kembali ke folder induk (currentId)
  highlightedId = null;
  renderSidebar();
}
function outsideClickCloseDetail(e){
  if(editingMode) return; // sedang entri/edit data: jangan tertutup otomatis, hanya tombol Simpan yang boleh menutup
  const panel = document.getElementById('detailPanel');
  if(panel && !panel.contains(e.target)){ closeDetail(); }
}

/* ================= MODAL KEDUA: Riwayat Perubahan & Profil =================
   Memakai overlay/panel terpisah (modalOverlay/modalPanel) supaya tidak bentrok dengan
   overlay/detailPanel yang dipakai untuk buka/edit/tambah data orang. */
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
}
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'modalOverlay') closeModal();
});

let auditCursor = null; // dokumen terakhir yang sudah dimuat, untuk tombol "muat lebih banyak"
const AUDIT_PAGE_SIZE = 50;

function formatAuditTimestamp(ts){
  if(!ts || !ts.toDate) return 'baru saja';
  const d = ts.toDate();
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`;
}
function auditActionIcon(action){
  return action==='add' ? '➕' : action==='edit' ? '✏️' : action==='delete' ? '🗑️' : '•';
}
function renderAuditEntries(docs, append){
  const list = document.getElementById('auditList');
  const old = document.getElementById('auditLoadMoreBtn');
  if(old) old.remove();
  if(!append) list.innerHTML = '';
  if(!append && docs.length===0){
    list.innerHTML = '<div class="audit-empty">Belum ada riwayat perubahan tercatat.</div>';
    return;
  }
  docs.forEach(doc=>{
    const d = doc.data();
    const row = document.createElement('div');
    row.className = 'audit-entry';
    row.innerHTML = `
      <span class="audit-time">${formatAuditTimestamp(d.ts)}</span>
      <span class="audit-user">${escapeHtml(d.userName) || 'Tidak diketahui'}</span>
      <span class="audit-summary"><span class="audit-icon">${auditActionIcon(d.action)}</span>${escapeHtml(d.summary)}</span>`;
    list.appendChild(row);
  });
  if(docs.length === AUDIT_PAGE_SIZE){
    const btn = document.createElement('button');
    btn.id = 'auditLoadMoreBtn';
    btn.className = 'audit-loadmore';
    btn.textContent = 'Muat lebih banyak…';
    btn.onclick = ()=> loadAuditPage(true);
    list.appendChild(btn);
  }
}
function loadAuditPage(append){
  let q = db.collection('auditLog').orderBy('ts','desc').limit(AUDIT_PAGE_SIZE);
  if(append && auditCursor) q = q.startAfter(auditCursor);
  q.get().then(snap=>{
    if(snap.docs.length) auditCursor = snap.docs[snap.docs.length-1];
    renderAuditEntries(snap.docs, append);
  }).catch(err=>{
    console.error('Gagal memuat riwayat perubahan:', err);
    document.getElementById('auditList').innerHTML = '<div class="audit-empty">Gagal memuat riwayat. Coba lagi nanti.</div>';
  });
}
function openAuditLog(){
  if(!db){ alert('Riwayat perubahan memerlukan Firestore. Firebase belum dikonfigurasi.'); return; }
  auditCursor = null;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[1]}">📜</div>
      <div>
        <h3>Riwayat Perubahan</h3>
        <p>Siapa mengubah apa dan kapan</p>
      </div>
    </div>
    <div class="panel-body" id="auditList"><div class="audit-empty">Memuat riwayat…</div></div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
  loadAuditPage(false);
}

// Catatan silsilah: menggantikan tombol "Tambah Ortu" untuk sementara (lihat dropdown Aksi).
// Menampilkan nasab/silsilah leluhur secara statis lewat modal generik (modalOverlay/modalPanel)
// yang sama dipakai oleh Riwayat Perubahan.
const CATATAN_SILSILAH_TEXT = 'KH Mas Mansur bin Djojoredjo bin Mertoloyo bin Wongso Dipuro bin Wongso Menggolo';
function openCatatan(){
  // Tiap nama (selain kata penghubung "bin") dibungkus pill kecil berpadding tipis,
  // meniru gaya badge/pill yang dipakai di kartu anak (.pill) supaya konsisten.
  const namaSilsilah = CATATAN_SILSILAH_TEXT.split(' bin ').map(escapeHtml);
  const catatanHtml = namaSilsilah
    .map(n => `<span class="catatan-name">${n}</span>`)
    .join(' bin ');
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">📝</div>
      <div>
        <h3>Catatan</h3>
        <p>Nasab / silsilah leluhur</p>
      </div>
    </div>
    <div class="panel-body">
      <p style="line-height:2.6;">${catatanHtml}</p>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Tutup</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

function openProfileEditor(){
  const p = currentUserProfile || {name:'', region:''};
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[2]}">👤</div>
      <div>
        <h3>Profil Anda</h3>
        <p>Nama ini akan tampil di riwayat perubahan</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-row"><span>Nama</span><input id="f_prof_name" type="text" value="${escapeHtml(p.name)}"></div>
      <div class="panel-row"><span>Wilayah/Cabang</span><input id="f_prof_region" type="text" value="${escapeHtml(p.region)}" placeholder="opsional"></div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveProfile()">Simpan</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}
function saveProfile(){
  const name = document.getElementById('f_prof_name').value.trim();
  const region = document.getElementById('f_prof_region').value.trim();
  if(!name){ alert('Nama wajib diisi.'); return; }
  const email = (auth && auth.currentUser) ? auth.currentUser.email : '';
  currentUserProfile = {name, region, email};
  if(db && auth && auth.currentUser){
    db.collection('users').doc(auth.currentUser.uid).set(currentUserProfile)
      .catch(err=>console.error('Gagal menyimpan profil:', err));
  }
  closeModal();
}

function openCtxMenu(e,id){
  const menu=document.getElementById('ctxMenu');
  const container = document.getElementById('contentArea');
  const containerRect = container.getBoundingClientRect();
  menu.style.display='block';
  // posisi dihitung dari koordinat kursor di layar (clientX/Y), dikurangi posisi
  // .content (karena .ctx-menu itu position:absolute relatif ke .content) — BUKAN
  // e.offsetX/Y, yang relatif ke elemen yang diklik (kartu / baris sidebar / node
  // pohon) dan karenanya salah tempat kalau menu dipicu dari luar .content (mis. sidebar).
  let left = e.clientX - containerRect.left;
  let top = e.clientY - containerRect.top;
  // jaga agar menu tidak terpotong di tepi kanan/bawah kontainer
  const menuW = 200, menuH = 220; // perkiraan aman, menu belum ter-render ukurannya
  left = Math.max(4, Math.min(left, containerRect.width - menuW));
  top = Math.max(4, Math.min(top, containerRect.height - menuH));
  menu.style.left=left+'px';
  menu.style.top=top+'px';
  menu.dataset.target=id;
}
document.addEventListener('click', ()=>{ document.getElementById('ctxMenu').style.display='none'; });
document.getElementById('ctxMenu').addEventListener('click',(e)=>{
  const act=e.target.dataset.act;
  const id=document.getElementById('ctxMenu').dataset.target;
  if(!act) return;
  // Leluhur (akar tanpa orang tua) selalu menampilkan kartu detailnya sendiri saat
  // diklik kanan -> "Buka", meskipun ia punya anak; navigasi folder tetap dipakai
  // untuk orang lain yang punya anak.
  if(act==='open'){
    const isLeluhurTanpaOrtu = rootIds.includes(id) && !people[id].parents.length;
    if(childrenOf(id).length && !isLeluhurTanpaOrtu){ currentId=id; expanded.add(id); render(); }
    else openDetail(id);
  }
  // "Edit data" dari menu klik-kanan: enterEditMode() hanya mengganti isi panel-body/footer
  // (ia tidak membangun panel dari nol), jadi kartu rincian harus dibuka dulu lewat openDetail()
  // sebelum langsung dialihkan ke mode edit — sama seperti alur tombol "Edit data" di kartu detail.
  if(act==='edit'){ openDetail(id); enterEditMode(id); }
  // "Tambah anak" membangun panel lengkap dari nol sendiri, jadi bisa langsung dipanggil
  // tanpa openDetail() dulu. "Jadikan kakak/adik" hanya menukar urutan tampil (siblingOrder)
  // dengan saudara persis di atas/bawahnya (naik/turun satu tingkat) — TIDAK mengubah orang tua siapa pun.
  if(act==='addchild'){ enterAddChildMode(id); }
  if(act==='olderSibling'){ makeOlderSibling(id); }
  if(act==='youngerSibling'){ makeYoungerSibling(id); }
  if(act==='delete'){ enterDeleteMode(id); }
});

/* Pencarian: kotak ini memfilter anak-anak di folder yang sedang dibuka (langsung, tanpa
   jeda, karena cuma menyaring elemen yang sudah ada di DOM). Kalau ketikan tidak cocok
   dengan siapa pun di folder aktif -- atau memang mengetik cukup panjang -- kita cari
   JUGA ke SELURUH silsilah (bukan cuma folder aktif) dan tampilkan hasilnya sebagai daftar
   yang bisa diklik untuk langsung lompat ke orang tsb, di mana pun posisinya di pohon.
   Pencarian global di-debounce (200ms) karena men-scan seluruh `people` tiap ketukan
   akan terasa berat kalau datanya sudah ribuan orang. */
let searchDebounceTimer = null;
function pathToRoot(id){
  // nama leluhur -> ... -> orang tua langsung, dipakai untuk menampilkan "lokasi" hasil
  // pencarian global (mis. "Ahmad Kuzari › Budi › Cici")
  const chain = [];
  let cur = id;
  const guard = new Set();
  while(cur && people[cur] && !guard.has(cur)){
    guard.add(cur);
    chain.unshift(cur);
    cur = (people[cur].parents||[])[0];
  }
  return chain;
}
function runGlobalSearch(term){
  const box = document.getElementById('searchGlobalResults');
  if(!box) return;
  const q = term.trim().toLowerCase();
  if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
  const matches = Object.keys(people)
    .filter(id => people[id].name.toLowerCase().includes(q))
    .slice(0, 30); // batasi jumlah hasil supaya dropdown tidak meledak untuk silsilah besar
  if(!matches.length){
    box.innerHTML = '<div class="search-global-empty">Tidak ditemukan di seluruh silsilah.</div>';
    box.classList.add('open');
    return;
  }
  box.innerHTML = matches.map(id=>{
    const chain = pathToRoot(id).slice(0,-1).map(pid=>escapeHtml(people[pid].name));
    return `<button type="button" class="search-global-item" data-jump="${id}">
      <span>${escapeHtml(people[id].name)}</span>
      ${chain.length? `<span class="sg-path">${chain.join(' › ')}</span>`:''}
    </button>`;
  }).join('');
  box.classList.add('open');
  box.querySelectorAll('[data-jump]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.jump;
      const parent = (people[id].parents||[])[0];
      currentId = parent && people[parent] ? parent : id;
      expanded.add(currentId);
      highlightedId = id;
      document.getElementById('searchBox').value = '';
      searchTerm = '';
      box.classList.remove('open'); box.innerHTML = '';
      render();
      openDetail(id);
    };
  });
}
document.getElementById('searchBox').addEventListener('input', e=>{
  searchTerm = e.target.value;
  render(); // filter folder aktif: instan, tidak perlu debounce (cuma menyaring DOM lokal)
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(()=> runGlobalSearch(searchTerm), 200);
});
document.addEventListener('click', e=>{
  if(!e.target.closest('.search')) document.getElementById('searchGlobalResults').classList.remove('open');
});
document.getElementById('gridBtn').onclick=()=>{
  viewMode='grid';
  document.getElementById('contentArea').classList.remove('view-tree');
  document.getElementById('gridBtn').classList.add('active');
  document.getElementById('treeBtn').classList.remove('active');
};
document.getElementById('treeBtn').onclick=()=>{
  viewMode='tree';
  document.getElementById('contentArea').classList.add('view-tree');
  document.getElementById('treeBtn').classList.add('active');
  document.getElementById('gridBtn').classList.remove('active');
  renderTreeView();
};

// Tombol 🏦: kembali ke leluhur utama (akar pertama pohon silsilah).
// Sidebar akan menyorot folder leluhur tsb, dan konten menampilkan anak-anaknya.
function goHome(){
  if(!rootIds[0]) return;
  currentId = rootIds[0];
  highlightedId = null;   // pastikan sorotan sidebar ikut currentId (bukan sisa kartu yg sempat terbuka)
  expanded.add(currentId);
  render();
}

function render(){
  // kalau currentId belum tersambung (mis. data baru saja selesai dimuat dari Firestore,
  // atau folder yang lagi dibuka sudah tidak ada lagi), pindah ke akar pertama yang tersedia
  if(!currentId || !people[currentId]) currentId = rootIds[0] || null;
  renderBreadcrumb();
  renderSidebar();
  renderContent();
  renderStatus();
}
/* ================= Resize sidebar dengan drag kursor =================
   Lebar sidebar disimpan di CSS variable --sidebar-w pada <html>, dipakai
   oleh .body{grid-template-columns:...} sehingga lebar sidebar berubah
   langsung tanpa reflow tambahan. Batas lebar minimum/maksimum dijaga
   supaya sidebar tidak hilang atau terlalu lebar memakan area konten. */
(function initSidebarResize(){
  const resizer = document.getElementById('sidebarResizer');
  if(!resizer) return;
  const MIN_W = 90, MAX_W = 480;
  let dragging = false;

  function setWidth(px){
    const clamped = Math.min(MAX_W, Math.max(MIN_W, px));
    document.documentElement.style.setProperty('--sidebar-w', clamped + 'px');
  }
  function onMove(e){
    if(!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const appRect = document.getElementById('appRoot').getBoundingClientRect();
    setWidth(x - appRect.left);
  }
  function stopDrag(){
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
  function startDrag(e){
    dragging = true;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  }
  resizer.addEventListener('mousedown', startDrag);
  resizer.addEventListener('touchstart', startDrag, {passive:false});
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchend', stopDrag);
  resizer.addEventListener('dblclick', ()=> document.documentElement.style.removeProperty('--sidebar-w'));
})();

/* Catatan: pemanggilan pertama render() sekarang dipicu otomatis lewat
   auth.onAuthStateChanged() di blok script Firebase di atas, setelah
   user berhasil login (atau langsung jika Firebase belum dikonfigurasi). */
