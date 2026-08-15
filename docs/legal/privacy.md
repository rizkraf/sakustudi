# Kebijakan Privasi

Berlaku untuk Sakustudi ("aplikasi"). Sakustudi adalah produk pihak ketiga
dan tidak berafiliasi dengan Universitas Terbuka (UT).

Versi dokumen: 2026-08-15.

## Data yang dikumpulkan

- Akun: email, nama tampilan, password (hash).
- Data akademik yang dimasukkan pengguna: program studi, semester, mata
  kuliah, tugas, diskusi, catatan, link, file, event kalender, preferensi
  reminder.
- Data consent hukum: versi dokumen yang disetujui dan waktu persetujuan.
- Log keamanan minimal tanpa isi konten: jenis aksi, id resource, waktu.

## Metrik produk anonim

Kami mencatat metrik produk anonim seperti pembuatan akun, penyelesaian
onboarding, kursus yang dibuat, aktivitas, catatan, unggahan file, reminder,
dan permintaan ekspor. Metrik ini tidak pernah memuat email, isi catatan,
nama file, atau data privat pengguna. Saat akun dihapus, keterkaitan
pengguna dihapus sehingga catatan metrik menjadi anonim.

## Penggunaan

- Menyediakan fungsi aplikasi (dashboard, reminder, pencarian, ekspor).
- Mengirim email yang diminta pengguna (verifikasi, reset password, reminder).
- Analitik produk hanya dengan consent dan tanpa data konten.

## AI / model bahasa

- Tidak ada fitur AI pada MVP core.
- Data pengguna tidak digunakan untuk pelatihan model tanpa persetujuan
  eksplisit terpisah.

## Penyimpanan & keamanan

- Data disimpan di server yang dioperasikan penyedia self-host/cloud sesuai
  deployment. Enkripsi in-transit (HTTPS) wajib.
- File privat tidak dapat diakses publik; akses selalu diverifikasi ownership.
- Admin tidak membaca isi catatan/file secara default; akses dukungan harus
  beralasan dan diaudit.

## Hak pengguna

- Ekspor data kapan saja (ZIP, masa aktif 24 jam).
- Hapus akun kapan saja; seluruh data dan file privat dihapus.
- Tarik/tolak consent analitik.

## Retensi

- Data dihapus permanen saat akun dihapus.
- Log audit anonim non-personal dapat dipertahankan.

## Kontak

Pertanyaan privasi: hubungi maintainer melalui kanal publik repository.
