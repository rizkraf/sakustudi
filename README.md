# Sakustudi

Dashboard akademik self-hosted untuk mahasiswa Universitas Terbuka: semester,
mata kuliah, tugas, diskusi, catatan, file privat, kalender, dan pengingat
deadline. Produk pihak ketiga — **bukan** produk resmi UT dan tidak terafiliasi
dengan Universitas Terbuka.

## Fitur MVP

- Registrasi + verifikasi email + login (Better Auth, session database).
- Onboarding khusus mahasiswa UT dengan katalog program studi dan mata kuliah.
- Semester (satu aktif per user), mata kuliah katalog/custom, tugas & diskusi.
- Dashboard progress, deadline terdekat, aktivitas terlambat.
- Catatan rich text (Tiptap) dengan sanitasi server dan pencarian.
- File privat (PDF/PNG/JPEG/DOCX) dengan validasi magic bytes dan checksum.
- Kalender + pengingat in-app dan email (3 hari & 1 hari sebelum deadline).
- Ekspor data ZIP dan penghapusan akun (re-autentikasi wajib).
- PWA installable; UI mobile-first (Tailwind CSS v4 + token Doze).

## Stack

React Router (v8) · Vite · TypeScript · PostgreSQL · Drizzle ORM · Better Auth ·
BullMQ + Redis · Tiptap · Tailwind CSS v4 · Vitest · Playwright · Docker.

## Development

Prasyarat: Node 24+, Docker.

```bash
# 1) Install dependencies
npm ci

# 2) Infrastruktur lokal (postgres, redis, minio opsional)
docker compose -f docker-compose.dev.yml up -d postgres redis

# 3) Salin environment
cp .env.example .env   # isi BETTER_AUTH_SECRET dsb.

# 4) Migrasi + seed katalog
npm run db:migrate
npm run db:seed

# 5) Jalankan
npm run dev            # web di http://localhost:3000
npm run worker         # worker BullMQ (terpisah)
```

Script umum: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run test:integration`, `npm run test:e2e`, `npm run build`.

## Self-hosting (Docker Compose)

```bash
cp .env.example .env
# wajib diisi: POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d
```

- Web: `http://<host>:3000`
- Worker berjalan sebagai service terpisah (`worker`).
- Data (PostgreSQL, Redis, file privat) di persistent volumes.
- Detail: [ops](docs/operations/), [backup & restore](docs/operations/backup-restore.md).

## Keamanan

Lihat [SECURITY.md](SECURITY.md). Jangan commit secret; gunakan `.env`.
Aplikasi tidak pernah mengirim `user_id` dari client sebagai sumber otoritas,
file privat tidak pernah disajikan dari folder publik, dan catatan/email tidak
pernah masuk log.

## Disclaimer UT

Nama dan materi Universitas Terbuka hanya digunakan sebagai data katalog
referensial. Sakustudi tidak melakukan scraping, tidak mendistribusikan materi
berlisensi UT, dan tidak mengklaim afiliasi resmi. Lihat halaman
[Terms](app/routes/legal.terms.tsx) dan [Privacy](app/routes/legal.privacy.tsx)
di dalam aplikasi.

## Kontribusi

Baca [CONTRIBUTING.md](CONTRIBUTING.md) dan [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
