# Product Requirements Document — Saku Studi

**Nama produk:** Saku Studi  
**Status:** Draft untuk discovery dan pengembangan MVP  
**Versi:** 0.3  
**Bahasa produk:** Bahasa Indonesia  
**Model bisnis:** Open-core freemium; source code inti terbuka, layanan hosted dan fitur premium berbayar  
**Model distribusi:** Self-hosted open source dan managed cloud  
**Platform tahap awal:** Web responsif/PWA  
**Target pasar awal:** Mahasiswa Universitas Terbuka  
**Status afiliasi:** Produk pihak ketiga; bukan produk resmi Universitas Terbuka kecuali terdapat kerja sama tertulis.

---

## 1. Ringkasan Eksekutif

Saku Studi menyediakan ruang kerja digital untuk mengelola aktivitas pembelajaran dalam satu dashboard, termasuk mata kuliah, diskusi, tugas, tenggat waktu, catatan, berkas, dan tautan akademik.

Produk mengubah proses pengelolaan akademik yang tersebar dan manual menjadi alur kerja terstruktur dengan onboarding, pengingat, pelacakan progres, dan fitur AI pembelajaran sebagai bagian dari paket Premium.

### Nilai utama

> Mahasiswa dapat mengatur satu semester dalam beberapa menit tanpa perlu membangun sistem produktivitas secara manual.

---

## 2. Latar Belakang dan Masalah

Mahasiswa, khususnya yang memiliki pekerjaan atau tanggung jawab lain, perlu mengelola informasi akademik dari beberapa kanal. Kondisi ini menimbulkan beberapa kendala:

1. Deadline tugas dan diskusi tersebar di banyak tempat.
2. Mahasiswa harus menyusun sistem pengelolaan akademik secara manual.
3. Progress per mata kuliah sulit dilihat secara menyeluruh.
4. Catatan, file, dan link akademik tidak terorganisasi.
5. pengingat sering tidak konsisten.
6. Mahasiswa membutuhkan bantuan memahami materi, bukan hanya tempat menyimpan informasi.

Produk ini membantu mahasiswa memahami aktivitas yang perlu diselesaikan, menentukan prioritas berdasarkan tenggat waktu, dan memantau progres pembelajaran tanpa konfigurasi produktivitas yang kompleks.

---

## 3. Tujuan Produk

### Tujuan bisnis dan ekosistem

- Memvalidasi kebutuhan platform manajemen pembelajaran khusus mahasiswa UT.
- Membangun komunitas pengguna dan kontributor di sekitar proyek open source.
- Menyediakan versi hosted yang mudah digunakan tanpa instalasi dan konfigurasi teknis.
- Menghasilkan pendapatan dari hosting terkelola, fitur Premium, AI, kapasitas tambahan, dukungan, dan layanan organisasi.
- Menjaga agar core platform tetap dapat diaudit, dikembangkan, dan di-host sendiri sesuai lisensi yang dipilih.
- Membuka kemungkinan perluasan ke institusi dan kelompok belajar lain tanpa bergantung pada integrasi tidak resmi.

### Tujuan pengguna

- Membuat dashboard semester secara cepat.
- Melihat semua tugas, diskusi, dan tenggat waktu dalam satu tempat.
- Memantau progres kuliah.
- Menyimpan dan menemukan catatan dengan mudah.
- Mendapatkan bantuan belajar dari AI berdasarkan materi milik pengguna.

### Sasaran awal MVP

- Pengguna dapat menyelesaikan onboarding dan membuat semester aktif.
- Pengguna dapat menambahkan mata kuliah serta aktivitas akademik.
- Pengguna dapat melihat tenggat waktu dan status progres.
- Pengguna dapat membuat catatan dan mengunggah file secara aman.
- Pengguna dapat mencoba nilai utama produk tanpa membayar.
- Pengguna memahami manfaat Premium dan dapat melakukan upgrade.

---

## 4. Non-Goals MVP

Hal berikut tidak termasuk dalam MVP:

