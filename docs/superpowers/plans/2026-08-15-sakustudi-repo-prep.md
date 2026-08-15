# Sakustudi Repo Prep Implementation Plan (Fase A4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LICENSE MIT + issue/PR templates + CHANGELOG awal untuk rilis open source.

**Architecture:** File-file repo standar: `LICENSE`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml`, `.github/pull_request_template.md`, `CHANGELOG.md`. Tidak menyentuh kode; verifikasi struktural + lint.

**Tech Stack:** Markdown, YAML form templates (GitHub issue forms).

## Global Constraints

- Lisensi MIT, copyright line: `Copyright (c) 2026 Sakustudi contributors`.
- Tanpa perubahan kode; tanpa package.json license field (di luar scope).
- YAML templates valid (parse manual); no secret di template.
- Verifikasi: `npm run lint` tetap hijau; tidak ada file lain yang berubah.

---

### Task 1: LICENSE + issue/PR templates

**Files:**
- Create: `LICENSE`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Buat `LICENSE`**

Teks MIT standar:

```text
MIT License

Copyright (c) 2026 Sakustudi contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Buat `.github/ISSUE_TEMPLATE/bug_report.yml`**

```yaml
name: Bug report
description: Laporkan masalah agar bisa diperbaiki
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Terima kasih sudah melaporkan. Jangan sertakan data pribadi, email,
        catatan, atau file privat di laporan ini.
  - type: input
    id: environment
    attributes:
      label: Lingkungan
      description: Versi (commit/tag) dan mode pemasangan (Docker Compose, self-host, dev).
      placeholder: "v0.1.0 / Docker Compose"
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Langkah reproduksi
      description: Langkah berurutan untuk memunculkan masalah.
      placeholder: "1. Buka ... 2. Klik ... 3. Lihat error"
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Hasil yang diharapkan
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Hasil aktual
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Log (jika ada)
      description: Sertakan log yang relevan tanpa data pribadi.
      render: shell
```

- [ ] **Step 3: Buat `.github/ISSUE_TEMPLATE/feature_request.yml`**

```yaml
name: Feature request
description: Usulkan fitur atau perbaikan
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Masalah yang dipecahkan
      description: Skenario atau kebutuhan yang mendorong usulan ini.
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Usulan solusi
      description: Bagaimana fitur seharusnya bekerja.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatif yang dipertimbangkan
      description: Pendekatan lain yang sudah dipikirkan (jika ada).
  - type: textarea
    id: context
    attributes:
      label: Konteks tambahan
      description: Mockup, referensi, atau catatan lain.
```

- [ ] **Step 4: Buat `.github/pull_request_template.md`**

```markdown
## Deskripsi

<!-- Apa yang diubah dan mengapa. Hubungkan ke issue jika ada: Fixes #N -->

## Perubahan

- [ ] Perilaku baru / perbaikan bug
- [ ] Refactor / tidak mengubah perilaku
- [ ] Dokumentasi / config
- [ ] Perubahan schema database (sertakan migration)

## Checklist

- [ ] `npm run typecheck` dan `npm run lint` hijau
- [ ] Test terkait dijalankan (`npm test`, `npm run test:integration`)
- [ ] Tidak ada secret/data pribadi/data mahasiswa di diff
- [ ] Dokumentasi diperbarui jika env/ops berubah

## Catatan untuk reviewer

<!-- Area berisiko, keputusan desain, hal yang perlu perhatian ekstra -->
```

- [ ] **Step 5: Verifikasi**

Run: `npm run lint` — Expected: PASS (tidak terpengaruh).
Cek manual: YAML template valid (indentasi 2 spasi konsisten), LICENSE teks MIT utuh.

- [ ] **Step 6: Commit**

```bash
git add LICENSE .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/pull_request_template.md
git commit -m "chore: add MIT license and issue/PR templates"
```

---

### Task 2: `CHANGELOG.md` + verifikasi keseluruhan

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Buat `CHANGELOG.md`**

```markdown
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

- Konsentasi privasi menjadi version-aware (re-consent saat kebijakan berubah).

### Security

- Rate limit login/register/upload; CSRF + trusted-origin checks; file
  privat dengan checksum; tanpa PII di analytics.
```

- [ ] **Step 2: Verifikasi keseluruhan**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS semua (tidak ada kode berubah).

Cek struktur repo: `ls LICENSE CHANGELOG.md .github/` — semua file hadir.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: initialize changelog"
```

---

## Self-Review Checklist

- [ ] Spec coverage: LICENSE (Task 1), templates bug/feature/PR (Task 1), CHANGELOG (Task 2), cek CONTRIBUTING/SECURITY/CODE_OF_CONDUCT sudah ada (tidak diubah).
- [ ] Tanpa placeholder: semua konten lengkap.
- [ ] Tanpa secret/data pribadi di template.
- [ ] MIT copyright konsisten; tidak menyentuh kode.
