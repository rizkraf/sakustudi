# Sakustudi Repo Prep Design (Fase A4)

Status: Approved for implementation planning
Date: 2026-08-15
Source: PRD §8 (strategi open source) + §19 Fase 4 (rilis open source);
keputusan user: lisensi MIT

## Summary

Persiapan repository untuk rilis open source: LICENSE MIT, issue/PR
templates, CHANGELOG, dan cek kesesuaian dokumen yang sudah ada
(CONTRIBUTING, SECURITY, CODE_OF_CONDUCT sudah hadir).

## Goals

- Lisensi MIT eksplisit: `LICENSE` (copyright: "Sakustudi contributors",
  dapat diubah user nanti).
- Template issue (bug report, feature request) + template PR.
- `CHANGELOG.md` berisi riwayat versi (inisialisasi dengan entri
  `Unreleased`).
- Cek `CONTRIBUTING.md`/`SECURITY.md`/`CODE_OF_CONDUCT.md` konsisten
  dengan rilis publik (tanpa perubahan besar).

## Non-Goals

- Penerapan lisensi di header file source (header license per-file).
- Badge/license metadata di package.json (perlu keputusan tambahan).
- Release automation (tagging, changelog generator, CI publish).

## Komponen

### 1. `LICENSE`

Teks MIT standar, copyright line: `Copyright (c) 2026 Sakustudi contributors`.

### 2. `.github/ISSUE_TEMPLATE/`

- `bug_report.yml` — form: judul, lingkungan (versi, mode self-host/docker),
  langkah reproduksi, hasil yang diharapkan vs aktual, log (tanpa data
  pribadi), checklist.
- `feature_request.yml` — form: masalah yang dipecahkan, usulan solusi,
  alternatif, konteks tambahan.

### 3. `.github/pull_request_template.md`

- Deskripsi perubahan, terkait issue, checklist (typecheck/lint/test,
  tanpa secret, dokumentasi diperbarui jika perlu).

### 4. `CHANGELOG.md`

- Format Keep a Changelog sederhana; entri `Unreleased` dengan perubahan
  utama yang sudah ada (fitur MVP core, analytics, rate limiting,
  monitoring, landing).

## Testing

- Tidak ada kode; verifikasi: `npm run lint` tidak terpengaruh, struktur
  file hadir, YAML template valid (parse manual).

## Out of Scope

Lihat Non-Goals.
