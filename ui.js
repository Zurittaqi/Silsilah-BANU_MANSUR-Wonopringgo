/* ============================================================
   ui.js — Modal, Panel, Sidebar, Context Menu, Search
   ============================================================ */

/* ===== State navigasi ===== */
let currentId     = null;
let activeGroupKey = null;
let viewMode      = 'grid';
let searchTerm    = '';
let editingMode   = false;
let highlightedId = null;
const expanded    = new Set();

function navigateToPerson(id) {
  currentId     = id;
  activeGroupKey = null;
}
function navigateToGroup(personId, groupKey) {
  currentId     = personId;
  activeGroupKey = groupKey;
}

/* ===== Breadcrumb ===== */
function renderBreadcrumb() {
  const bc      = document.getElementById('breadcrumb');
  const kinship = document.getElementById('kinshipLine');
  if (!currentId || !people[currentId]) {
    bc.innerHTML = ''; if (kinship) kinship.innerHTML = ''; return;
  }
  const chain = ancestorChain(currentId);
  bc.innerHTML = '';
  chain.forEach((id, i) => {
    const span = document.createElement('span');
    span.className = 'crumb' + (i === chain.length - 1 ? ' current' : '');
    span.textContent = people[id].name;
    span.onclick = () => { if (i !== chain.length - 1) { navigateToPerson(id); render(); } };
    bc.appendChild(span);
    if (i < chain.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep'; sep.textContent = '›';
      bc.appendChild(sep);
    }
  });
  if (kinship) {
    const kchain = kinshipChain(currentId);
    const parts  = kchain.map((id, i) => {
      if (i === 0) return `<b>${escapeHtml(people[id].name)}</b>`;
      const conn = people[kchain[i - 1]].gender === 'P' ? 'binti' : 'bin';
      return `${conn} ${escapeHtml(people[id].name)}`;
    });
    kinship.innerHTML = parts.join(' ');
  }
}

/* ===== Status bar ===== */
function renderStatus() {
  const statPath = document.getElementById('statPath');
  const statGen  = document.getElementById('statGen');
  if (!currentId || !people[currentId]) return;
  const count = Object.keys(people).length;
  const gen   = totalGenerations();
  if (statPath) statPath.textContent = `${count} anggota`;
  if (statGen)  statGen.textContent  = `${gen} generasi`;
}

/* ===== Sidebar dengan Collapsible ===== */
function renderSidebar() {
  const container = document.getElementById('sidebarTree');
  container.innerHTML = '';
  rootIds.forEach(id => container.appendChild(buildCollapsibleNode(id)));
}

function buildCollapsibleNode(id, depth = 0) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';

  const kids    = childrenOf(id);
  const hasKids = kids.length > 0;
  const row     = document.createElement('div');
  const isActive = !activeGroupKey && id === (highlightedId || currentId);
  const isOpen   = expanded.has(id);

  row.className = 'tree-row' + (isActive ? ' active' : '');

  // Indentasi visual berdasar kedalaman
  const indent = depth > 0 ? `style="padding-left:${8 + depth * 10}px"` : '';

  row.innerHTML = `
    <span class="twisty ${hasKids ? '' : 'leaf'}" ${indent}>${isOpen ? '▾' : '▸'}</span>
    <span class="folder-ico">${hasKids ? '📂' : '📁'}</span>
    <span class="tree-name">${escapeHtml(people[id].name)}</span>
    <span class="tree-badge">${hasKids ? kids.length : ''}</span>`;

  row.onclick = e => {
    e.stopPropagation();
    closeAllOverlays(true); // true = jangan render sidebar dulu, render() di bawah akan menanganinya
    if (row._clickTimer) { clearTimeout(row._clickTimer); row._clickTimer = null; return; }
    row._clickTimer = setTimeout(() => {
      row._clickTimer = null;
      if (hasKids) { if (isOpen) expanded.delete(id); else expanded.add(id); }
      navigateToPerson(id);
      render();
    }, 250);
  };
  row.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, id); };
  row.ondblclick = e => {
    e.stopPropagation();
    if (row._clickTimer) { clearTimeout(row._clickTimer); row._clickTimer = null; }
    openDetail(id);
  };

  wrap.appendChild(row);

  if (hasKids && isOpen) {
    const childWrap = document.createElement('div');
    childWrap.className = 'tree-children';
    const groups = getSpouseGroups(id);
    if (groups) {
      groups.forEach(g => childWrap.appendChild(buildSpouseGroupNode(id, g, depth + 1)));
    } else {
      kids.forEach(kid => childWrap.appendChild(buildCollapsibleNode(kid, depth + 1)));
    }
    wrap.appendChild(childWrap);
  }
  return wrap;
}

function buildSpouseGroupNode(personId, group, depth = 1) {
  const wrap     = document.createElement('div');
  const groupKey = 'grp:' + personId + ':' + group.key;
  wrap.className = 'tree-node spouse-group-node' + (group.ambiguous ? ' spouse-group-warn' : '');

  const row = document.createElement('div');
  const isActive = activeGroupKey === groupKey;
  const isOpen   = expanded.has(groupKey);
  const indent   = `style="padding-left:${8 + depth * 10}px"`;

  row.className = 'tree-row spouse-group-row' + (isActive ? ' active' : '');
  row.innerHTML = `
    <span class="twisty" ${indent}>${isOpen ? '▾' : '▸'}</span>
    <span class="folder-ico">${group.ambiguous ? '⚠️' : '💍'}</span>
    <span class="tree-name">${escapeHtml(group.ambiguous ? group.label : 'Bersama ' + group.label)}</span>
    <span class="tree-badge">${group.kids.length}</span>`;

  row.onclick = e => {
    e.stopPropagation();
    closeAllOverlays(true);
    if (isOpen) expanded.delete(groupKey); else expanded.add(groupKey);
    navigateToGroup(personId, groupKey);
    render();
  };
  wrap.appendChild(row);

  if (isOpen) {
    const childWrap = document.createElement('div');
    childWrap.className = 'tree-children';
    group.kids.forEach(kid => childWrap.appendChild(buildCollapsibleNode(kid, depth + 1)));
    wrap.appendChild(childWrap);
  }
  return wrap;
}

