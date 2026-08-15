# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mahasiswa aktif Universitas Terbuka yang kuliah sambil bekerja atau punya
tanggung jawab lain. Menggunakan HP sebagai perangkat utama. Deadline tugas
dan diskusi tersebar di banyak kanal (email, LMS, grup), sehingga butuh
pengingat dan struktur yang siap pakai tanpa konfigurasi produktivitas
yang rumit.

Target pasar awal: mahasiswa UT saja. Kampus lain tidak menjadi target
sampai kebutuhan dasarnya tervalidasi.

## Product Purpose

Sakustudi adalah dashboard akademik yang membantu mahasiswa UT mengelola
semester, mata kuliah, tugas, diskusi, catatan, file privat, kalender, dan
pengingat deadline dalam satu tempat. Keberhasilan = mahasiswa menyelesaikan
onboarding dalam hitungan menit, rutin memantau progres, dan tidak
melewatkan deadline.

## Positioning

Sistem akademik siap pakai khusus alur kuliah UT (katalog program studi dan
mata kuliah) yang privat, bisa diekspor, dan bisa di-host sendiri — bukan
produk resmi UT. Tidak tergantung integrasi tidak resmi dengan sistem UT;
data katalog hanya referensial.

## Operating Context

- Belajar jarak jauh UT: tugas dan diskusi dengan tenggat dari berbagai
  kanal; mahasiswa membangun sistemnya sendiri jika tidak dibantu.
- Penggunaan dominan dari HP (mobile-first, PWA installable); offline
  mutations di luar scope.
- Waktu tampil `Asia/Jakarta`; deadline tanpa jam dianggap `23:59` WIB.
- Reminder: 3 hari dan 1 hari sebelum deadline, in-app dan email (opsional).
- Self-hosted via Docker Compose (PostgreSQL + Redis + web + worker);
  S3/MinIO opsional untuk storage privat.

## Capabilities and Constraints

- Registrasi email/password + verifikasi email (Better Auth), onboarding
  katalog UT (3 program studi seed: Sistem Informasi, Teknik Informatika,
  Manajemen), semester (satu aktif per user), mata kuliah katalog/custom,
  aktivitas (tugas, diskusi, ujian, dll.), catatan rich text (Tiptap,
  sanitasi server), file privat (PDF/PNG/JPEG/DOCX, magic bytes, checksum),
  kalender, reminder in-app + email (BullMQ + Redis), ekspor ZIP, hapus
  akun, rate limiting (Redis), analytics anonim (funnel pilot).
- Privasi: data pengguna privat, ekspor + hapus wajib; analytics tanpa PII.
- Rate limit: login/register/forgot/reset per-IP, login per-email, upload
  per-user; fail-open.
- PWA: installable, mobile-first; tanpa offline mutation.
- Stack: React Router v8 + Vite + TypeScript strict; PostgreSQL + Drizzle;
  Better Auth; BullMQ + Redis; Tiptap; Tailwind CSS v4 + token Doze;
  Vitest + Playwright; Docker Compose.
- Bahasa produk: Bahasa Indonesia.
- Terminologi khas UT: semester Gasal/Genap, program studi, mata kuliah,
  tugas, diskusi, tutorial, UAS/TAP.
- Undecided: batas numerik paket Free/Premium, harga, lisensi open source
  final (MIT vs Apache-2.0), WhatsApp reminder, fitur AI (Fase C).

## Brand Commitments

- Nama: Sakustudi (Saku Studi). Bahasa produk: Bahasa Indonesia.
- Produk pihak ketiga — bukan produk resmi UT dan tidak terafiliasi;
  disclaimer eksplisit di landing dan legal pages.
- Tidak memakai logo/aspek visual resmi UT; katalog hanya data referensial.
- Tidak ada klaim/testimoni palsu di permukaan pemasaran; proof memakai
  fakta nyata (fitur, seed catalog, self-hosting).
- Visual system: token Doze (`bg-canvas`, `bg-surface`, `text-ink`,
  `text-muted`, `border-border`, `ring-focus`, `bg-primary` kuning
  `#ffce54`), font Geist, radius 4/8/12px, mobile-first — binding.

## Evidence on Hand

- `prd-sakustudi.md` — PRD lengkap (funnel, monetisasi, roadmap fase).
- `docs/superpowers/` — spec + plan MVP core, analytics, rate limiting,
  landing page.
- Seed catalog nyata: 3 program studi, 8 mata kuliah, 4 link layanan UT.
- `docs/legal/`, `docs/operations/` — legal dan ops documentation.
- Tidak ada testimoni, case study, angka pengguna, atau benchmark nyata —
  jangan difabrikasi.

## Product Principles

1. **Ready-to-use:** pengguna mendapat sistem akademik yang langsung bisa
   dipakai tanpa konfigurasi kompleks.
2. **Mobile-first:** alur utama nyaman di HP; target sentuh minimal 44px.
3. **Data ownership:** pengguna bisa mengakses, mengekspor, dan menghapus
   datanya kapan saja.
4. **Manual-first, integration-later:** tidak bergantung integrasi resmi
   UT sebelum izin dan kebutuhan terbukti.
5. **Open by default, free has real value:** core open source dan paket
   gratis tetap berguna; Premium menjual skala, kenyamanan, dan otomasi.
6. **Academic integrity:** bantuan belajar tidak memfasilitasi kecurangan
   akademik.

## Accessibility & Inclusion

- Kontras token Doze memadai; status tidak hanya lewat warna.
- Navigasi keyboard: `focus-visible` ring di semua elemen interaktif.
- Target sentuh minimal 44px di mobile; `prefers-reduced-motion` dihormati.
