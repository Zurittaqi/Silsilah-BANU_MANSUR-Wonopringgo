# Catatan Keamanan — Silsilah Banu Mansur

## 1. Soal `FIREBASE_CONFIG` di `db.js`

Konfigurasi (`apiKey`, `authDomain`, dst) di `db.js` **memang selalu terlihat**
di browser siapa pun yang membuka aplikasi — ini bukan kebocoran, dan Google
sendiri menyatakan `apiKey` untuk Firebase Web **bukan rahasia**: ia hanya
menunjukkan proyek mana yang dituju, bukan kunci akses.

Yang benar-benar menjaga keamanan data adalah **Firestore Security Rules**
(`firestore.rules`) — itulah yang menentukan siapa boleh baca/tulis/hapus apa.
Sebelum rules ini dipasang, situasinya memang berisiko: siapa pun yang tahu
`projectId` bisa membaca/menulis Firestore secara langsung lewat SDK, tanpa
lewat aplikasi ini sama sekali. Setelah rules dipasang, permintaan seperti itu
akan ditolak Firestore sendiri, apa pun cara mengaksesnya.

**Tindakan opsional tambahan** (tidak wajib, tapi baik untuk proyek publik):
aktifkan **Firebase App Check** agar hanya request dari aplikasi web Anda yang
dilayani (menahan bot/scraper otomatis) — ini di luar cakupan perubahan kali
ini karena butuh setup reCAPTCHA terpisah di Firebase Console.

## 2. Cara memasang `firestore.rules`

1. Buka [Firebase Console](https://console.firebase.google.com) → pilih
   proyek `bani-kuzari-pedigree`.
2. Menu **Firestore Database** → tab **Rules**.
3. Salin seluruh isi file `firestore.rules` ke editor tersebut (timpa yang lama).
4. Klik **Publish**.

Firestore akan langsung memvalidasi sintaksnya; kalau ada galat, Console akan
menunjukkan baris yang bermasalah sebelum rules dipublikasikan.

## 3. Cara menjadikan seseorang Admin

Role default akun baru adalah **editor**. Untuk menaikkan seseorang jadi admin:

1. Firebase Console → **Authentication** → cari email orang tsb → salin **UID**-nya.
2. Firestore Database → **Data** → koleksi `users` → buka dokumen dengan ID = UID tadi.
3. Ubah field `role` dari `"editor"` menjadi `"admin"` → simpan.

Perubahan berlaku saat pengguna tersebut login ulang (atau refresh halaman).

## 4. Ringkasan hak akses

| Aksi                                  | Publik/Tamu | Editor | Admin |
|----------------------------------------|:-----------:|:------:|:-----:|
| Lihat pohon keluarga, statistik, peta  | ✅ | ✅ | ✅ |
| Tambah/edit anggota, pasangan, anak    | ❌ | ✅ | ✅ |
| Tentukan Ibu/Ayah, urutkan saudara     | ❌ | ✅ | ✅ |
| Hapus anggota                          | ❌ | ❌ | ✅ |
| Tambah Leluhur / akar baru             | ❌ | ❌ | ✅ |
| Pulihkan dari file backup (timpa semua)| ❌ | ❌ | ✅ |
| Unduh backup JSON                      | ❌ | ❌ | ✅ |
| Lihat riwayat perubahan (audit log)    | ❌ | ✅ | ✅ |
| Lihat Buku Tamu                        | ❌ | ✅ | ✅ |
| Reset kata sandi pengguna lain         | ❌ | ❌ | ✅ |

Catatan: tombol-tombol yang tidak diizinkan otomatis disembunyikan di
antarmuka sesuai role, dan juga diblokir di kode (bukan cuma disembunyikan)
serta di Firestore Rules — jadi tetap aman meski seseorang mencoba memanggil
fungsi lewat console browser.

## 5. Buku Tamu (pengunjung tanpa akun)

Saat seseorang membuka aplikasi dan memilih **"Lihat sebagai Tamu"**, mereka
diminta mengisi Nama, Alamat/Wilayah, dan **Email atau No. HP** (salah satu
saja, untuk pengunjung yang tidak ingat alamat emailnya) sebelum masuk. Data
ini disimpan ke collection `guestbook` di Firestore.

- Siapa pun (termasuk tanpa login) boleh **menambah** satu entri untuk
  dirinya sendiri.
- Hanya **admin & editor** yang boleh **membaca** daftar buku tamu (menu
  Aksi → 📖 Buku Tamu) — data pengunjung tidak terbuka untuk publik.
- Tidak ada yang bisa mengubah/menghapus entri buku tamu kecuali admin.

## 6. Reset Kata Sandi oleh Admin

Menu Aksi → 🔑 Reset Kata Sandi Pengguna (hanya tampil untuk admin)
menampilkan daftar semua pengguna terdaftar. Admin memilih satu pengguna,
lalu aplikasi mengirim **email reset password resmi dari Firebase** ke
alamat email pengguna tersebut — sama seperti tombol "Lupa kata sandi?" di
halaman login, hanya saja dipicu oleh admin.

Keterbatasan teknis yang perlu diketahui: Firebase Client SDK (yang dipakai
aplikasi web ini) tidak mengizinkan admin langsung mengganti password orang
lain tanpa konfirmasi email — itu hanya bisa lewat Firebase Admin SDK di
server, di luar cakupan aplikasi ini. Jadi pengguna yang di-reset tetap harus
membuka emailnya dan mengklik tautan untuk membuat password baru.

## 7. Deteksi konflik edit (multi-pengguna)

Setiap orang (`people/{id}`) sekarang punya tiga field tambahan yang dikelola
otomatis oleh aplikasi:

- `revision` — angka, naik +1 setiap kali data disimpan.
- `updatedAt` — waktu server saat disimpan.
- `updatedBy` — nama pengguna yang menyimpan.

Saat seseorang membuka form **Edit data**, aplikasi mencatat `revision` yang
sedang dilihat. Saat tombol **Simpan** diklik, aplikasi mengambil ulang data
terbaru dari server dan membandingkan `revision`-nya:

- Kalau sama → aman, langsung disimpan (revision naik +1).
- Kalau beda → berarti ada orang lain yang sudah menyimpan perubahan pada
  orang yang sama sejak form ini dibuka. Muncul dialog **Konflik Perubahan**
  yang menampilkan siapa & kapan mengubahnya, dengan dua pilihan:
  - **Timpa dengan Perubahan Saya** — tetap simpan versi yang sedang diedit.
  - **Muat Ulang** — batalkan perubahan sendiri, lihat versi terbaru.

Firestore Rules juga menegakkan aturan ini di sisi server (`revision` baru
harus lebih besar dari yang lama), sehingga penyimpanan yang melewati
pengecekan konflik di aplikasi (misalnya lewat pemanggilan API langsung)
tetap akan ditolak.