/* ===== Detail Panel ===== */
function openDetail(id) {
  if (!people[id]) return;
  highlightedId = id;
  renderSidebar();
  expanded.add(currentId);

  const p   = people[id];
  const gen = getGeneration(id);
  const nrb = getNRB(id);
  const isMenantu = !p.parents.length && !rootIds.includes(id);
  const alamatAda = p.provinsi || p.kabupaten || p.kecamatan || p.desa;

  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <button class="panel-back" onclick="closeDetail()" aria-label="Tutup">✕</button>
      <div class="avatar" style="background:${genColors[(gen - 1) % genColors.length]}">${initials(p.name)}</div>
      <div>
        <h3>${escapeHtml(p.name)}</h3>
        <p>Generasi ke-${gen}${isMenantu ? ' · Menantu' : ''}${p.death ? ' · Almarhum/ah' : ''}</p>
        <span class="panel-nrb">NRB ${escapeHtml(nrb)}</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Jenis kelamin</span><span>${p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span></div>
      <div class="panel-row panel-row-tgl"><span>Tanggal Lahir</span><span>${renderTanggalLengkap(p.birth)}</span></div>
      <div class="panel-row panel-row-tgl"><span>Tanggal Wafat</span><span>${p.death ? renderTanggalLengkap(p.death) : '—'}</span></div>
      ${(() => {
        const romawi = ['I', 'II', 'III', 'IV'];
        return romawi.map((r, idx) => {
          const sid = p.spouses[idx];
          if (sid && people[sid]) {
            return `<div class="panel-row"><span>Pasangan ${r}</span>
              <span>
                <a href="#" onclick="openDetail('${sid}');return false;">${escapeHtml(people[sid].name)}</a>
                <button class="spouse-unlink-btn edit-only" title="Hapus status pasangan" onclick="openRemoveSpouseModal('${id}','${sid}')">💔</button>
              </span></div>`;
          }
          if (idx === p.spouses.length && p.spouses.length < 4) {
            return `<div class="panel-row"><span>Pasangan ${r}</span>
              <span><button class="btn btn-ghost btn-sm edit-only" onclick="enterAddSpouseMode('${id}')">＋ Tambah pasangan</button></span></div>`;
          }
          return '';
        }).join('');
      })()}
      <div class="panel-row"><span>Orang tua</span><span>${p.parents.map(s => escapeHtml(people[s].name)).join(' & ') || '—'}</span></div>
      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><span>${escapeHtml(p.provinsi) || '—'}</span></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><span>${escapeHtml(p.kabupaten) || '—'}</span></div>
      <div class="panel-row"><span>Kecamatan</span><span>${escapeHtml(p.kecamatan) || '—'}</span></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><span>${escapeHtml(p.desa) || '—'}</span></div>
      <div class="panel-row"><span>RT/RW</span><span>${escapeHtml(p.rtrw) || '—'}</span></div>
      <div class="panel-row"><span>No. HP</span><span>${escapeHtml(p.phone) || '—'}</span></div>
      <div class="panel-row"><span>Email</span><span>${escapeHtml(p.email) || '—'}</span></div>
      <div class="panel-row"><span>Lokasi</span><span>${
        p.mapsUrl && /^https?:\/\//i.test(p.mapsUrl.trim())
          ? `<a class="panel-maps" href="${escapeHtml(p.mapsUrl)}" target="_blank" rel="noopener">📍 Buka lokasi</a>`
          : '—'
      }</span></div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-text edit-only" onclick="enterAddChildMode('${id}')">Tambah Anak</button>
      <button class="btn btn-ghost btn-flex" onclick="closeDetail()"><span class="btn-full">Tutup</span><span class="btn-short">T</span></button>
      <button class="btn btn-primary btn-flex edit-only" onclick="enterEditMode('${id}')"><span class="btn-full">Edit data</span><span class="btn-short">E</span></button>
    </div>`;

  editingMode = false;
  document.getElementById('overlay').classList.add('show');
  setTimeout(() => document.addEventListener('click', outsideClickCloseDetail, true), 0);
}

function closeDetail() {
  closeAllOverlays(false);
}

function outsideClickCloseDetail(e) {
  if (editingMode) return;
  const panel = document.getElementById('detailPanel');
  if (panel && !panel.contains(e.target)) closeDetail();
}

/* ===== Mode Edit ===== */
let editingRevision  = null; // revisi yang dilihat pengguna saat form edit dibuka (untuk deteksi konflik)
let editingSnapshot  = null; // salinan data orang saat form dibuka, dipakai untuk log "before" yang akurat
                              // (people[id] bisa berubah di memori akibat sinkronisasi realtime saat form terbuka)

function enterEditMode(id) {
  if (!canEdit()) return;
  const p = people[id];
  editingMode = true;
  editingRevision = p.revision || 0;
  editingSnapshot = { ...p };
  document.getElementById('detailPanel').querySelector('.panel-footer')?.remove();
  const body = document.getElementById('detailPanel').querySelector('.panel-body');
  if (body) {
    body.innerHTML = `
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_name" type="text" value="${escapeHtml(p.name)}"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_gender">
          <option value="L" ${p.gender === 'L' ? 'selected' : ''}>Laki-laki</option>
          <option value="P" ${p.gender === 'P' ? 'selected' : ''}>Perempuan</option>
        </select></div>
      <div class="panel-row"><span>Tanggal Lahir</span>
        <input id="f_birth" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10"
          value="${escapeHtml(p.birth)}" oninput="formatTglLahir(this)"></div>
      <div class="panel-row"><span>Tanggal Wafat</span>
        <input id="f_death" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10"
          value="${escapeHtml(p.death)}" oninput="formatTglLahir(this)"></div>
      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_provinsi" type="text" value="${escapeHtml(p.provinsi)}"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_kabupaten" type="text" value="${escapeHtml(p.kabupaten)}"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_kecamatan" type="text" value="${escapeHtml(p.kecamatan)}"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_desa" type="text" value="${escapeHtml(p.desa)}"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_rtrw" type="text" value="${escapeHtml(p.rtrw)}"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_phone" type="text" value="${escapeHtml(p.phone)}"></div>
      <div class="panel-row"><span>Email</span><input id="f_email" type="text" value="${escapeHtml(p.email)}"></div>
      <div class="panel-row"><span>Link Google Maps</span>
        <input id="f_maps" type="text" placeholder="https://maps.google.com/?q=..." value="${escapeHtml(p.mapsUrl)}"></div>
      <div class="panel-hint">Sedang mengedit — klik <b>Simpan</b> untuk menyimpan atau <b>Batal</b> untuk membatalkan.</div>`;
  }
  const panel  = document.getElementById('detailPanel');
  const footer = document.createElement('div');
  footer.className = 'panel-footer';
  footer.innerHTML = `
    <button class="btn btn-ghost" onclick="cancelEditMode('${id}')">Batal</button>
    <button class="btn btn-primary" onclick="saveEditMode('${id}')">Simpan</button>`;
  panel.appendChild(footer);
}

async function saveEditMode(id) {
  const before  = editingSnapshot || { ...people[id] };
  const val     = sel => { const el = document.getElementById(sel); return el ? el.value.trim() : ''; };
  const newName = val('f_name');
  if (!newName) { alert('Nama lengkap wajib diisi.'); return; }

  // ===== Cek konflik revisi sebelum menyimpan =====
  const saveBtn = document.querySelector('#detailPanel .panel-footer .btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Memeriksa…'; }
  const check = await checkRevisionConflict(id, editingRevision);
  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }

  if (check.conflict) {
    showEditConflictModal(id, check.cloudData, () => {
      // Pengguna memilih "Timpa dengan perubahan saya" → lanjutkan simpan paksa
      // dengan revisi cloud terbaru sebagai basis (relasi spouses/parents/children
      // dari cloud tetap dipakai, hanya field form yang ditimpa perubahan lokal)
      people[id] = { ...check.cloudData };
      editingRevision = check.cloudData.revision || 0;
      saveEditMode(id);
    }, () => {
      // Pengguna memilih "Muat ulang & batalkan perubahan saya"
      people[id] = check.cloudData;
      editingMode = false;
      editingSnapshot = null;
      openDetail(id);
      render();
    });
    return;
  }

  // Basis objek yang disimpan: people[id] saat ini (mengandung relasi spouses/
  // parents/children terbaru + revision terbaru), field form menimpa di atasnya.
  const p = people[id];
  p.name    = newName;
  p.gender  = val('f_gender') || p.gender;
  p.birth   = val('f_birth');
  p.death   = val('f_death');
  p.provinsi = val('f_provinsi');
  p.kabupaten = val('f_kabupaten');
  p.kecamatan = val('f_kecamatan');
  p.desa    = val('f_desa');
  p.rtrw    = val('f_rtrw');
  p.phone   = val('f_phone');
  p.email   = val('f_email');
  p.mapsUrl = val('f_maps');

  const fieldLabels = {
    name:'Nama', gender:'Jenis kelamin', birth:'Tanggal lahir', death:'Tanggal wafat',
    provinsi:'Provinsi', kabupaten:'Kabupaten/Kota', kecamatan:'Kecamatan', desa:'Desa',
    rtrw:'RT/RW', phone:'No. HP', email:'Email', mapsUrl:'Link Maps',
  };
  const changes = [];
  Object.keys(fieldLabels).forEach(f => {
    const oldV = before[f] || '', newV = p[f] || '';
    if (oldV !== newV) changes.push({ field: fieldLabels[f], from: oldV || '—', to: newV || '—' });
  });
  if (changes.length) {
    const summary = changes.length === 1
      ? `Mengubah ${changes[0].field}: ${changes[0].from} → ${changes[0].to}`
      : `Mengubah data ${p.name} (${changes.length} kolom)`;
    logAudit('edit', id, summary, changes, currentUserProfile, db_auth?.currentUser);
  }

  editingMode = false;
  editingSnapshot = null;
  await savePersonToDB(id, people[id], currentUserProfile, db_auth?.currentUser);
  openDetail(id);
  render();
}

function cancelEditMode(id) {
  editingMode = false;
  editingSnapshot = null;
  openDetail(id);
}

/* ===== Modal konflik edit (multi-pengguna) =====
   Ditampilkan saat revisi lokal berbeda dari revisi di cloud —
   artinya ada orang lain yang menyimpan perubahan pada orang yang sama
   sejak form edit ini dibuka. */
function showEditConflictModal(id, cloudData, onOverwrite, onDiscard) {
  const namaTerbaru = escapeHtml(cloudData.name || people[id].name);
  const siapa   = escapeHtml(cloudData.updatedBy || 'seseorang');
  const kapan   = cloudData.updatedAt ? formatAuditTimestamp(cloudData.updatedAt) : 'baru saja';
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:#d98c2b">⚠️</div>
      <div><h3>Konflik Perubahan</h3><p>Data sudah diubah orang lain</p></div>
    </div>
    <div class="panel-body">
      <p style="line-height:1.6;">
        <b>${namaTerbaru}</b> baru saja diubah oleh <b>${siapa}</b> (${kapan}),
        sementara Anda masih mengedit data yang sama. Perubahan Anda belum tersimpan.
      </p>
      <p style="line-height:1.6;color:var(--ink-soft);font-size:12.5px;">
        Pilih <b>Timpa dengan Perubahan Saya</b> untuk tetap menyimpan versi Anda
        (perubahan ${siapa} akan hilang), atau <b>Muat Ulang</b> untuk membatalkan
        perubahan Anda dan melihat versi terbaru.
      </p>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" id="conflictDiscardBtn">Muat Ulang</button>
      <button class="btn btn-primary" id="conflictOverwriteBtn">Timpa dengan Perubahan Saya</button>
    </div>`;
  document.getElementById('conflictDiscardBtn').onclick = () => { closeModal(); onDiscard(); };
  document.getElementById('conflictOverwriteBtn').onclick = () => { closeModal(); onOverwrite(); };
  document.getElementById('modalOverlay').classList.add('show');
}

/* ===== Tambah Pasangan ===== */
function enterAddSpouseMode(id) {
  if (!canEdit()) return;
  const romawi = ['I', 'II', 'III', 'IV'];
  const existingCount = (people[id].spouses || []).length;
  if (existingCount >= 4) { alert('Maksimal 4 pasangan per orang.'); return; }
  const nextLabel = romawi[existingCount];
  editingMode = true;
  document.getElementById('detailPanel').querySelector('.panel-footer')?.remove();
  const body = document.getElementById('detailPanel').querySelector('.panel-body');
  if (body) {
    body.innerHTML = `
      <div class="panel-section-title">Tambah Data Pasangan ${nextLabel}</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_sp_name" type="text" placeholder="Nama pasangan"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_sp_gender"><option value="P">Perempuan</option><option value="L">Laki-laki</option></select></div>
      <div class="panel-row"><span>Tanggal Lahir</span><input id="f_sp_birth" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-row"><span>Tanggal Wafat</span><input id="f_sp_death" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_sp_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_sp_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_sp_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_sp_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_sp_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_sp_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_sp_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_sp_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>`;
  }
  const panel = document.getElementById('detailPanel');
  const footer = document.createElement('div');
  footer.className = 'panel-footer';
  footer.innerHTML = `
    <button class="btn btn-ghost" onclick="cancelAddSpouse('${id}')">Batal</button>
    <button class="btn btn-primary" onclick="saveAddSpouse('${id}')">Simpan</button>`;
  panel.appendChild(footer);
}

function saveAddSpouse(id) {
  if ((people[id].spouses || []).length >= 4) { alert('Maksimal 4 pasangan.'); return; }
  const val   = sel => { const el = document.getElementById(sel); return el ? el.value.trim() : ''; };
  const name  = val('f_sp_name');
  if (!name) { alert('Nama pasangan wajib diisi.'); return; }
  const newId = 'sp_' + id + '_' + Date.now();
  people[newId] = {
    name, gender: val('f_sp_gender') || 'P',
    birth: val('f_sp_birth'), death: val('f_sp_death'),
    parents: [], spouses: [id],
    provinsi: val('f_sp_provinsi'), kabupaten: val('f_sp_kabupaten'),
    kecamatan: val('f_sp_kecamatan'), desa: val('f_sp_desa'), rtrw: val('f_sp_rtrw'),
    phone: val('f_sp_phone'), email: val('f_sp_email'), mapsUrl: val('f_sp_maps'),
  };
  people[id].spouses.push(newId);
  editingMode = false;
  savePersonToDB(newId, people[newId]);
  savePersonToDB(id,    people[id]);
  logAudit('add', newId, `Menambah pasangan: ${name} (untuk ${people[id].name})`, [], currentUserProfile, db_auth?.currentUser);
  openDetail(id);
  render();
}

function cancelAddSpouse(id) {
  editingMode = false;
  openDetail(id);
}

/* ===== Tambah Anak ===== */
function enterAddChildMode(parentId) {
  if (!canEdit()) return;
  if (!parentId || !people[parentId]) { alert('Belum ada leluhur yang tercatat.'); return; }
  editingMode = true;
  const parent     = people[parentId];
  const spouseIds  = (parent.spouses || []).filter(s => people[s]);
  const parentNames = escapeHtml([parent.name, ...spouseIds.map(s => people[s].name)].join(' & '));
  const spousePicker = spouseIds.length > 1 ? `
    <div class="panel-section-title">Anak ini bersama pasangan yang mana?</div>
    <div class="panel-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
      ${spouseIds.map((sid, idx) => `
        <label style="display:flex;align-items:center;gap:6px;font-weight:500;">
          <input type="radio" name="f_ch_spouse" value="${sid}" ${idx === 0 ? 'checked' : ''}>
          💍 ${escapeHtml(people[sid].name)}
        </label>`).join('')}
    </div>` : '';
  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">＋</div>
      <div><h3>Tambah Anak Baru</h3><p>Anak dari ${parentNames}</p></div>
    </div>
    <div class="panel-body">
      ${spousePicker}
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_ch_name" type="text" placeholder="Nama lengkap"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_ch_gender"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
      <div class="panel-row"><span>Tanggal Lahir</span><input id="f_ch_birth" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-row"><span>Tanggal Wafat</span><input id="f_ch_death" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_ch_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_ch_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_ch_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_ch_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_ch_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_ch_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_ch_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_ch_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelAddChild()">Batal</button>
      <button class="btn btn-primary" onclick="saveAddChild('${parentId}')">Simpan</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(() => document.addEventListener('click', outsideClickCloseDetail, true), 0);
}

function saveAddChild(parentId) {
  const val   = sel => { const el = document.getElementById(sel); return el ? el.value.trim() : ''; };
  const name  = val('f_ch_name');
  if (!name) { alert('Nama anak wajib diisi.'); return; }
  const parent    = people[parentId];
  const spouseIds = (parent.spouses || []).filter(s => people[s]);
  let coParentId  = spouseIds.length === 1 ? spouseIds[0] : null;
  if (spouseIds.length > 1) {
    const picked = document.querySelector('input[name="f_ch_spouse"]:checked');
    coParentId = picked ? picked.value : null;
  }
  const parents = coParentId ? [parentId, coParentId] : [parentId];
  const newId   = 'ch_' + Date.now();
  people[newId] = {
    name, gender: val('f_ch_gender') || 'L',
    birth: val('f_ch_birth'), death: val('f_ch_death'),
    parents, spouses: [],
    provinsi: val('f_ch_provinsi'), kabupaten: val('f_ch_kabupaten'),
    kecamatan: val('f_ch_kecamatan'), desa: val('f_ch_desa'), rtrw: val('f_ch_rtrw'),
    phone: val('f_ch_phone'), email: val('f_ch_email'), mapsUrl: val('f_ch_maps'),
  };
  editingMode = false;
  savePersonToDB(newId, people[newId]);
  logAudit('add', newId, `Menambah anak: ${name} (dari ${parent.name})`, [], currentUserProfile, db_auth?.currentUser);
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  navigateToPerson(parentId);
  expanded.add(parentId);
  render();
}

function cancelAddChild() {
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
}

/* ===== Tambah Ortu (Leluhur) ===== */
function enterAddParentMode(targetId) {
  if (!canAddRoot()) return;
  editingMode = true;
  const targetPerson = targetId ? people[targetId] : null;
  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[2]}">👴</div>
      <div>
        <h3>Tambah Leluhur / Akar Baru</h3>
        <p>${targetPerson ? `Leluhur dari: ${escapeHtml(targetPerson.name)}` : 'Akar baru untuk seluruh silsilah'}</p>
      </div>
    </div>
    <div class="panel-body">
      <div class="panel-section-title">Data Diri</div>
      <div class="panel-row"><span>Nama lengkap</span><input id="f_an_name" type="text" placeholder="Nama leluhur"></div>
      <div class="panel-row"><span>Jenis kelamin</span>
        <select id="f_an_gender"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
      <div class="panel-row"><span>Tanggal Lahir</span><input id="f_an_birth" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-row"><span>Tanggal Wafat</span><input id="f_an_death" type="text" inputmode="numeric" placeholder="tt/bb/tttt" maxlength="10" oninput="formatTglLahir(this)"></div>
      <div class="panel-section-title">Alamat &amp; Kontak</div>
      <div class="panel-row"><span>Provinsi</span><input id="f_an_provinsi" type="text"></div>
      <div class="panel-row"><span>Kabupaten/Kota</span><input id="f_an_kabupaten" type="text"></div>
      <div class="panel-row"><span>Kecamatan</span><input id="f_an_kecamatan" type="text"></div>
      <div class="panel-row"><span>Desa/Kelurahan</span><input id="f_an_desa" type="text"></div>
      <div class="panel-row"><span>RT/RW</span><input id="f_an_rtrw" type="text"></div>
      <div class="panel-row"><span>No. HP</span><input id="f_an_phone" type="text"></div>
      <div class="panel-row"><span>Email</span><input id="f_an_email" type="text"></div>
      <div class="panel-row"><span>Link Google Maps</span><input id="f_an_maps" type="text" placeholder="https://maps.google.com/?q=..."></div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelAddParent()">Batal</button>
      <button class="btn btn-primary" onclick="saveAddParent('${targetId || ''}')">Simpan</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(() => document.addEventListener('click', outsideClickCloseDetail, true), 0);
}

