# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Laporkan kerentanan secara privat ke
maintainer: buka GitHub Security Advisory di
`https://github.com/rizkraf/sakustudi/security/advisories/new` atau hubungi
maintainer lewat email yang tercantum di profil GitHub.

Sertakan:

- Versi/commit yang terpengaruh.
- Deskripsi singkat + langkah reproduksi.
- Dampak potensial.

## Response times

- Konfirmasi penerimaan laporan: 3 hari kerja.
- Penilaian awal dan rencana perbaikan: 10 hari kerja.
- Rilis perbaikan untuk kerentanan kritikal: secepatnya, umumnya < 30 hari.

## Scope

- Aplikasi web, worker, dan konfigurasi deployment di repository ini.
- Dependency production.

Di luar scope: data kampus/materi berlisensi, akun pengguna layanan lain.

## Disclosures

Temuan yang diperbaiki diumumkan di GitHub Security Advisories. Reporter
dikreditkan kecuali meminta anonim.

## Praktik yang berlaku di codebase

- `BETTER_AUTH_SECRET` wajib di production (boot gagal tanpa secret valid).
- Origin/CSRF dicek untuk semua mutation ber-cookie.
- File privat diverifikasi ownership sebelum streaming/signing.
- Sanitasi HTML server-side; queue hanya membawa ID/metadata.
- Secret scan + dependency audit di CI.
