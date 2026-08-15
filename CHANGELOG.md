# Changelog

Semua perubahan penting dicatat di file ini (format: Keep a Changelog).

## [Unreleased]

### Added

- MVP core: auth (Better Auth), onboarding katalog UT, semester, mata
  kuliah, aktivitas, dashboard, catatan rich text, file privat, kalender,
  reminder in-app + email, ekspor data, penghapusan akun.
- Landing page konversi dengan desain system Doze.
- Analytics anonim (funnel pilot) + `npm run analytics:funnel`.
- Rate limiting Redis (auth per-IP, login per-email, upload per-user).
- Monitoring: `/healthz/ready`, worker heartbeat, worker healthcheck Docker.
- Script backup/restore + drill otomatis.
- Lisensi MIT.

### Changed

- Konsentrasi privasi menjadi version-aware (re-consent saat kebijakan berubah).

### Security

- Rate limit login/register/upload; CSRF + trusted-origin checks; file
  privat dengan checksum; tanpa PII di analytics.