function saveAddParent(targetId) {
  const val   = sel => { const el = document.getElementById(sel); return el ? el.value.trim() : ''; };
  const name  = val('f_an_name');
  if (!name) { alert('Nama orang tua wajib diisi.'); return; }
  const newId = 'par_' + Date.now();
  people[newId] = {
    name, gender: val('f_an_gender') || 'L',
    birth: val('f_an_birth'), death: val('f_an_death'),
    parents: [], spouses: [],
    provinsi: val('f_an_provinsi'), kabupaten: val('f_an_kabupaten'),
    kecamatan: val('f_an_kecamatan'), desa: val('f_an_desa'), rtrw: val('f_an_rtrw'),
    phone: val('f_an_phone'), email: val('f_an_email'), mapsUrl: val('f_an_maps'),
  };
  if (targetId && people[targetId]) {
    const person = people[targetId];
    person.parents = [...(person.parents || []), newId];
    savePersonToDB(targetId, people[targetId]);
    const idx = rootIds.indexOf(targetId);
    if (idx !== -1) { rootIds.splice(idx, 1); rootIds.push(newId); saveRootIdsToDB(rootIds); }
  } else {
    const oldRootIds = [...rootIds];
    oldRootIds.forEach(rid => { people[rid].parents = [newId]; savePersonToDB(rid, people[rid]); });
    rootIds.length = 0;
    rootIds.push(newId);
    saveRootIdsToDB(rootIds);
  }
  currentId = newId;
  activeGroupKey = null;
  expanded.add(newId);
  editingMode = false;
  savePersonToDB(newId, people[newId]);
  logAudit('add', newId, `Menambah orang tua: ${name}`, [], currentUserProfile, db_auth?.currentUser);
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  render();
}

