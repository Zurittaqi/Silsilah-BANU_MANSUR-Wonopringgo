/* ============================================================
   app.js — Orkestrator utama: Bootstrap, Login, Render konten, Card grid
   Modul: db.js | utils.js | person.js | tree.js | ui.js
   ============================================================ */

/* ===== AUTENTIKASI ===== */
let authMode = 'login';

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('loginError').textContent = '';
  const nameField   = document.getElementById('loginName');
  const regionField = document.getElementById('loginRegion');
  if (authMode === 'register') {
    document.getElementById('loginSubtitle').textContent = 'Buat akun baru untuk keluarga.';
    document.getElementById('loginSubmitBtn').textContent = 'Daftar';
    document.getElementById('loginToggleMode').textContent = 'Sudah punya akun? Masuk di sini';
    nameField.style.display = 'block';
    regionField.style.display = 'block';
  } else {
    document.getElementById('loginSubtitle').textContent = 'Masuk dengan email keluarga.';
    document.getElementById('loginSubmitBtn').textContent = 'Masuk';
    document.getElementById('loginToggleMode').textContent = 'Belum punya akun? Daftar di sini';
    nameField.style.display = 'none';
    regionField.style.display = 'none';
  }
}

function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox   = document.getElementById('loginError');
  errBox.textContent = '';
  if (!db_auth) { errBox.textContent = 'Firebase belum dikonfigurasi.'; return; }
  if (!email || !password) { errBox.textContent = 'Email dan kata sandi wajib diisi.'; return; }
  if (authMode === 'register') {
    const name   = document.getElementById('loginName').value.trim();
    const region = document.getElementById('loginRegion').value.trim();
    if (!name) { errBox.textContent = 'Nama Anda wajib diisi.'; return; }
    db_auth.createUserWithEmailAndPassword(email, password)
      .then(cred => {
        if (db_firestore) return db_firestore.collection('users').doc(cred.user.uid).set({ name, region, email });
      })
      .catch(err => { errBox.textContent = terjemahErrorAuth(err); });
  } else {
    db_auth.signInWithEmailAndPassword(email, password)
      .catch(err => { errBox.textContent = terjemahErrorAuth(err); });
  }
}

function doLogout() {
  if (db_auth) db_auth.signOut();
}

function doForgotPassword() {
  const errBox = document.getElementById('loginError');
  errBox.textContent = '';
  if (!db_auth) { errBox.textContent = 'Firebase belum dikonfigurasi.'; return; }
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { errBox.textContent = 'Isi dulu email Anda, lalu klik "Lupa kata sandi?" lagi.'; return; }
  db_auth.sendPasswordResetEmail(email)
    .then(() => {
      errBox.style.color = 'var(--teal)';
      errBox.textContent = `Tautan reset dikirim ke ${email}. Cek kotak masuk.`;
    })
    .catch(err => { errBox.style.color = ''; errBox.textContent = terjemahErrorAuth(err); });
}

function terjemahErrorAuth(err) {
  const map = {
    'auth/invalid-email':      'Format email tidak valid.',
    'auth/user-not-found':     'Email belum terdaftar. Coba "Daftar di sini".',
    'auth/wrong-password':     'Kata sandi salah.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba "Masuk di sini".',
    'auth/weak-password':      'Kata sandi minimal 6 karakter.',
    'auth/invalid-credential': 'Email atau kata sandi salah.',
  };
  return map[err.code] || ('Gagal: ' + err.message);
}

async function loadUserProfile(uid, fallbackEmail) {
  const fallback = { name: fallbackEmail.split('@')[0], region: '', email: fallbackEmail };
  if (!db_firestore) { currentUserProfile = fallback; return; }
  try {
    const doc = await db_firestore.collection('users').doc(uid).get();
    currentUserProfile = doc.exists ? doc.data() : fallback;
  } catch (e) {
    console.error('Gagal memuat profil:', e);
    currentUserProfile = fallback;
  }
}

/* ===== Dropdown toolbar ===== */
function toggleDropdown(wrapId) {
  const wrap = document.getElementById(wrapId);
  const menu = wrap.querySelector('.dropdown-menu');
  const isOpen = menu.classList.contains('open');
  closeDropdowns();
  if (!isOpen) menu.classList.add('open');
}
function closeDropdowns() {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
}
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-wrap')) closeDropdowns();
});

