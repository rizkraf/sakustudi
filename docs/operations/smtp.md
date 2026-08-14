# SMTP Configuration

SMTP digunakan untuk:

- Verifikasi email (wajib agar login berfungsi).
- Reset password (wajib).
- Email reminder (opsional; toggle hanya muncul jika SMTP dikonfigurasi).

## Environment

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=********
SMTP_FROM="Sakustudi <no-reply@example.com>"
```

- Tanpa `SMTP_HOST`: email tidak terkirim; verifikasi/reset tetap berjalan
  sebagai fitur (user menerima link langsung saat development/test via mail
  adapter file/in-memory), tapi **production harus mengonfigurasi SMTP**
  sebelum mengaktifkan registrasi publik.
- TLS: port 587 (STARTTLS) direkomendasikan; port 465 untuk implicit TLS
  sesuai dukungan provider.
- `BETTER_AUTH_URL` harus URL publik aplikasi agar link verifikasi/reset valid.

## Local development

Tanpa SMTP, gunakan mail catcher:

```bash
# contoh: MailHog
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
SMTP_HOST=localhost SMTP_PORT=1025 npm run dev
```

Test e2e memakai adapter file (`.tmp/mail.json`) — tidak perlu SMTP.