function cancelAddParent() {
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
}

/* ===== Hapus ===== */
function enterDeleteMode(id) {
  if (!canDelete()) return;
  editingMode = true;
  const p = people[id];
  const kids = childrenOf(id);
  const trulyOrphaned = kids.filter(k => (people[k].parents || []).length === 1);
  const grandParentNames = escapeHtml((p.parents || []).map(pp => people[pp].name).join(' & '));
  const safeName = escapeHtml(p.name);

  let bodyHtml;
  if (!kids.length) {
    bodyHtml = `<div style="font-size:13px;">Orang ini belum punya anak, datanya bisa langsung dihapus.</div>`;
  } else {
    bodyHtml = `
      <div class="panel-section-title">${safeName} tercatat punya ${kids.length} anak.</div>
      <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px;">
        ${trulyOrphaned.length
          ? trulyOrphaned.length + ' anak hanya punya ' + safeName + ' sebagai orang tua.'
          : 'Semua anak masih punya orang tua lain (co-parent) yang tersisa.'}
      </div>
      <div class="panel-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="naik" checked style="margin-top:3px;">
          <span>Anak yang jadi yatim piatu dinaikkan ke ${grandParentNames || 'leluhur baru'} — <i>disarankan</i></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="root" style="margin-top:3px;">
          <span>Anak yatim piatu dijadikan leluhur/akar baru terpisah</span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;">
          <input type="radio" name="f_del_orphan" value="cascade" style="margin-top:3px;">
          <span style="color:var(--maroon);">Hapus juga SEMUA anak &amp; keturunan — tidak bisa dibatalkan</span>
        </label>
      </div>`;
  }
  document.getElementById('detailPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:var(--maroon)">🗑️</div>
      <div><h3>Hapus ${safeName}?</h3><p>Tindakan ini tidak bisa dibatalkan.</p></div>
    </div>
    <div class="panel-body">${bodyHtml}</div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="cancelDelete('${id}')">Batal</button>
      <button class="btn" style="background:var(--maroon);color:#fff;" onclick="confirmDelete('${id}')">🗑️ Ya, Hapus</button>
    </div>`;
  document.getElementById('overlay').classList.add('show');
  setTimeout(() => document.addEventListener('click', outsideClickCloseDetail, true), 0);
}

function confirmDelete(id) {
  const kids        = childrenOf(id);
  const deletedName = people[id].name;
  let orphanChoice  = 'naik';
  if (kids.length) {
    const checked = document.querySelector('input[name="f_del_orphan"]:checked');
    orphanChoice  = checked ? checked.value : 'naik';
  }
  if (orphanChoice === 'cascade') {
    const total = 1 + countDescendants(id);
    deletePersonCascade(id);
    logAudit('delete', null, total > 1 ? `Menghapus ${total} data (${deletedName} + keturunan)` : `Menghapus: ${deletedName}`, [], currentUserProfile, db_auth?.currentUser);
  } else {
    deletePersonKeepChildren(id, orphanChoice);
    logAudit('delete', null, `Menghapus: ${deletedName}`, [], currentUserProfile, db_auth?.currentUser);
  }
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  if (!people[currentId]) currentId = rootIds[0] || Object.keys(people)[0];
  render();
}

function cancelDelete(id) {
  editingMode = false;
  openDetail(id);
}

/* ===== Modal kedua (Audit Log, Profil, Catatan, dsb.) ===== */
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

/* Menutup seluruh popup/modal/panel yang mungkin sedang terbuka sekaligus:
   panel Detail, modal sekunder (Statistik/Peta/Audit/Profil/Catatan/Konflik),
   dropdown menu (Aksi/User), dan context menu klik-kanan.
   Dipakai saat pengguna klik folder di sidebar, supaya tidak ada popup
   yang "menggantung" di belakang navigasi baru.
   skipSidebarRerender: true saat dipanggil dari dalam alur klik sidebar itu
   sendiri, supaya tidak render dua kali (renderSidebar lalu render lagi). */
function closeAllOverlays(skipSidebarRerender) {
  closeModal();
  editingMode = false;
  document.getElementById('overlay').classList.remove('show');
  document.removeEventListener('click', outsideClickCloseDetail, true);
  highlightedId = null;
  if (!skipSidebarRerender) renderSidebar();
  closeDropdowns();
  const ctx = document.getElementById('ctxMenu');
  if (ctx) ctx.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
});

/* ===== Context Menu ===== */
function openCtxMenu(e, id) {
  const menu = document.getElementById('ctxMenu');
  const container = document.getElementById('contentArea');
  const containerRect = container.getBoundingClientRect();
  menu.style.display = 'block';
  let left = e.clientX - containerRect.left;
  let top  = e.clientY - containerRect.top;
  const menuW = 200, menuH = 220;
  left = Math.max(4, Math.min(left, containerRect.width  - menuW));
  top  = Math.max(4, Math.min(top,  containerRect.height - menuH));
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
  menu.dataset.target = id;
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', () => {
    document.getElementById('ctxMenu').style.display = 'none';
  });
  document.getElementById('ctxMenu')?.addEventListener('click', e => {
    const act = e.target.dataset.act;
    const id  = document.getElementById('ctxMenu').dataset.target;
    if (!act) return;
    if (act === 'open') {
      const isLeluhurTanpaOrtu = rootIds.includes(id) && !people[id].parents.length;
      if (childrenOf(id).length && !isLeluhurTanpaOrtu) { navigateToPerson(id); expanded.add(id); render(); }
      else openDetail(id);
    }
    if (act === 'edit')         { openDetail(id); enterEditMode(id); }
    if (act === 'assignparent') { openAssignParentModal(id); }
    if (act === 'addchild')     { enterAddChildMode(id); }
    if (act === 'olderSibling') { if (makeOlderSibling(id)) render(); }
    if (act === 'youngerSibling') { if (makeYoungerSibling(id)) render(); }
    if (act === 'delete')       { enterDeleteMode(id); }
  });
});

/* ===== Pencarian Global ===== */
let searchDebounceTimer = null;

function runGlobalSearch(term) {
  const box = document.getElementById('searchGlobalResults');
  if (!box) return;
  const q = term.trim().toLowerCase();
  if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const matches = Object.keys(people)
    .filter(id => people[id].name.toLowerCase().includes(q))
    .slice(0, 30);
  if (!matches.length) {
    box.innerHTML = '<div class="search-global-empty">Tidak ditemukan.</div>';
    box.classList.add('open');
    return;
  }
  box.innerHTML = matches.map(id => {
    const chain = pathToRoot(id).slice(0, -1).map(pid => escapeHtml(people[pid].name));
    return `<button type="button" class="search-global-item" data-jump="${id}">
      <span>${escapeHtml(people[id].name)}</span>
      ${chain.length ? `<span class="sg-path">${chain.join(' › ')}</span>` : ''}
    </button>`;
  }).join('');
  box.classList.add('open');
  box.querySelectorAll('[data-jump]').forEach(btn => {
    btn.onclick = () => {
      const id     = btn.dataset.jump;
      const parent = primaryParentOf(id);
      currentId    = parent && people[parent] ? parent : id;
      activeGroupKey = null;
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

/* ===== Tentukan Ibu/Ayah ===== */
function openAssignParentModal(childId) {
  if (!canEdit()) return;
  const child   = people[childId];
  if (!child) return;
  const primaryId = (child.parents || [])[0];
  const primary   = primaryId ? people[primaryId] : null;
  if (!primary || (primary.spouses || []).filter(s => people[s]).length < 2) {
    alert(`${primary ? escapeHtml(primary.name) + ' hanya' : 'Orang tua ini'} punya satu pasangan saja.`);
    return;
  }
  const spouseIds     = primary.spouses.filter(s => people[s]);
  const currentCoParents = (child.parents || []).filter(p => p !== primaryId);
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[3]}">💍</div>
      <div><h3>Tentukan Ibu/Ayah</h3><p>${escapeHtml(child.name)} anak dari ${escapeHtml(primary.name)} bersama...</p></div>
    </div>
    <div class="panel-body">
      <div class="panel-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        ${spouseIds.map(sid => `
          <label style="display:flex;align-items:center;gap:6px;font-weight:500;">
            <input type="radio" name="f_assign_spouse" value="${sid}"
              ${currentCoParents.length === 1 && currentCoParents[0] === sid ? 'checked' : ''}>
            💍 ${escapeHtml(people[sid].name)}
          </label>`).join('')}
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveAssignParent('${childId}','${primaryId}')">Simpan</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

function saveAssignParent(childId, primaryId) {
  const picked = document.querySelector('input[name="f_assign_spouse"]:checked');
  if (!picked) { alert('Pilih salah satu pasangan.'); return; }
  const child  = people[childId];
  const before = (child.parents || []).map(pid => people[pid] ? people[pid].name : pid).join(' & ');
  child.parents = [primaryId, picked.value];
  closeModal();
  savePersonToDB(childId, people[childId]);
  logAudit('edit', childId, `Menentukan ibu/ayah ${child.name}: ${before} → ${people[primaryId].name} & ${people[picked.value].name}`, [], currentUserProfile, db_auth?.currentUser);
  render();
}

/* ===== Hapus Pasangan ===== */
function openRemoveSpouseModal(personId, spouseId) {
  if (!canEdit()) return;
  const person = people[personId], spouse = people[spouseId];
  if (!person || !spouse) return;
  const groups = getSpouseGroups(personId);
  const kidsCount = groups
    ? (groups.find(g => g.spouseId === spouseId) || { kids: [] }).kids.length
    : childrenOf(personId).filter(k => (people[k].parents || []).includes(spouseId)).length;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[3]}">💔</div>
      <div><h3>Hapus Pasangan</h3><p>Melepas status pasangan antara ${escapeHtml(person.name)} &amp; ${escapeHtml(spouse.name)}</p></div>
    </div>
    <div class="panel-body">
      <p style="font-size:12.5px;line-height:1.6;margin:0;">
        Ini hanya melepas status "menikah". Kartu ${escapeHtml(spouse.name)} tidak ikut terhapus.
        ${kidsCount ? `<br><br>⚠️ Ada <b>${kidsCount}</b> anak yang tercatat bersama pasangan ini — data anak tidak ikut berubah.` : ''}
      </p>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" style="background:var(--maroon);" onclick="confirmRemoveSpouse('${personId}','${spouseId}')">Ya, Hapus Pasangan</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

function confirmRemoveSpouse(personId, spouseId) {
  const person = people[personId], spouse = people[spouseId];
  if (!person || !spouse) return;
  person.spouses = (person.spouses || []).filter(s => s !== spouseId);
  spouse.spouses = (spouse.spouses || []).filter(s => s !== personId);
  closeModal();
  savePersonToDB(personId, people[personId]);
  savePersonToDB(spouseId, people[spouseId]);
  logAudit('edit', personId, `Menghapus pasangan: ${person.name} & ${spouse.name}`, [], currentUserProfile, db_auth?.currentUser);
  const reopenDetail = document.getElementById('overlay').classList.contains('show');
  render();
  if (reopenDetail) openDetail(personId);
}

/* ===== Bulk Assign ===== */
function openBulkAssignModal(personId, kidIds) {
  if (!canEdit()) return;
  const person   = people[personId];
  const spouseIds = (person.spouses || []).filter(s => people[s]);
  if (!person || spouseIds.length < 2 || !kidIds.length) return;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[3]}">💍</div>
      <div><h3>Tetapkan ${kidIds.length} Anak Sekaligus</h3><p>Pilih pasangan yang benar untuk semua anak di grup ini</p></div>
    </div>
    <div class="panel-body">
      <div class="panel-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        ${spouseIds.map((sid, idx) => `
          <label style="display:flex;align-items:center;gap:6px;font-weight:500;">
            <input type="radio" name="f_bulk_spouse" value="${sid}" ${idx === 0 ? 'checked' : ''}>
            💍 ${escapeHtml(people[sid].name)}
          </label>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:11.5px;color:var(--ink-soft);">
        Semua ${kidIds.length} anak: ${kidIds.map(k => escapeHtml(people[k].name)).join(', ')}
      </div>
    </div>
    <div class="panel-footer">
      <button class="btn btn-ghost" id="bulkAssignCancelBtn">Batal</button>
      <button class="btn btn-primary" id="bulkAssignSaveBtn">Simpan</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
  document.getElementById('bulkAssignCancelBtn').onclick = closeModal;
  document.getElementById('bulkAssignSaveBtn').onclick = () => confirmBulkAssign(personId, kidIds);
}

function confirmBulkAssign(personId, kidIds) {
  const picked = document.querySelector('input[name="f_bulk_spouse"]:checked');
  if (!picked) { alert('Pilih salah satu pasangan.'); return; }
  const spouseId = picked.value;
  kidIds.forEach(childId => {
    const child = people[childId];
    if (!child) return;
    child.parents = [personId, spouseId];
    savePersonToDB(childId, people[childId]);
  });
  closeModal();
  logAudit('edit', personId, `Menetapkan ${kidIds.length} anak ke pasangan ${people[spouseId].name}`, [], currentUserProfile, db_auth?.currentUser);
  render();
}

/* ===== Profil & Audit Log ===== */
let currentUserProfile = null;

function openProfileEditor() {
  const p = currentUserProfile || { name: '', region: '' };
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[2]}">👤</div>
      <div><h3>Profil Anda</h3><p>Nama ini tampil di riwayat perubahan</p></div>
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

function saveProfile() {
  const name   = document.getElementById('f_prof_name').value.trim();
  const region = document.getElementById('f_prof_region').value.trim();
  if (!name) { alert('Nama wajib diisi.'); return; }
  const email = (db_auth && db_auth.currentUser) ? db_auth.currentUser.email : '';
  const role  = (currentUserProfile && currentUserProfile.role) || 'editor';
  currentUserProfile = { ...currentUserProfile, name, region, email, role };
  if (db_firestore && db_auth && db_auth.currentUser) {
    // merge:true → field lain (termasuk "role") tidak ikut terhapus/tertimpa
    db_firestore.collection('users').doc(db_auth.currentUser.uid).set(currentUserProfile, { merge: true })
      .catch(err => console.error('Gagal menyimpan profil:', err));
  }
  closeModal();
}

let auditCursor = null;
const AUDIT_PAGE_SIZE = 50;

function openAuditLog() {
  if (!canEdit()) return;
  if (!db_firestore) { alert('Riwayat perubahan memerlukan Firestore.'); return; }
  auditCursor = null;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[1]}">📜</div>
      <div><h3>Riwayat Perubahan</h3><p>Siapa mengubah apa dan kapan</p></div>
    </div>
    <div class="panel-body" id="auditList"><div class="audit-empty">Memuat riwayat…</div></div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');
  loadAuditPage(false);
}

