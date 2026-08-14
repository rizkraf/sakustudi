# Contributing

Terima kasih sudah berkontribusi ke Sakustudi.

## Prinsip

- Produk pihak ketiga untuk mahasiswa UT; tidak ada afiliasi resmi.
- Tidak ada scraping sistem UT atau distribusi materi berlisensi UT.
- Privasi pengguna adalah prioritas: data pengguna bisa diekspor dan dihapus.
- Setiap PR harus lolos CI (typecheck, lint, test, build, e2e).

## Alur kerja

1. Fork repository dan buat branch: `feat/<deskripsi>` atau `fix/<deskripsi>`.
2. Jalankan seluruh verifikasi sebelum commit:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run test:integration
   npm run test:e2e
   npm run build
   ```

   Integration test membutuhkan PostgreSQL dan Redis lokal:
   `docker compose -f docker-compose.dev.yml up -d postgres redis`.
3. Tulis test untuk perubahan (unit/integration/e2e sesuai konteks).
4. Commit dengan pesan konvensional: `feat:`, `fix:`, `chore:`, `docs:`,
   `refactor:`, `test:`.
5. Buat pull request; deskripsikan perubahan dan lampirkan bukti test.

## Standar kode

- TypeScript strict; tidak ada `any` tanpa alasan terdokumentasi.
- Seluruh query user-owned menerima `userId` dari session server — jangan
  pernah mempercayai `userId` dari client.
- Sanitasi HTML di server; client-side filtering bukan security boundary.
- Job queue hanya membawa ID/metadata, bukan isi catatan/file.
- Gunakan semantic Tailwind token Doze; jangan hardcode warna.
- Commit migration Drizzle untuk setiap perubahan schema.

## Keamanan

Temuan keamanan: jangan buka issue publik. Laporkan privat lewat
[SECURITY.md](SECURITY.md).