/* ===== Bootstrap: load data lokal lalu mulai sync ===== */
async function bootApp() {
  // Coba muat dari IndexedDB dulu (offline-first)
  const local = await loadDataLocal();
  if (Object.keys(local.people).length > 0) {
    people  = local.people;
    rootIds = local.rootIds;
    migrateAllSiblingOrders();
    currentId = rootIds[0] || null;
    render();
  }
  // Kemudian mulai sinkronisasi real-time Firebase
  startRealtimeSync(evt => {
    if (evt.type === 'people') {
      people = evt.data;
      migrateAllSiblingOrders();
      if (!editingMode) render();
    } else if (evt.type === 'meta') {
      rootIds = evt.data;
      if (!editingMode) render();
    }
  });
}

if (db_auth) {
  db_auth.onAuthStateChanged(user => {
    const loginScreen = document.getElementById('loginScreen');
    const appRoot     = document.getElementById('appRoot');
    if (user) {
      loginScreen.style.display = 'none';
      appRoot.style.display = 'grid';
      const label = document.getElementById('userEmailLabel');
      if (label) label.textContent = user.email;
      loadUserProfile(user.uid, user.email);
      refreshSaveStatus();
      bootApp();
    } else {
      stopRealtimeSync();
      currentUserProfile = null;
      appRoot.style.display = 'none';
      loginScreen.style.display = 'block';
    }
  });
} else {
  // Tanpa Firebase: tampilkan app dari IndexedDB saja
  document.getElementById('appRoot').style.display = 'grid';
  loadDataLocal().then(local => {
    people = local.people; rootIds = local.rootIds;
    migrateAllSiblingOrders();
    currentId = rootIds[0] || null;
    render();
  });
}

/* ===== Backup & Restore ===== */
function handleDownloadBackup() {
  downloadBackupJSON(people, rootIds);
}

function handleRestoreFile(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const resetInput = () => { inputEl.value = ''; };
  file.text().then(raw => {
    let data;
    try { data = JSON.parse(raw); } catch { alert('File bukan JSON valid.'); resetInput(); return; }
    restoreFromBackup(data, (newPeople, newRootIds) => {
      people  = newPeople;
      rootIds = newRootIds;
      migrateAllSiblingOrders();
      currentId = rootIds[0] || null;
      logAudit('restore', null, `Memulihkan ${Object.keys(newPeople).length} anggota dari backup`, [], currentUserProfile, db_auth?.currentUser);
      render();
      alert('Pemulihan selesai.');
    }).catch(err => { alert('Gagal memulihkan: ' + err.message); });
    resetInput();
  }).catch(err => { alert('Gagal membaca file: ' + err.message); resetInput(); });
}