function renderAuditEntries(docs, append) {
  const list = document.getElementById('auditList');
  const old  = document.getElementById('auditLoadMoreBtn');
  if (old) old.remove();
  if (!append) list.innerHTML = '';
  if (!append && !docs.length) {
    list.innerHTML = '<div class="audit-empty">Belum ada riwayat perubahan.</div>';
    return;
  }
  docs.forEach(doc => {
    const d   = doc.data();
    const row = document.createElement('div');
    row.className = 'audit-entry';
    row.innerHTML = `
      <span class="audit-time">${formatAuditTimestamp(d.ts)}</span>
      <span class="audit-user">${escapeHtml(d.userName) || 'Tidak diketahui'}</span>
      <span class="audit-summary"><span class="audit-icon">${auditActionIcon(d.action)}</span>${escapeHtml(d.summary)}</span>`;
    list.appendChild(row);
  });
  if (docs.length === AUDIT_PAGE_SIZE) {
    const btn = document.createElement('button');
    btn.id = 'auditLoadMoreBtn'; btn.className = 'audit-loadmore';
    btn.textContent = 'Muat lebih banyak…';
    btn.onclick = () => loadAuditPage(true);
    list.appendChild(btn);
  }
}

function loadAuditPage(append) {
  let q = db_firestore.collection('auditLog').orderBy('ts', 'desc').limit(AUDIT_PAGE_SIZE);
  if (append && auditCursor) q = q.startAfter(auditCursor);
  q.get().then(snap => {
    if (snap.docs.length) auditCursor = snap.docs[snap.docs.length - 1];
    renderAuditEntries(snap.docs, append);
  }).catch(() => {
    document.getElementById('auditList').innerHTML = '<div class="audit-empty">Gagal memuat riwayat.</div>';
  });
}