- Menggantikan sistem resmi MyUT atau E-Learning UT.
- Login menggunakan kredensial MyUT/E-Learning pengguna.
- Scraping atau crawling data E-Learning UT tanpa izin.
- Menyediakan materi kuliah, modul, atau soal milik UT tanpa lisensi.
- Aplikasi Android/iOS native.
- Marketplace tutor atau komunitas besar.
- AI yang mengerjakan tugas atau menghasilkan jawaban untuk diserahkan sebagai karya asli pengguna.
- Integrasi langsung ke kalender atau platform eksternal sebelum kebutuhan dasarnya tervalidasi.

---

## 5. Target Pengguna dan Persona

### Persona utama — Mahasiswa aktif

- Mengambil beberapa mata kuliah dalam satu semester.
- Menggunakan HP sebagai perangkat utama.
- Membutuhkan pengingat karena memiliki pekerjaan atau tanggung jawab lain.
- Menginginkan sistem pengelolaan akademik yang terstruktur dan siap digunakan.
- Memiliki kebutuhan belajar yang beragam.

### Persona potensial masa depan — Komunitas atau mentor

- Membantu banyak mahasiswa menyiapkan sistem belajar.
- Membutuhkan template atau workspace untuk kelompok.
- Bukan target utama MVP.

---

## 6. Kebutuhan Pengguna (Jobs to Be Done)

1. **Saat semester baru dimulai**, saya ingin membuat dashboard semester dengan cepat agar tidak perlu menyusun sistem dari nol.
2. **Saat memiliki banyak aktivitas kuliah**, saya ingin melihat semua tugas dan diskusi berdasarkan tenggat waktu agar tahu prioritas hari ini.
3. **Saat menyelesaikan aktivitas**, saya ingin memperbarui status agar dapat melihat progres per mata kuliah.
4. **Saat membaca materi**, saya ingin menyimpan catatan dan file berdasarkan mata kuliah agar mudah ditemukan kembali.
5. **Saat tidak memahami materi**, saya ingin meminta penjelasan atau kuis dari AI berdasarkan catatan saya agar dapat belajar lebih efektif.

---

## 7. Prinsip Produk

1. **Ready-to-use:** pengguna mendapatkan sistem yang sudah siap digunakan.
2. **Mobile-first:** aktivitas utama nyaman dilakukan dari HP.
3. **Low cognitive load:** pengguna tidak perlu memahami database atau konfigurasi kompleks.
4. **Data ownership:** pengguna dapat mengakses, mengekspor, dan menghapus datanya.
5. **Academic integrity:** AI membantu belajar, bukan memfasilitasi kecurangan akademik.
6. **Manual-first, integration-later:** produk tidak bergantung pada integrasi resmi UT sebelum ada izin dan kebutuhan yang terbukti.
7. **Open by default:** core platform, dokumentasi, dan proses kontribusi transparan; data pengguna tetap privat.
8. **Free has real value:** paket gratis dan self-hosted harus berguna; layanan Premium menjual skala, kenyamanan, otomatisasi, dan bantuan belajar yang lebih kuat.

---

## 8. Strategi Open Source dan Distribusi

Saku Studi menggunakan pendekatan **open-core**:

### Komponen open source

- Core aplikasi dashboard akademik.
- Skema database dan migration.
- API dan autentikasi dasar.
- Modul semester, mata kuliah, tugas, diskusi, catatan, kalender, dan tautan.
- Dokumentasi instalasi dan konfigurasi.
- Docker Compose atau metode instalasi lokal yang terdokumentasi.
- Test suite dan contoh konfigurasi.

### Layanan hosted Premium

- Hosting dan maintenance terkelola.
- Backup otomatis.
- Penyimpanan tambahan.
- AI Study Assistant dan kuota AI.
- Reminder email berskala besar.
- Export dan pemulihan data.
- Monitoring, support, dan SLA untuk organisasi.
- Fitur cloud-only yang memang memerlukan biaya operasional, setelah dipisahkan secara jelas dari core.

### Prinsip lisensi

