# Sakustudi Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `app/routes/home.tsx` menjadi landing page konversi (CRO + copy + desain token Doze), hapus boilerplate `app/welcome/`.

**Architecture:** Single-file rewrite. `home.tsx` mempertahankan loader (`?deleted=1`), meta, dan struktur route; hanya komponen + copy + struktur section yang berubah. Unit test `bootstrap.test.tsx` diupdate (TDD) karena mengunci H1 lama. `app/welcome/` (welcome.tsx + 2 SVG) dihapus — boilerplate React Router tidak direferensikan di mana pun.

**Tech Stack:** TypeScript, React Router v8 route component, Tailwind CSS v4 + token Doze (`bg-canvas`, `bg-surface`, `text-ink`, `text-muted`, `border-border`, `bg-primary`, `ring-focus`), Vitest unit.

## Global Constraints

- Hanya token Doze; tanpa font baru, tanpa dependency, tanpa asset gambar baru.
- H1 baru: "Semua deadline kuliahmu, jelas dalam satu tempat".
- Primary CTA (hero + final): "Buat dashboard semester — gratis" → `/register`.
- Header nav CTA "Daftar" → `/register` TETAP (test bootstrap mengunci link `name: "Daftar"`).
- Loader `?deleted=1` banner tetap (`role="status"`).
- Footer disclaimer pihak ketiga + link `/legal/terms`, `/legal/privacy` tetap.
- Mobile-first; target link/button ≥ 44px (`min-h-11`); `focus-visible:ring-2 ring-focus`; tanpa animasi berat.
- Bahasa Indonesia; tanpa klaim palsu (tidak ada testimoni/angka fiktif; angka yang disebut = yang benar-benar ada: 3 program seed, reminder 3 hari & 1 hari).
- Verifikasi: `npm run typecheck`, `npm run lint`, `npm test`.

---

### Task 1: Rewrite landing page `app/routes/home.tsx` + update unit test

**Files:**
- Modify: `tests/unit/bootstrap.test.tsx:19-24`
- Rewrite: `app/routes/home.tsx`
- Test: `tests/unit/bootstrap.test.tsx`

**Interfaces:**
- Consumes: tidak ada (route component tanpa props baru; loader tetap `{ deleted: boolean }`).
- Produces: `home.tsx` dengan struktur section: header nav (anchor `#fitur`, `#cara-kerja`, `#faq`), hero, pain, fitur, cara kerja, kepercayaan, FAQ (`<details>`), final CTA, footer.

- [ ] **Step 1: Update test dulu (TDD — RED)**

`tests/unit/bootstrap.test.tsx:19-24` — ganti harapan H1:

```tsx
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent("Semua deadline kuliahmu, jelas dalam satu tempat");
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run --project unit tests/unit/bootstrap.test.tsx`
Expected: FAIL — H1 masih teks lama ("Semester kamu, jelas dalam satu tempat").

- [ ] **Step 3: Rewrite `app/routes/home.tsx`**

Ganti seluruh isi file dengan kode ini (copy persis):