/* ===== Catatan nasab ===== */
const CATATAN_SILSILAH_TEXT = 'KH Mas Mansur bin Djojoredjo bin Mertoloyo bin Wongso Dipuro bin Wongso Menggolo';

function openCatatan() {
  const nama = CATATAN_SILSILAH_TEXT.split(' bin ').map(escapeHtml);
  const html = nama.map(n => `<span class="catatan-name">${n}</span>`).join(' bin ');
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">📝</div>
      <div><h3>Catatan</h3><p>Nasab / silsilah leluhur</p></div>
    </div>
    <div class="panel-body"><p style="line-height:2.6;">${html}</p></div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

/* ===== Statistik otomatis ===== */
function countUniquePairs() {
  const seen = new Set();
  let count = 0;
  Object.keys(people).forEach(id => {
    (people[id].spouses || []).forEach(spId => {
      if (!people[spId]) return;
      const key = [id, spId].sort().join('|');
      if (!seen.has(key)) { seen.add(key); count++; }
    });
  });
  return count;
}

function getBirthdaysThisMonth() {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const results = [];
  Object.keys(people).forEach(id => {
    const p = people[id];
    if (p.death) return; // sudah wafat, lewati
    const parsed = parseTglLengkap(p.birth);
    if (!parsed) return;
    if (parsed.m === curMonth) results.push({ id, name: p.name, day: parsed.d });
  });
  results.sort((a, b) => a.day - b.day);
  return results;
}

function computeStatistik() {
  const totalAnggota = Object.keys(people).length;
  const totalGenerasi = totalGenerations();
  const totalPasangan = countUniquePairs();
  const ultahBulanIni = getBirthdaysThisMonth();
  return { totalAnggota, totalGenerasi, totalPasangan, ultahBulanIni };
}

function openStatistik() {
  const s = computeStatistik();
  const bulanNama = BULAN_MASEHI[new Date().getMonth()];
  const ultahHtml = s.ultahBulanIni.length
    ? `<div class="statistik-ultah-list">${s.ultahBulanIni.map(u => `
        <div class="statistik-ultah-row" data-id="${u.id}" onclick="closeModal(); navigateToPerson('${u.id}'); expanded.add('${u.id}'); render(); openDetail('${u.id}');">
          <span class="statistik-ultah-day">${String(u.day).padStart(2,'0')}</span>
          <span class="statistik-ultah-name">${escapeHtml(u.name)}</span>
        </div>`).join('')}</div>`
    : `<p class="audit-empty">Tidak ada ulang tahun bulan ini.</p>`;

  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[1]}">📊</div>
      <div><h3>Statistik Keluarga</h3><p>Ringkasan otomatis dari data pohon</p></div>
    </div>
    <div class="panel-body">
      <div class="statistik-grid">
        <div class="statistik-card">
          <div class="statistik-num">${s.totalAnggota}</div>
          <div class="statistik-label">Total Anggota</div>
        </div>
        <div class="statistik-card">
          <div class="statistik-num">${s.totalGenerasi}</div>
          <div class="statistik-label">Generasi</div>
        </div>
        <div class="statistik-card">
          <div class="statistik-num">${s.totalPasangan}</div>
          <div class="statistik-label">Pasangan</div>
        </div>
        <div class="statistik-card">
          <div class="statistik-num">${s.ultahBulanIni.length}</div>
          <div class="statistik-label">Ulang Tahun ${bulanNama}</div>
        </div>
      </div>
      <div class="panel-section-title" style="margin-top:16px;">🎂 Ulang Tahun Bulan Ini</div>
      ${ultahHtml}
    </div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

/* ===== Peta persebaran keluarga (per kota/kabupaten domisili) ===== */
function computePetaPersebaran() {
  const counts = {};
  Object.keys(people).forEach(id => {
    const p = people[id];
    if (p.death) return; // hanya yang masih hidup dihitung untuk domisili saat ini
    const kota = (p.kabupaten || '').trim();
    if (!kota) return;
    counts[kota] = (counts[kota] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([kota, jumlah]) => ({ kota, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

function openPetaPersebaran() {
  const data = computePetaPersebaran();
  const totalTercatat = data.reduce((sum, r) => sum + r.jumlah, 0);
  const totalTanpaKota = Object.keys(people).filter(id => !people[id].death && !(people[id].kabupaten || '').trim()).length;
  const maxJumlah = data.length ? data[0].jumlah : 0;

  const rowsHtml = data.length
    ? data.map(r => `
        <div class="peta-row">
          <span class="peta-kota">${escapeHtml(r.kota)}</span>
          <div class="peta-bar-wrap"><div class="peta-bar" style="width:${maxJumlah ? (r.jumlah / maxJumlah * 100) : 0}%"></div></div>
          <span class="peta-jumlah">${r.jumlah}</span>
        </div>`).join('')
    : `<p class="audit-empty">Belum ada data Kabupaten/Kota yang terisi.</p>`;

  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[2]}">🗺️</div>
      <div><h3>Peta Persebaran Keluarga</h3><p>Berdasarkan Kabupaten/Kota domisili</p></div>
    </div>
    <div class="panel-body">
      <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">
        ${totalTercatat} orang tercatat di ${data.length} kota/kabupaten
        ${totalTanpaKota ? ` · ${totalTanpaKota} orang belum mengisi Kabupaten/Kota` : ''}
      </p>
      <div class="peta-list">${rowsHtml}</div>
    </div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

/* ===== Reset Kata Sandi Pengguna (Admin) =====
   Admin memilih seorang pengguna dari daftar, lalu aplikasi mengirim
   email "reset password" resmi dari Firebase ke email pengguna tsb —
   sama seperti tombol "Lupa kata sandi?" di halaman login, hanya saja
   dipicu oleh admin, bukan oleh pengguna itu sendiri. Firebase Client
   SDK tidak mengizinkan mengganti password orang lain secara langsung
   tanpa melalui email konfirmasi ini. */
async function openResetPasswordModal() {
  if (!canResetPassword()) return;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[3] || genColors[0]}">🔑</div>
      <div><h3>Reset Kata Sandi Pengguna</h3><p>Kirim tautan reset ke email pengguna</p></div>
    </div>
    <div class="panel-body">
      <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">Memuat daftar pengguna…</p>
    </div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');

  if (!db_firestore) {
    document.querySelector('#modalPanel .panel-body').innerHTML =
      `<p class="audit-empty">Firebase belum dikonfigurasi.</p>`;
    return;
  }

  let users = [];
  try {
    const snap = await db_firestore.collection('users').get();
    snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (e) {
    console.error('Gagal memuat daftar pengguna:', e);
    document.querySelector('#modalPanel .panel-body').innerHTML =
      `<p class="audit-empty">Gagal memuat daftar pengguna.</p>`;
    return;
  }

  const rowsHtml = users.length
    ? users.map(u => `
        <div class="resetpw-row" data-uid="${escapeHtml(u.id)}">
          <div class="resetpw-info">
            <div class="resetpw-name">${escapeHtml(u.name || '(tanpa nama)')} <span class="resetpw-role">${escapeHtml(u.role || 'editor')}</span></div>
            <div class="resetpw-email">${escapeHtml(u.email || '-')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" ${u.email ? `onclick="sendResetPasswordTo('${escapeHtml(u.email)}', this)"` : 'disabled'}>Kirim Reset</button>
        </div>`).join('')
    : `<p class="audit-empty">Belum ada pengguna terdaftar.</p>`;

  document.querySelector('#modalPanel .panel-body').innerHTML = `
    <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">
      Pilih pengguna untuk mengirim tautan reset kata sandi ke emailnya.
    </p>
    <div class="resetpw-list">${rowsHtml}</div>
    <div id="resetpwFeedback" style="margin-top:10px;font-size:12.5px;"></div>`;
}

function sendResetPasswordTo(email, btnEl) {
  if (!canResetPassword()) return;
  const feedback = document.getElementById('resetpwFeedback');
  btnEl.disabled = true;
  btnEl.textContent = 'Mengirim…';
  db_auth.sendPasswordResetEmail(email)
    .then(() => {
      btnEl.textContent = '✓ Terkirim';
      if (feedback) {
        feedback.style.color = 'var(--teal)';
        feedback.textContent = `Tautan reset kata sandi telah dikirim ke ${email}.`;
      }
    })
    .catch(err => {
      btnEl.disabled = false;
      btnEl.textContent = 'Kirim Reset';
      if (feedback) {
        feedback.style.color = '#B23A3A';
        feedback.textContent = terjemahErrorAuth(err);
      }
    });
}

/* ===== Buku Tamu (lihat daftar pengunjung tanpa akun) =====
   Hanya editor & admin yang boleh membaca collection guestbook
   (ditegakkan juga di firestore.rules). Menampilkan nama, wilayah,
   email, dan kapan tamu tsb membuka aplikasi. */
async function openGuestbookViewer() {
  if (!canEdit()) return;
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:${genColors[0]}">📖</div>
      <div><h3>Buku Tamu</h3><p>Pengunjung yang membuka tanpa akun</p></div>
    </div>
    <div class="panel-body">
      <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">Memuat…</p>
    </div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');

  if (!db_firestore) {
    document.querySelector('#modalPanel .panel-body').innerHTML =
      `<p class="audit-empty">Firebase belum dikonfigurasi.</p>`;
    return;
  }

  let entries = [];
  try {
    const snap = await db_firestore.collection('guestbook').orderBy('ts', 'desc').limit(100).get();
    snap.forEach(doc => entries.push(doc.data()));
  } catch (e) {
    console.error('Gagal memuat buku tamu:', e);
    document.querySelector('#modalPanel .panel-body').innerHTML =
      `<p class="audit-empty">Gagal memuat buku tamu.</p>`;
    return;
  }

  const rowsHtml = entries.length
    ? entries.map(g => {
        const contact = g.contact || g.email || '-';
        const icon = g.contactType === 'phone' ? '📱' : '📧';
        return `
        <div class="audit-entry">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <b style="font-size:13px;">${escapeHtml(g.name || '(tanpa nama)')}</b>
            <span style="font-size:11px;color:var(--ink-soft);flex-shrink:0;">${formatAuditTimestamp(g.ts)}</span>
          </div>
          <div style="font-size:12px;color:var(--ink-soft);">${escapeHtml(g.region || '-')} · ${icon} ${escapeHtml(contact)}</div>
        </div>`;
      }).join('')
    : `<p class="audit-empty">Belum ada tamu yang tercatat.</p>`;

  document.querySelector('#modalPanel .panel-body').innerHTML = `
    <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">${entries.length} kunjungan tercatat (100 terbaru)</p>
    <div>${rowsHtml}</div>`;
}

/* ===== Panel Persetujuan Akun Pending (Admin only) ===== */
async function openPendingApprovalPanel() {
  if (!canDelete()) return; // admin only
  document.getElementById('modalPanel').innerHTML = `
    <div class="panel-header">
      <div class="avatar" style="background:var(--teal)">⏳</div>
      <div><h3>Persetujuan Akun</h3><p>Akun yang menunggu konfirmasi Admin</p></div>
    </div>
    <div class="panel-body" id="pendingPanelBody">
      <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">Memuat…</p>
    </div>
    <div class="panel-footer"><button class="btn btn-ghost" onclick="closeModal()">Tutup</button></div>`;
  document.getElementById('modalOverlay').classList.add('show');

  if (!db_firestore) {
    document.getElementById('pendingPanelBody').innerHTML =
      `<p class="audit-empty">Firebase belum dikonfigurasi.</p>`;
    return;
  }

  await reloadPendingList();
}

async function reloadPendingList() {
  const body = document.getElementById('pendingPanelBody');
  if (!body) return;
  body.innerHTML = `<p style="color:var(--ink-soft);font-size:12px;">Memuat…</p>`;

  let users = [];
  try {
    const snap = await db_firestore.collection('users')
      .where('pendingApproval', '==', true).get();
    snap.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));
  } catch (e) {
    body.innerHTML = `<p class="audit-empty">Gagal memuat daftar akun pending.</p>`;
    console.error(e);
    return;
  }

  if (!users.length) {
    body.innerHTML = `<p class="audit-empty">Tidak ada akun yang menunggu persetujuan. ✅</p>`;
    return;
  }

  const rowsHtml = users.map(u => `
    <div class="audit-entry" id="pending-row-${u.uid}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <div>
        <b style="font-size:13px;">${escapeHtml(u.name || '(tanpa nama)')}</b>
        <div style="font-size:12px;color:var(--ink-soft);">${escapeHtml(u.email || '-')} · ${escapeHtml(u.region || '-')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-sm" style="background:var(--teal);color:#fff;border:none;"
          onclick="approveUser('${u.uid}', '${escapeHtml(u.name || '')}')">✅ Setujui</button>
        <button class="btn btn-sm btn-ghost"
          onclick="rejectUser('${u.uid}', '${escapeHtml(u.name || '')}')">❌ Tolak</button>
      </div>
    </div>`).join('');

  body.innerHTML = `
    <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12px;">${users.length} akun menunggu persetujuan</p>
    <div>${rowsHtml}</div>`;
}

async function approveUser(uid, name) {
  if (!confirm(`Setujui akun "${name}" sebagai Editor?\nMereka akan bisa menambah dan mengubah data silsilah.`)) return;
  try {
    const approvedBy = (currentUserProfile && currentUserProfile.name)
      ? currentUserProfile.name
      : (db_auth && db_auth.currentUser ? db_auth.currentUser.email : 'Admin');
    await db_firestore.collection('users').doc(uid).update({
      role: 'editor',
      pendingApproval: firebase.firestore.FieldValue.delete(),
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: approvedBy,
    });
    logAudit('approve-user', null, `Menyetujui akun: ${name} (${uid})`, [], currentUserProfile, db_auth?.currentUser);
    const row = document.getElementById(`pending-row-${uid}`);
    if (row) {
      row.innerHTML = `<span style="color:var(--teal);font-size:13px;">✅ ${escapeHtml(name)} — disetujui</span>`;
      setTimeout(() => row.remove(), 2000);
    }
    await reloadPendingList();
  } catch (e) {
    alert('Gagal menyetujui akun: ' + e.message);
    console.error(e);
  }
}

async function rejectUser(uid, name) {
  const pilihan = confirm(`Tolak akun "${name}"?\n\nKlik OK → akun tetap ada tapi tetap berstatus publik (baca saja).\nKlik Batal → batalkan penolakan.`);
  if (!pilihan) return;
  try {
    await db_firestore.collection('users').doc(uid).update({
      pendingApproval: false,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUserProfile ? currentUserProfile.name : (db_auth.currentUser ? db_auth.currentUser.email : 'Admin'),
    });
    logAudit('reject-user', null, `Menolak akun: ${name} (${uid})`, [], currentUserProfile, db_auth?.currentUser);
    const row = document.getElementById(`pending-row-${uid}`);
    if (row) {
      row.innerHTML = `<span style="color:var(--maroon);font-size:13px;">❌ ${escapeHtml(name)} — ditolak (akun tetap baca saja)</span>`;
      setTimeout(() => row.remove(), 2000);
    }
    await reloadPendingList();
  } catch (e) {
    alert('Gagal menolak akun: ' + e.message);
    console.error(e);
  }
}