- Lisensi open source harus dipilih sebelum repository publik dibuat.
- Lisensi harus jelas untuk code, dokumentasi, aset visual, dan dataset.
- Dependency pihak ketiga harus memiliki lisensi yang kompatibel.
- Repository harus memiliki `LICENSE`, `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, dan kebijakan keamanan.
- Jangan memasukkan secret, data mahasiswa, materi berlisensi, logo resmi UT, atau konten privat ke repository.
- Kebijakan merek Saku Studi harus membedakan hak penggunaan source code dari hak penggunaan nama dan logo.

Lisensi awal yang dapat dievaluasi adalah MIT atau Apache-2.0 untuk core yang permisif. Jika diperlukan perlindungan terhadap layanan cloud yang mengambil source code tanpa berbagi perubahan, opsi lisensi source-available atau model dual licensing harus dibahas secara terpisah karena tidak semuanya memenuhi definisi open source OSI.

### Pengalaman self-hosted

- Instalasi dapat dilakukan melalui dokumentasi yang dapat diikuti oleh pengembang umum.
- Konfigurasi environment variable terdokumentasi.
- Admin self-hosted dapat mengatur SMTP, storage, AI provider, dan payment provider sendiri.
- Fitur Premium cloud tidak boleh membuat core self-hosted rusak.
- Sistem memberi penanda yang jelas jika fitur tidak tersedia pada instalasi tertentu.

### Tata kelola proyek

- Issue tracker publik untuk bug dan feature request.
- Pull request wajib melalui review.
- CI menjalankan lint, test, build, dan pemeriksaan dependency.
- Release menggunakan changelog dan versioning yang konsisten.
- Security issue dilaporkan melalui kanal privat, bukan issue publik.
- Keputusan arsitektur penting dicatat dalam ADR.

---

## 9. Ruang Lingkup MVP

### 9.1 Autentikasi dan profil

- Registrasi dengan email dan password.
- Login, logout, reset password.
- Profil: nama, program studi, semester aktif.
- Persetujuan Terms of Service dan Privacy Policy.
- Penghapusan akun oleh pengguna.

### 9.2 Onboarding

- Pilih program studi atau opsi “Isi sendiri”.
- Pilih semester aktif.
- Pilih atau masukkan mata kuliah.
- Sistem membuat workspace semester.
- Tampilkan checklist onboarding.
- Tampilkan nilai produk pertama dalam satu sesi onboarding.

### 9.3 Dashboard

Dashboard menampilkan:

- Semester aktif.
- Ringkasan jumlah mata kuliah.
- Tugas dan diskusi yang mendekati tenggat waktu.
- Aktivitas terlambat.
- Progress per mata kuliah.
- Quick action untuk menambah tugas, diskusi, catatan, dan event.

### 9.4 Mata kuliah

Setiap mata kuliah memiliki:

- Nama dan kode mata kuliah.
- Semester.
- Progress.
- Daftar tugas.
- Daftar diskusi.
- Catatan.
- File dan link terkait.
- Status aktif/arsip.

### 9.5 Tugas dan diskusi

Field minimum:

- Judul.
- Jenis aktivitas: tugas atau diskusi.
- Mata kuliah.
- Deadline.
- Status.
- Catatan.
- Link pengumpulan atau link sumber.
- Lampiran.
- Waktu selesai.

Status minimum:

- Belum dimulai.
- Sedang dikerjakan.
- Selesai.
- Terlambat.

### 9.6 Kalender dan pengingat

- Tampilan agenda dan kalender sederhana.
- Filter berdasarkan mata kuliah dan jenis aktivitas.
- pengingat in-app.
- pengingat email untuk tenggat waktu mendatang.
- Pengaturan reminder per pengguna.
- Pengguna dapat menonaktifkan reminder.

### 9.7 Catatan dan berkas

- Membuat, mengedit, dan menghapus catatan.
- Relasi catatan dengan mata kuliah.
- Tag sederhana.
- Upload file dengan batas ukuran dan tipe yang ditentukan.
- File private dan hanya dapat diakses pemiliknya.
- Search berdasarkan judul dan isi teks jika tersedia.

### 9.8 Tautan berguna

- Menyediakan link default yang dapat dikelola admin.
- Pengguna dapat menambah link pribadi.
- Kategori: layanan kampus, referensi, tools, dan lainnya.
- Link dibuka di tab baru.

### 9.9 Paket Freemium dan Premium

#### Free

- Satu semester aktif.
- Jumlah mata kuliah terbatas.
- Tugas, diskusi, kalender, dan catatan dasar.
- Penyimpanan file terbatas.
- pengingat dasar.
- AI tidak tersedia atau hanya trial terbatas.

#### Premium

- Beberapa semester.
- Mata kuliah dan aktivitas dengan batas lebih tinggi atau unlimited sesuai kebijakan harga.
- Penyimpanan lebih besar.
- pengingat lanjutan dan berulang.
- Search dan statistik lanjutan.
- Export dan backup.
- Akses AI Study Assistant.
- Dukungan prioritas.

Batas numerik Free dan Premium harus dikonfigurasi dari admin/backend, bukan ditanam permanen di frontend.

---

## 10. Fitur Premium AI

### 10.1 AI Summary

Pengguna dapat meminta ringkasan dari catatan atau file yang diunggah.

**Acceptance criteria:**

- Pengguna dapat memilih sumber yang diizinkan.
- Sistem menampilkan status proses.
- Hasil mencantumkan bahwa AI dapat keliru.
- Hasil dapat disimpan sebagai catatan.
- Hasil tidak otomatis dianggap sebagai materi resmi UT.

### 10.2 AI Quiz dan flashcard

- Membuat pertanyaan latihan dari catatan pengguna.
- Pengguna dapat memilih tingkat kesulitan.
- Pengguna dapat mengedit atau menghapus hasil.
- Sistem tidak mengklaim bahwa soal AI adalah soal ujian resmi.

### 10.3 Tanya jawab berdasarkan dokumen

- Pengguna dapat mengajukan pertanyaan terhadap sumber yang dipilih.
- Jawaban menyebutkan sumber atau bagian dokumen jika memungkinkan.
- Sistem menolak atau mengarahkan ulang permintaan yang meminta kecurangan akademik.
- Dokumen pengguna tidak digunakan untuk melatih model tanpa persetujuan yang jelas.

### 10.4 Pengendalian penggunaan AI

- Setiap pengguna memiliki kuota atau kredit.
- Kuota ditampilkan secara transparan.
- Penggunaan dan error AI dicatat untuk analisis biaya.
- Rate limit mencegah penyalahgunaan.
- Sistem menyediakan pesan yang jelas saat kuota habis.

---

## 11. Alur Pengguna

### Flow A — Pengguna baru

1. Membuka landing page.
2. Memilih “Mulai gratis”.
3. Membuat akun.
4. Menyetujui kebijakan.
5. Memilih program studi dan semester.
6. Menambahkan mata kuliah.
7. Masuk ke dashboard.
8. Melihat checklist dan quick actions.

### Flow B — Menambahkan aktivitas

1. Klik “Tambah tugas” atau “Tambah diskusi”.
2. Pilih mata kuliah.
3. Isi judul dan tenggat waktu.
4. Opsional: tambah link, catatan, atau file.
5. Simpan.
6. Aktivitas tampil di dashboard dan kalender.

### Flow C — Menggunakan AI

1. Pengguna Premium membuka catatan atau file.
2. Memilih fitur AI.
3. Sistem menampilkan estimasi atau penggunaan kredit.
4. Pengguna mengonfirmasi.
5. Sistem memproses permintaan.
6. Hasil tampil dan dapat disimpan.

### Flow D — Upgrade

1. Pengguna mencoba fitur premium atau mencapai limit Free.
2. Sistem menampilkan paywall kontekstual.
3. Pengguna melihat manfaat Premium dan harga.
4. Pengguna memilih paket.
5. Pengguna membayar melalui payment gateway.
6. Status subscription diperbarui melalui webhook.
7. Fitur Premium terbuka.

---

## 12. Persyaratan Fungsional

| ID | Requirement | Prioritas | Acceptance criteria ringkas |
|---|---|---|---|
| FR-01 | User dapat membuat akun dan login | P0 | Akun valid dapat login; password reset tersedia |
| FR-02 | User dapat membuat semester aktif | P0 | Semester tersimpan dan tampil di dashboard |
| FR-03 | User dapat menambahkan mata kuliah | P0 | Mata kuliah muncul di daftar dan dapat dibuka |
| FR-04 | User dapat membuat tugas/diskusi | P0 | Aktivitas tersimpan dengan tenggat waktu dan status |
| FR-05 | User dapat mengubah status aktivitas | P0 | Progress mata kuliah dan dashboard ikut berubah |
| FR-06 | User dapat melihat aktivitas berdasarkan tenggat waktu | P0 | Agenda menampilkan aktivitas pada tanggal yang benar |
| FR-07 | User dapat menerima reminder | P0 | pengingat terkirim sesuai preferensi atau tercatat gagal |
| FR-08 | User dapat membuat catatan | P0 | Catatan tersimpan, diedit, dicari, dan dihapus |
| FR-09 | User dapat mengunggah file private | P0 | File hanya dapat diakses user yang berhak |
| FR-10 | User dapat melihat batas paket | P0 | Limit dan penggunaan ditampilkan transparan |
| FR-11 | Sistem membatasi fitur berdasarkan paket | P0 | User Free tidak dapat melewati limit melalui API/frontend |
| FR-12 | User dapat upgrade Premium | P1 | Pembayaran sukses mengaktifkan subscription |
| FR-13 | Webhook pembayaran diproses idempotent | P1 | Event duplikat tidak menggandakan status atau transaksi |
| FR-14 | Premium user dapat memakai AI Summary | P1 | Kredit berkurang dan hasil dapat disimpan |
| FR-15 | Premium user dapat membuat quiz/flashcard | P1 | Hasil sesuai sumber yang dipilih dan dapat diedit |
| FR-16 | User dapat export data | P1 | Export menghasilkan file yang dapat dibaca |
| FR-17 | Admin dapat mengelola template dan link | P1 | Perubahan admin terlihat sesuai scope yang ditentukan |
| FR-18 | Pengguna dapat menghapus akun | P0 | Data dihapus atau dianonimkan sesuai kebijakan |
| FR-19 | Pengembang dapat menjalankan core secara self-hosted | P0 | Dokumentasi dan konfigurasi menghasilkan instalasi yang dapat digunakan |
| FR-20 | Repository menyediakan dokumentasi kontribusi | P1 | README, CONTRIBUTING, CODE_OF_CONDUCT, dan LICENSE tersedia |
| FR-21 | CI memeriksa lint, test, build, dan dependency | P1 | Pull request gagal jika pemeriksaan wajib tidak lulus |
| FR-22 | Admin self-hosted dapat mengatur provider eksternal | P1 | SMTP, storage, AI, dan payment dapat dikonfigurasi melalui environment/config |
| FR-23 | Sistem membedakan fitur core dan hosted Premium | P0 | Fitur yang tidak tersedia pada self-hosted menampilkan status dan dokumentasi yang jelas |
| FR-24 | Pengguna dapat mengekspor data dari hosted maupun self-hosted | P1 | Format export terdokumentasi dan dapat diproses kembali |

Prioritas: **P0 = wajib MVP, P1 = penting setelah fondasi stabil, P2 = ditunda.**

---

## 13. Persyaratan Nonfungsional

### Performance

- Halaman dashboard terbuka dengan cepat pada koneksi seluler normal.
- Loading state tersedia untuk proses yang lama.
- Operasi CRUD utama memberikan feedback berhasil/gagal.
- Proses AI berjalan asynchronous jika memerlukan waktu lebih lama.

### Reliability

- Backup database terjadwal.
- Error pembayaran dan AI dapat ditelusuri.
- Sistem tidak kehilangan data ketika request diulang.
- Webhook pembayaran idempotent.

### Security

- HTTPS wajib.
- Authorization dicek di server/API.
- Row-level access untuk data pengguna.
- File tidak menggunakan URL publik permanen.
- Secret API tidak dikirim ke browser.
- Rate limiting untuk login, upload, dan AI.

### Supply chain dan maintainability

- Dependency memiliki lockfile dan pemeriksaan lisensi.
- CI menjalankan pemeriksaan dependency rentan.
- Versi runtime, database, dan provider yang didukung terdokumentasi.
- Migration database dapat dijalankan ulang secara aman.
- Konfigurasi default tidak mengandung secret.
- Rilis memiliki changelog dan catatan migrasi jika ada perubahan breaking.

### Privacy

- Privacy Policy tersedia sebelum registrasi.
- Pengguna dapat meminta export dan penghapusan data.
- Data AI pengguna tidak digunakan untuk training tanpa persetujuan.
- Retensi data dan file dijelaskan secara eksplisit.

### Accessibility

- Kontras warna memadai.
- Navigasi dapat digunakan tanpa mouse untuk fungsi utama.
- Label form jelas.
- Status tidak hanya disampaikan melalui warna.

---

## 14. Data Model Tingkat Tinggi

Entitas minimum:

- `users`
- `profiles`
- `academic_terms`
- `courses`
- `enrollments`
- `activities`
- `notes`
- `attachments`
- `calendar_events`
- `reminders`
- `useful_links`
- `subscriptions`
- `ai_usage`
- `audit_logs`

Relasi utama:

```text
User 1—1 Profile
User 1—N AcademicTerm
AcademicTerm 1—N Enrollment
Enrollment N—1 Course
Enrollment 1—N Activity
Enrollment 1—N Note
Note 1—N Attachment
User 1—1 Subscription
User 1—N AIUsage
```

Semua query data pengguna harus memiliki pemeriksaan ownership atau authorization yang sesuai.

---

## 15. Analytics dan Event Tracking

Event minimum:

- `signup_completed`
- `onboarding_started`
- `onboarding_completed`
- `course_created`
- `activity_created`
- `activity_completed`
- `note_created`
- `file_uploaded`
- `reminder_created`
- `ai_feature_viewed`
- `ai_request_started`
- `ai_request_completed`
- `ai_request_failed`
- `paywall_viewed`
- `checkout_started`
- `subscription_started`
- `subscription_cancelled`
- `export_requested`

### Funnel utama

```text
Landing page
→ Signup
→ Onboarding selesai
→ Mata kuliah pertama dibuat
→ Aktivitas pertama dibuat
→ Kembali pada minggu berikutnya
→ Mencoba Premium
→ Berlangganan
```

### Target validasi awal

- Pengguna menyelesaikan onboarding.
- Pengguna menambahkan setidaknya satu mata kuliah.
- Pengguna membuat aktivitas akademik.
- Pengguna kembali dan memperbarui aktivitas pada minggu berikutnya.
- Sebagian pengguna bersedia mencoba atau membayar Premium.

Angka target final ditetapkan setelah baseline dari pilot diperoleh, bukan dipaksakan sebelum ada data.

---

## 16. Monetisasi dan Billing

### Model distribusi

Saku Studi menyediakan dua jalur penggunaan:

1. **Self-hosted open source** — pengguna atau organisasi menjalankan aplikasi sendiri dengan tanggung jawab infrastruktur masing-masing.
2. **Managed cloud** — Saku Studi menyediakan hosting, maintenance, backup, monitoring, dan fitur Premium.

### Paket Free hosted

- Satu semester aktif.
- Mata kuliah dan aktivitas dengan batas yang terukur.
- Catatan dan kalender dasar.
- Penyimpanan terbatas.
- Pengingat dasar.
- Tidak ada atau hanya trial AI terbatas.

### Paket Premium hosted

- Beberapa semester.
- Batas mata kuliah dan aktivitas lebih tinggi.
- Penyimpanan lebih besar.
- Backup dan pemulihan.
- Pengingat lanjutan.
- Search dan statistik lanjutan.
- AI Study Assistant dengan kuota/kredit.
- Export dan dukungan prioritas.

### Sumber pendapatan

- Langganan Premium individu.
- Biaya hosting terkelola.
- Paket organisasi atau komunitas.
- Dukungan teknis dan SLA.
- Layanan instalasi, migrasi, atau konsultasi.
- Fitur cloud tambahan yang tidak mengunci atau merusak core open source.

### Kebutuhan billing

- Paket bulanan dan tahunan untuk layanan hosted.
- Status: trial, active, past_due, cancelled, expired.
- Riwayat transaksi.
- Invoice atau bukti pembayaran.
- Grace period yang didefinisikan.
- Penanganan refund sesuai kebijakan.
- Sinkronisasi status dengan payment gateway.
- Self-hosted tidak memerlukan payment gateway Saku Studi.

Payment gateway yang dapat dievaluasi: Midtrans, Xendit, atau penyedia lain yang sesuai dengan kebutuhan recurring billing.

---

## 17. Admin dan Operasional

Admin MVP dapat:

- Mengelola daftar program studi dan mata kuliah.
- Mengelola template aktivitas.
- Mengelola link berguna.
- Mengatur batas paket.
- Mengatur harga atau plan identifier.
- Melihat pengguna dan status subscription secara terbatas.
- Melihat penggunaan AI dan error.
- Menonaktifkan konten atau akun yang melanggar kebijakan.

Admin tidak boleh dapat membaca catatan pribadi atau file pengguna secara default. Akses support harus memiliki alasan, audit log, dan pembatasan yang jelas.

---

## 18. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Produk dianggap resmi UT | Legal dan reputasi | Branding pihak ketiga, disclaimer, minta izin sebelum memakai aset resmi |
| Perubahan data akademik | Template tidak akurat | Data dapat diedit; admin editor; jangan bergantung pada scraping |
| Biaya AI terlalu tinggi | Margin negatif | Kuota, kredit, rate limit, model berjenjang, logging biaya |
| Pengguna hanya memakai Free | Pendapatan rendah | Premium menjual automation, storage, backup, dan AI yang nyata manfaatnya |
| Biaya maintenance open source meningkat | Kapasitas tim terbebani | Scope core jelas, roadmap publik, kontribusi terdokumentasi, dan support berbayar untuk kebutuhan khusus |
| Fork atau self-hosted tidak diperbarui | Fragmentasi ekosistem | Release berkala, migration guide, compatibility policy, dan komunikasi deprecation |
| Pengguna tidak mau mengisi data | Aktivasi rendah | Onboarding singkat, template, import, quick add |
| Kebocoran file atau catatan | Dampak privasi tinggi | Storage private, signed URL, authorization server-side, audit dan backup |
| AI digunakan untuk mencontek | Risiko etika dan reputasi | Guardrail, edukasi integritas akademik, jangan memasarkan AI sebagai pembuat jawaban tugas |
| Ketergantungan pada satu vendor AI | Operasional terganggu | Abstraction layer dan fallback provider bila layak |

---

## 19. Rollout Plan

### Fase 0 — Discovery

- Wawancara mahasiswa.
- Uji landing page.
- Tentukan fitur dan batas Freemium.
- Verifikasi isu merek, konten, dan privasi.

### Fase 1 — Prototype

- Prototype onboarding, dashboard, mata kuliah, aktivitas, dan AI paywall.
- Uji usability dengan pengguna target.
- Perbaiki bahasa, navigasi, dan struktur data.

### Fase 2 — Closed alpha

- Pengguna terbatas.
- Fokus pada stabilitas CRUD, onboarding, dan akses data.
- AI belum harus tersedia tanpa batas.

### Fase 3 — Beta Freemium

- Pendaftaran terbuka.
- Paket Free aktif.
- Premium dan billing dapat diuji oleh early adopters.
- Analytics dan support sudah berjalan.

### Fase 4 — Rilis Open Source

- Repository core dipublikasikan dengan lisensi yang telah dipilih.
- README, dokumentasi instalasi, panduan kontribusi, dan contoh environment tersedia.
- CI, issue template, pull request template, dan security policy aktif.
- Self-hosted pilot berhasil menjalankan workflow utama tanpa layanan internal yang tidak terdokumentasi.

### Fase 5 — Public launch

- Landing page dan konten edukasi.
- Referral mahasiswa.
- Partnership dengan komunitas jika sesuai.
- Iterasi harga berdasarkan data penggunaan.

---

## 20. Definition of Done MVP

MVP dianggap siap untuk pilot jika:

- Pengguna dapat daftar, login, reset password, dan menghapus akun.
- Pengguna dapat menyelesaikan onboarding tanpa bantuan manual.
- Pengguna dapat membuat semester, mata kuliah, tugas, diskusi, catatan, dan event.
- Dashboard menampilkan aktivitas dan progress secara benar.
- pengingat bekerja atau kegagalannya tercatat.
- File pengguna tersimpan private dan dapat dihapus.
- Pembatasan Free/Premium bekerja di server.
- Upgrade dan webhook pembayaran telah diuji.
- Penggunaan AI memiliki kuota, error handling, dan logging biaya.
- Privacy Policy, Terms of Service, dan disclaimer tersedia.
- Event analytics utama tercatat.
- Backup dan prosedur pemulihan telah diuji.
- Pilot user dapat menyelesaikan alur kerja utama dari perangkat mobile.
- Core dapat dijalankan secara self-hosted berdasarkan dokumentasi resmi.
- Repository memiliki lisensi, changelog, panduan kontribusi, dan security policy.
- CI berhasil menjalankan lint, test, build, dan pemeriksaan dependency.
- Data hosted dan self-hosted dapat diekspor dalam format yang terdokumentasi.

---

## 21. Pertanyaan yang Masih Harus Diputuskan

1. Apakah target awal hanya mahasiswa UT atau sejak awal dibuat generik untuk semua kampus?
2. Berapa batas mata kuliah, storage, dan AI trial untuk Free?
3. Apakah paket Premium akan bulanan, tahunan, atau keduanya?
4. Apakah AI menggunakan sistem kredit, kuota bulanan, atau kombinasi?
5. Apakah data mata kuliah disediakan oleh admin atau sepenuhnya diisi pengguna?
6. Apakah pengguna membutuhkan fitur import data dari sumber eksternal pada MVP?
7. Apakah reminder email cukup untuk MVP atau perlu WhatsApp?
8. Apakah catatan perlu rich text penuh atau Markdown sederhana?
9. Berapa lama file dan data disimpan setelah subscription berakhir?
10. Bagaimana proses moderasi dan penanganan permintaan penghapusan data?
11. Apakah nama dan visual yang berhubungan dengan UT sudah memiliki izin penggunaan?
12. Apa indikator keberhasilan pilot yang akan digunakan untuk memutuskan public launch?
13. Lisensi open source apa yang paling sesuai untuk core: MIT, Apache-2.0, atau opsi lain?
14. Fitur mana yang wajib tersedia pada self-hosted dan fitur mana yang khusus managed cloud?
15. Siapa yang bertanggung jawab atas maintenance, security release, dan review kontribusi?
16. Apakah Saku Studi memerlukan dual licensing atau pemisahan repository core dan cloud?
17. Bagaimana kebijakan penggunaan nama, logo, dan aset visual oleh fork atau deployment pihak ketiga?

---

## 22. Rekomendasi Prioritas Implementasi

Urutan pembangunan yang disarankan:

1. Auth dan onboarding.
2. Semester dan mata kuliah.
3. Tugas, diskusi, dan status progres.
4. Dashboard dan kalender.
5. Catatan dan berkas private.
6. Pengingat.
7. Self-hosting, konfigurasi, dan dokumentasi instalasi.
8. Freemium entitlements dan paywall.
9. Billing dan webhook.
10. AI Summary.
11. AI quiz/flashcard.
12. Pencarian, export, statistik, dan CI open source.

AI sebaiknya dibangun setelah alur kerja inti dan pengalaman self-hosted stabil. Jika aktivitas dasar belum digunakan secara rutin, AI tidak akan menyelesaikan masalah product-market fit.