/* ===== Render konten (grid kartu) ===== */
function renderContent() {
  const heading   = document.getElementById('heading');
  const pairLabel = document.getElementById('pairLabel');
  const grid      = document.getElementById('cardGrid');
  const emptyHint = document.getElementById('emptyHint');

  if (!currentId || !people[currentId]) {
    heading.textContent = 'Belum ada data';
    heading.onclick = null;
    pairLabel.innerHTML = '';
    grid.innerHTML = '';
    emptyHint.textContent = 'Belum ada leluhur yang tercatat.';
    emptyHint.style.display = 'block';
    return;
  }

  const person = people[currentId];
  const kids   = childrenOf(currentId).filter(id =>
    people[id].name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  heading.textContent = person.name;
  heading.onclick     = () => openDetail(currentId);

  if (person.spouses.length) {
    pairLabel.innerHTML = 'bersama ' + person.spouses.map(sid =>
      `<span class="spouse-link" data-open="${sid}">${escapeHtml(people[sid].name)}</span>`
    ).join(' &amp; ');
    pairLabel.querySelectorAll('.spouse-link').forEach(el => {
      el.onclick = () => openDetail(el.dataset.open);
    });
  } else {
    pairLabel.innerHTML = '';
  }

  const hintGenColor = genColors[(getGeneration(currentId) - 1) % genColors.length];
  emptyHint.innerHTML = `
    <div>Belum ada anak yang tercatat di sini. Gunakan "Tambah Anak" untuk menambahkan.</div>
    <div class="empty-hint-actions">
      <button type="button" class="mini-open-card" style="--gen-color:${hintGenColor}"
        data-open-detail="${currentId}" title="Buka kartu ${escapeHtml(person.name)}">
        <span class="mini-open-card-ico">📂</span><span>Buka</span>
      </button>
      ${(person.spouses || []).filter(sid => people[sid]).map(sid => `
        <button type="button" class="mini-open-card" style="--gen-color:${hintGenColor}"
          data-open-detail="${sid}" title="Buka kartu ${escapeHtml(people[sid].name)}">
          <span class="mini-open-card-ico">📂</span><span>Buka</span>
        </button>`).join('')}
    </div>`;
  emptyHint.querySelectorAll('[data-open-detail]').forEach(btn => {
    btn.onclick = () => openDetail(btn.dataset.openDetail);
  });
  emptyHint.style.display = kids.length ? 'none' : 'block';

  grid.innerHTML = '';
  let groups     = getSpouseGroups(currentId);
  let focusedGroup = null;

  if (groups && activeGroupKey && activeGroupKey.startsWith('grp:' + currentId + ':')) {
    focusedGroup = groups.find(g => ('grp:' + currentId + ':' + g.key) === activeGroupKey) || null;
    if (focusedGroup) groups = [focusedGroup];
  }

  if (focusedGroup) {
    const backBar = document.createElement('div');
    backBar.className = 'spouse-focus-bar';
    backBar.innerHTML = `<button type="button" class="btn btn-ghost btn-sm">← Semua pasangan ${escapeHtml(person.name)}</button>`;
    backBar.querySelector('button').onclick = () => { navigateToPerson(currentId); render(); };
    grid.appendChild(backBar);
  }

  if (groups) {
    grid.className = 'card-grid card-grid-grouped';
    groups.forEach(g => {
      const groupKids = g.kids.filter(id => kids.includes(id));
      if (!groupKids.length) return;
      const groupWrap = document.createElement('div');
      groupWrap.className = 'spouse-group' + (g.ambiguous ? ' spouse-group-warn' : '');
      groupWrap.innerHTML = `<div class="spouse-group-title">
        <span class="spouse-group-ico">${g.ambiguous ? '⚠️' : '💍'}</span>
        <span>${g.ambiguous ? escapeHtml(g.label) : 'Bersama ' + escapeHtml(g.label)}</span>
        <span class="spouse-group-count">${groupKids.length}</span>
      </div>`;
      if (g.ambiguous || g.spouseId === null) {
        const hint = document.createElement('div');
        hint.className = 'spouse-group-hint';
        const bulkBtnHtml = `<button type="button" class="btn btn-ghost btn-sm spouse-bulk-btn">💍 Tetapkan ${groupKids.length} anak sekaligus...</button>`;
        hint.innerHTML = (g.ambiguous
          ? 'Data lama: klik kanan tiap kartu → "Tentukan Ibu/Ayah", atau tetapkan semuanya sekaligus. '
          : 'Belum tercatat pasangan mana — tetapkan semuanya sekaligus. ')
          + bulkBtnHtml;
        groupWrap.appendChild(hint);
        hint.querySelector('.spouse-bulk-btn').onclick = () => openBulkAssignModal(currentId, groupKids);
      }
      const groupGrid = document.createElement('div');
      groupGrid.className = 'card-grid';
      groupKids.forEach(id => groupGrid.appendChild(createChildCard(id)));
      groupWrap.appendChild(groupGrid);
      grid.appendChild(groupWrap);
    });
  } else {
    grid.className = 'card-grid';
    kids.forEach(id => grid.appendChild(createChildCard(id)));
  }

  renderTreeView();
}

function createChildCard(id) {
  const p    = people[id];
  const gen  = getGeneration(id);
  const grandkids = childrenOf(id);
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--gen-color', genColors[(gen - 1) % genColors.length]);
  card.innerHTML = `
    <span class="drag-handle" title="Seret untuk mengubah urutan" aria-hidden="true">⠿</span>
    ${grandkids.length ? `<button type="button" class="open-desc-btn" data-nav="${id}" title="Buka keturunan">📂 ${grandkids.length}</button>` : ''}
    <div class="avatar">${initials(p.name)}</div>
    <div class="card-name">${escapeHtml(p.name)}</div>
    <div class="card-meta">${escapeHtml(p.birth)}${p.death ? ' – ' + escapeHtml(p.death) : ' – sekarang'}</div>
    <div class="card-pills">
      <span class="pill pill-gender-${p.gender}">${p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
      ${p.death ? '<span class="pill pill-alm">Alm.</span>' : ''}
    </div>`;

  card.onclick = () => {
    if (card._clickTimer) { clearTimeout(card._clickTimer); card._clickTimer = null; return; }
    card._clickTimer = setTimeout(() => {
      card._clickTimer = null;
      navigateToPerson(id); expanded.add(id); render();
    }, 250);
  };
  card.ondblclick = () => {
    if (card._clickTimer) { clearTimeout(card._clickTimer); card._clickTimer = null; }
    openDetail(id);
  };
  const navBtn = card.querySelector('.open-desc-btn');
  if (navBtn) navBtn.onclick = e => { e.stopPropagation(); navigateToPerson(id); expanded.add(id); render(); };
  card.oncontextmenu = e => { e.preventDefault(); openCtxMenu(e, id); };

  card.draggable = true;
  card.dataset.id = id;
  card.addEventListener('dragstart', e => {
    e.stopPropagation(); card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend',  () => card.classList.remove('dragging'));
  card.addEventListener('dragover', e  => { e.preventDefault(); card.classList.add('drag-over'); });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); card.classList.remove('drag-over');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== id) {
      reorderSiblingBeforeTarget(draggedId, id, currentId);
      render();
    }
  });
  return card;
}

