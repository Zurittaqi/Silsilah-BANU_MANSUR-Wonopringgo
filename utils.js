/* ============================================================
   utils.js — Utilitas: Tanggal, Sanitasi, Helper
   ============================================================ */

/* ===== Sanitasi HTML ===== */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function initials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ===== Kalender Jawa & Hijriyah =====
   Referensi: Jumat 17 Agustus 1945 = Jumat Legi */
const HARI_NAMA    = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const PASARAN_NAMA = ['Legi','Pahing','Pon','Wage','Kliwon'];
const HIJRI_BULAN  = ['Muharram','Safar','Rabiul Awal','Rabiul Akhir','Jumadil Awal','Jumadil Akhir','Rajab',"Sya'ban",'Ramadhan','Syawal',"Dzulqa'dah",'Dzulhijjah'];
const BULAN_MASEHI = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function gregorianToJD(gy, gm, gd) {
  return Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4) +
         Math.floor((367  * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12) -
         Math.floor((3    * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) +
         gd - 32075;
}

function jdToHijri(jd) {
  const EPOCH_ADJ = 1948442;
  let l = jd - EPOCH_ADJ + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) +
            (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) -
          (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const month = Math.floor((24 * l) / 709);
  const day   = l - Math.floor((709 * month) / 24);
  const year  = 30 * n + j - 30;
  return { day, month, year };
}

function parseTglLengkap(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const test = new Date(y, mo - 1, d);
  if (test.getFullYear() !== y || test.getMonth() !== mo - 1 || test.getDate() !== d) return null;
  return { y, m: mo, d };
}

function renderTanggalLengkap(str) {
  const parsed = parseTglLengkap(str);
  if (!parsed) return escapeHtml(str || '-');
  const { y, m, d } = parsed;
  const jd       = gregorianToJD(y, m, d);
  const dow      = new Date(y, m - 1, d).getDay();
  const hariNama = HARI_NAMA[dow];
  const pasaran  = PASARAN_NAMA[(jd + 3) % 5];
  const h        = jdToHijri(jd);
  const tglMasehi = `${d} ${BULAN_MASEHI[m - 1]} ${y}`;
  const tglHijri  = `${h.day} ${HIJRI_BULAN[h.month - 1]} ${h.year}`;
  return `<div class="tgl-lengkap-table">
    <div class="tgl-cell">${escapeHtml(hariNama)}</div>
    <div class="tgl-cell tgl-cell-masehi">${escapeHtml(tglMasehi)}</div>
    <div class="tgl-cell">${escapeHtml(pasaran)}</div>
    <div class="tgl-cell tgl-cell-hijri">${escapeHtml(tglHijri)}</div>
  </div>`;
}

/* Pemformatan input tanggal otomatis: tambah slash setelah angka ke-2 dan ke-4 */
function formatTglLahir(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 2)  v = v.slice(0,2)  + '/' + v.slice(2);
  if (v.length > 5)  v = v.slice(0,5)  + '/' + v.slice(5);
  if (v.length > 10) v = v.slice(0,10);
  input.value = v;
}

/* ===== Audit timestamp ===== */
function formatAuditTimestamp(ts) {
  if (!ts || !ts.toDate) return 'baru saja';
  const d     = ts.toDate();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${BULAN_MASEHI[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`;
}

function auditActionIcon(action) {
  return action === 'add' ? '➕' : action === 'edit' ? '✏️' : action === 'delete' ? '🗑️' : '•';
}