```tsx
import type { Route } from "./+types/home";

/**
 * Public landing page. Authenticated users are pointed at /dashboard; the
 * ?deleted=1 flag confirms account deletion.
 */
export function meta() {
  return [
    { title: "Sakustudi — Dashboard akademik untuk mahasiswa UT" },
    {
      name: "description",
      content:
        "Kelola semester, mata kuliah, tugas, catatan, dan deadline kamu dalam satu tempat. Pengingat otomatis sebelum deadline, data privat, dan self-hostable.",
    },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { deleted: url.searchParams.get("deleted") === "1" };
}

const NAV_LINKS = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#faq", label: "FAQ" },
] as const;

const PAINS = [
  {
    title: "Deadline tersebar",
    body: "Tugas dan diskusi tenggatnya ada di beberapa tempat: email, LMS, grup. Gampang kelewat.",
  },
  {
    title: "Progress tidak terlihat",
    body: "Sudah sejauh mana mata kuliah ini? Tanpa catatan, semua terasa sama saja.",
  },
  {
    title: "Catatan & file berantakan",
    body: "Rangkuman, PDF, dan link penting nyebar di folder dan chat yang berbeda.",
  },
] as const;

const FEATURES = [
  {
    title: "Dashboard semester",
    body: "Semua mata kuliah, tugas, dan diskusi semester ini dalam satu pandangan.",
  },
  {
    title: "Pengingat deadline",
    body: "Notifikasi otomatis 3 hari dan 1 hari sebelum deadline, di aplikasi dan email.",
  },
  {
    title: "Catatan rich text",
    body: "Catat materi per mata kuliah dengan editor WYSIWYG, lengkap dengan pencarian.",
  },
  {
    title: "File privat",
    body: "Upload PDF, gambar, dan dokumen — hanya kamu yang bisa mengaksesnya.",
  },
  {
    title: "Kalender akademik",
    body: "Deadline dan jadwal kuliah terlihat per hari, per minggu.",
  },
  {
    title: "Ekspor & hapus data",
    body: "Unduh semua data kapan saja, atau hapus akun beserta datanya.",
  },
] as const;

const STEPS = [
  {
    title: "Pilih program studi",
    body: "Dari katalog UT — Sistem Informasi, Teknik Informatika, atau Manajemen — atau isi sendiri.",
  },
  {
    title: "Tambah mata kuliah & aktivitas",
    body: "Masukkan tugas, diskusi, dan deadline-nya. Katalog UT sudah tersedia.",
  },
  {
    title: "Pantau dari dashboard",
    body: "Progress per mata kuliah, agenda terdekat, dan reminder otomatis sebelum deadline.",
  },
] as const;

const TRUST_POINTS = ["Self-hosted (Docker Compose)", "Open source", "Privat & dapat diekspor", "Tanpa iklan"] as const;

const FAQS = [
  {
    question: "Apakah Sakustudi produk resmi Universitas Terbuka?",
    answer:
      "Tidak. Sakustudi adalah produk pihak ketiga yang tidak berafiliasi dengan Universitas Terbuka. Data katalog program studi dan mata kuliah hanya referensial.",
  },
  {
    question: "Apakah Sakustudi gratis?",
    answer: "Ya, untuk dipakai. Kamu bisa mendaftar dan memakai fitur inti tanpa biaya.",
  },
  {
    question: "Bisakah saya meng-host sendiri?",
    answer:
      "Bisa. Sakustudi bisa dijalankan sendiri dengan Docker Compose — data sepenuhnya milikmu. Panduannya ada di dokumentasi.",
  },
  {
    question: "Bagaimana kalau saya menghapus akun?",
    answer:
      "Data kamu dihapus atau dihilangkan identitasnya. Sebelum menghapus, kamu bisa mengekspor seluruh data terlebih dahulu.",
  },
] as const;

export default function Home({ loaderData }: Route.ComponentProps) {
  const { deleted } = loaderData;
  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <p className="text-lg font-semibold tracking-tight">Sakustudi</p>
          <nav className="hidden items-center gap-6 text-sm sm:flex" aria-label="Sections">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                {link.label}
              </a>
            ))}
          </nav>
          <nav className="flex items-center gap-3 text-sm" aria-label="Account">
            <a
              href="/login"
              className="rounded-control border border-border bg-surface px-4 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Masuk
            </a>
            <a
              href="/register"
              className="rounded-control bg-primary px-4 py-2 font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Daftar
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        {deleted ? (
          <p
            role="status"
            className="mx-auto mb-10 max-w-md rounded-control border border-border bg-surface px-4 py-3 text-sm"
          >
            Akun kamu telah dihapus beserta seluruh datanya. Terima kasih sudah
            mencoba Sakustudi.
          </p>
        ) : null}

        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
          <div className="text-center lg:text-left">
            <p className="text-sm font-medium text-muted">Untuk mahasiswa Universitas Terbuka</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Semua deadline kuliahmu, jelas dalam satu tempat
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted lg:mx-0">
              Tugas, diskusi, catatan, dan file — dikelola dari HP. Pengingat
              otomatis 3 hari dan 1 hari sebelum deadline.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <a
                href="/register"
                className="min-h-11 w-full rounded-control bg-primary px-6 py-3 text-center text-sm font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
              >
                Buat dashboard semester — gratis
              </a>
              <a
                href="/login"
                className="min-h-11 w-full rounded-control border border-border bg-surface px-6 py-3 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:w-auto"
              >
                Masuk
              </a>
            </div>
            <p className="mt-6 text-xs text-muted">
              Data privat · Bisa diekspor · Bisa di-host sendiri
            </p>
          </div>

          <div className="mx-auto w-full max-w-sm rounded-card border border-border bg-surface p-5" aria-hidden="true">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Semester Gasal 2026/27</p>
              <span className="rounded-control bg-success/20 px-2 py-0.5 text-xs font-medium text-ink">
                Aktif
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <CourseProgress name="Konsep Sistem Informasi" percent={70} />
              <CourseProgress name="Bahasa Inggris" percent={45} />
              <CourseProgress name="Bahasa Indonesia" percent={20} />
            </div>
            <div className="mt-5 space-y-2">
              <p className="rounded-control bg-danger/10 px-3 py-2 text-xs font-medium">
                Besok · Tugas 1: Konsep Sistem Informasi
              </p>
              <p className="rounded-control bg-info/10 px-3 py-2 text-xs font-medium">
                Reminder · 3 hari sebelum deadline
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">
            Kenapa mahasiswa UT sering kewalahan?
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PAINS.map((pain) => (
              <article key={pain.title} className="rounded-card border border-border bg-canvas p-5">
                <h3 className="text-sm font-semibold">{pain.title}</h3>
                <p className="mt-2 text-sm text-muted">{pain.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="fitur" className="mx-auto w-full max-w-4xl scroll-mt-20 px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Semua kebutuhan kuliahmu, satu dashboard
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-card border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="cara-kerja" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">Mulai dalam 3 langkah</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-card border border-border bg-canvas p-5">
                <span className="text-xs font-semibold text-muted">Langkah {index + 1}</span>
                <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">Data kamu, kendali kamu</h2>
        <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="text-sm font-medium">
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">Pertanyaan umum</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-card border border-border bg-canvas">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {faq.question}
                </summary>
                <p className="px-5 pb-4 text-sm text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16 pt-4 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Semester berikutnya, mulai sekarang</h2>
        <a
          href="/register"
          className="mt-6 inline-block min-h-11 rounded-control bg-primary px-8 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Buat dashboard semester — gratis
        </a>
      </section>

      <footer className="mx-auto w-full max-w-4xl px-6 py-8 text-center text-xs text-muted">
        <p>Produk pihak ketiga, tidak berafiliasi dengan Universitas Terbuka.</p>
        <p className="mt-2">
          <a className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" href="/legal/terms">
            Terms of Service
          </a>
          {" · "}
          <a className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" href="/legal/privacy">
            Privacy Policy
          </a>
        </p>
      </footer>
    </main>
  );
}

function CourseProgress({ name, percent }: { name: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted">{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan pass**

Run: `npx vitest run --project unit tests/unit/bootstrap.test.tsx`
Expected: PASS (H1 baru + link "Daftar" tetap).

- [ ] **Step 5: Verifikasi**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS semua (unit suite penuh: bootstrap + lainnya tetap hijau).

- [ ] **Step 6: Commit**

```bash
git add app/routes/home.tsx tests/unit/bootstrap.test.tsx
git commit -m "feat: rewrite public landing page with conversion copy and structure"
```

---

### Task 2: Hapus boilerplate `app/welcome/` + verifikasi

**Files:**
- Delete: `app/welcome/welcome.tsx`, `app/welcome/logo-dark.svg`, `app/welcome/logo-light.svg`

**Interfaces:**
- Consumes: tidak ada (verifikasi: tidak ada import `welcome` di codebase).

- [ ] **Step 1: Verifikasi tidak ada referensi**

Grep seluruh `app/` dan `server/` untuk `welcome/` dan `logo-dark|logo-light`:
Expected: hanya file di dalam `app/welcome/` sendiri (tidak ada import eksternal).

- [ ] **Step 2: Hapus direktori**

```bash
rm -rf app/welcome
```

- [ ] **Step 3: Verifikasi**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — tidak ada import yang putus.

- [ ] **Step 4: Commit**

```bash
git add -A app/welcome
git commit -m "chore: remove unused react-router welcome boilerplate"
```

---

## Self-Review Checklist

- [ ] Spec coverage: struktur landing (hero/pain/fitur/cara kerja/kepercayaan/FAQ/final CTA/footer) ada di Task 1; `?deleted=1` + disclaimer + legal links + "Daftar" header dipertahankan; welcome dihapus di Task 2.
- [ ] Tanpa placeholder: kode `home.tsx` lengkap.
- [ ] Konsistensi: H1 baru + CTA "Buat dashboard semester — gratis" konsisten di hero & final; micro-trust "Data privat · Bisa diekspor · Bisa di-host sendiri"; angka jujur (3 program seed, reminder 3&1 hari).
- [ ] Token Doze saja; tanpa font/dependency/asset baru; `min-h-11` + `ring-focus` pada semua link/button; `<details>` FAQ aksesibel.
- [ ] Test: bootstrap.test.tsx diupdate TDD (RED → GREEN); tidak ada test lain yang menyentuh konten landing.