/* ===== Fungsi render utama ===== */
function render() {
  if (!currentId || !people[currentId]) currentId = rootIds[0] || null;
  renderBreadcrumb();
  renderSidebar();
  renderContent();
  renderStatus();
}

/* ===== Navigasi home ===== */
function goHome() {
  if (!rootIds[0]) return;
  currentId      = rootIds[0];
  activeGroupKey = null;
  highlightedId  = null;
  expanded.add(currentId);
  render();
}

/* ===== View toggle (grid / pohon) ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gridBtn')?.addEventListener('click', () => {
    viewMode = 'grid';
    document.getElementById('contentArea').classList.remove('view-tree');
    document.getElementById('gridBtn').classList.add('active');
    document.getElementById('treeBtn').classList.remove('active');
    document.getElementById('radialBtn')?.classList.remove('active');
    render();
  });

  document.getElementById('treeBtn')?.addEventListener('click', () => {
    viewMode = 'tree';
    document.getElementById('contentArea').classList.add('view-tree');
    document.getElementById('gridBtn').classList.remove('active');
    setTreeMode('horizontal');
  });

  /* ===== Pencarian ===== */
  document.getElementById('searchBox')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    render();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => runGlobalSearch(searchTerm), 200);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search'))
      document.getElementById('searchGlobalResults')?.classList.remove('open');
  });

  /* ===== Resize sidebar ===== */
  (function initSidebarResize() {
    const resizer = document.getElementById('sidebarResizer');
    if (!resizer) return;
    const MIN_W = 90, MAX_W = 480;
    let dragging = false;
    function setWidth(px) {
      const clamped = Math.min(MAX_W, Math.max(MIN_W, px));
      document.documentElement.style.setProperty('--sidebar-w', clamped + 'px');
    }
    function onMove(e) {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const appRect = document.getElementById('appRoot').getBoundingClientRect();
      setWidth(x - appRect.left);
    }
    function stopDrag() {
      dragging = false; resizer.classList.remove('dragging');
      document.body.style.userSelect = ''; document.body.style.cursor = '';
    }
    resizer.addEventListener('mousedown', e => {
      dragging = true; resizer.classList.add('dragging');
      document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
    resizer.addEventListener('touchstart', e => {
      dragging = true; resizer.classList.add('dragging'); e.preventDefault();
    }, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup',  stopDrag);
    document.addEventListener('touchend', stopDrag);
    resizer.addEventListener('dblclick', () =>
      document.documentElement.style.removeProperty('--sidebar-w')
    );
  })();
});
