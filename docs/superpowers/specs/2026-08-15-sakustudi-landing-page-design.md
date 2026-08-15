# Sakustudi Landing Page Design (Public Marketing Page)

Status: Approved for implementation planning
Date: 2026-08-15
Source: copywriting + CRO + frontend-design skills; PRD `prd-sakustudi.md`

## Summary

Rewrite `app/routes/home.tsx` menjadi landing page konversi untuk calon
mahasiswa UT: struktur CRO (hero → pain → fitur → cara kerja → kepercayaan
→ FAQ → final CTA), copy Bahasa Indonesia benefit-led tanpa klaim palsu,
visual berbasis token Doze yang sudah ada. Hapus boilerplate
`app/welcome/` yang tidak terpakai.

## Goals

- Pengunjung paham dalam 5 detik: apa produk ini, untuk siapa, apa action
  utamanya (daftar gratis).
- Satu primary CTA: "Buat dashboard semester — gratis" mengarah ke
  `/register`.
- Copy jujur: tidak ada testimoni/angka fiktif. Proof nyata: katalog seed
  (3 program studi, 8 mata kuliah), link layanan UT, self-hosted, open
  source, data privat & exportable.
- Mobile-first (target persona utama pakai HP), aksesibel (target 44px,
  focus-visible ring), reduced motion dihormati.
- Tidak menambah font/dependency baru; hanya token Doze
  (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-border`,
  `ring-focus`, `bg-primary`).

## Halaman Final (struktur)

```
header: Sakustudi · nav (Fitur, Cara kerja, FAQ — anchor) · [Masuk] [Daftar]
── hero ─────────────────────────────────────────────
  eyebrow  : "Untuk mahasiswa Universitas Terbuka"
  H1       : "Semua deadline kuliahmu, jelas dalam satu tempat"
  sub      : "Tugas, diskusi, catatan, dan file — dikelola dari HP.
              Pengingat otomatis 3 hari dan 1 hari sebelum deadline."
  CTA      : [Buat dashboard semester — gratis]  [Masuk]
  micro    : "Data privat · Bisa diekspor · Bisa di-host sendiri"
  visual   : mock dashboard CSS murni (signature element) —
             kartu "Semester Gasal 2026/27" + 3 progress bar mata
             kuliah + chip deadline terdekat + chip reminder
             "Besok deadline · Tugas 1"
── pain ─────────────────────────────────────────────
  judul    : "Kenapa mahasiswa UT sering kewalahan?"
  3 kartu  : Deadline tugas & diskusi tersebar di banyak tempat ·
             Progress per mata kuliah tidak terlihat ·
             Catatan, file, dan link berantakan di mana-mana
── fitur ────────────────────────────────────────────
  judul    : "Semua kebutuhan kuliahmu, satu dashboard"
  6 kartu  : Dashboard semester · Pengingat deadline · Catatan rich text ·
             File privat · Kalender · Ekspor & hapus data
── cara kerja ───────────────────────────────────────
  judul    : "Mulai dalam 3 langkah"
  1. Pilih program studi — katalog UT (Sistem Informasi, Teknik
     Informatika, Manajemen) atau isi sendiri
  2. Tambah mata kuliah & aktivitas — tugas, diskusi, deadline
  3. Pantau dari dashboard — progress, kalender, reminder otomatis
── kepercayaan ──────────────────────────────────────
  judul    : "Data kamu, kendali kamu"
  4 baris  : Self-hosted (Docker Compose) · Open source ·
             Privat & dapat diekspor · Tanpa iklan
── FAQ ──────────────────────────────────────────────
  4 item (accordion sederhana <details>):
  Apakah Sakustudi produk resmi UT? (tidak, pihak ketiga)
  Apakah gratis? (gratis untuk dipakai)
  Bisakah di-host sendiri? (ya, Docker Compose, lihat docs)
  Bagaimana kalau saya hapus akun? (data terhapus/anonim)
── final CTA ────────────────────────────────────────
  "Semester berikutnya, mulai sekarang." + [Buat dashboard semester — gratis]
footer: disclaimer pihak ketiga + link /legal/terms /legal/privacy
```

## Copy Detail

- H1: "Semua deadline kuliahmu, jelas dalam satu tempat" (benefit-first,
  spesifik; alternatif ditolak: "Kuliah UT tanpa kelabakan ngejar
  deadline" terlalu casual untuk hero).
- CTA hero & final: "Buat dashboard semester — gratis"
  (action + outcome, bukan "Mulai gratis" generik).
- Header CTA tetap "Daftar" (test bootstrap.test.tsx mengunci link ini).
- Sub hero menyebut angka nyata: "3 hari dan 1 hari sebelum deadline".
- Pain section memakai bahasa mahasiswa: "tersebar", "tidak terlihat",
  "berantakan" — tanpa hiperbola.
- Cara kerja menyebut katalog seed jujur: "Sistem Informasi, Teknik
  Informatika, Manajemen" (3 program yang ada di seed).
- FAQ: jawaban jujur, disclaimer UT eksplisit di footer.

## Visual Direction

- **Signature element**: mock dashboard mini di hero (CSS murni, tanpa
  gambar/asset): kartu semester dengan 3 progress bar (pseudo "Konsep
  Sistem Informasi 70%", "Bahasa Inggris 45%", "Bahasa Indonesia 20%"),
  chip deadline "Besok · Tugas 1: Konsep SI" dan chip reminder
  "Reminder · 3 hari sebelum deadline". Ini mewakili isi produk nyata.
- Tipografi: Geist (existing), headline bold `tracking-tight`; tidak ada
  font baru.
- Warna: hanya token Doze; aksen kuning `bg-primary` untuk CTA + highlight
  micro-trust; tidak ada gradien.
- Layout: max-w container, section spacing konsisten (py-16/20),
  kartu `rounded-card border border-border bg-surface`.
- Motion: `transition` halus di hover CTA/kartu saja; hormati
  `prefers-reduced-motion` (tanpa animasi load/scroll).
- Mobile: satu kolom; nav anchor disembunyikan di HP (hanya Masuk/Daftar);
  hero visual di bawah teks.

## Test Impact

- `tests/unit/bootstrap.test.tsx:19-24` mengunci H1 lama dan link "Daftar":
  update harapan H1 ke "Semua deadline kuliahmu, jelas dalam satu tempat";
  link "Daftar" tetap (header nav).
- E2E lain tidak menyentuh konten landing (auth.spec langsung ke
  `/register`).
- `?deleted=1` banner tetap dipertahankan (loader + render).

## Files

- Rewrite: `app/routes/home.tsx`
- Modify: `tests/unit/bootstrap.test.tsx` (H1 expectation)
- Delete: `app/welcome/` (welcome.tsx, logo-dark.svg, logo-light.svg —
  boilerplate React Router tidak terpakai; verifikasi tidak ada import)

## Out of Scope

Login/register/legal pages, halaman app, SEO/OG image, blog, analytics
landing view (tanpa cookie visitor), animasi kompleks, asset gambar baru.
