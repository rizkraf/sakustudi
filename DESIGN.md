---
name: Sakustudi
description: Dashboard akademik untuk mahasiswa UT — flat, border-tonal, aksen kuning sinyal
colors:
  primary: "#ffce54"
  success: "#cbe273"
  danger: "#ff6b6b"
  info: "#60a5fa"
  canvas: "#fafafa"
  surface: "#ffffff"
  ink: "#171717"
  muted: "#767676"
  border: "#e5e7eb"
  focus: "rgba(255, 206, 84, 0.5)"
  canvas-dark: "#151515"
  surface-dark: "#2a2c2e"
  ink-dark: "#fcfcfc"
  muted-dark: "#929292"
  border-dark: "#374151"
typography:
  display:
    fontFamily: "Geist, sans-serif"
    fontSize: "clamp(1.875rem, 2.5vw + 1rem, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  input: "4px"
  control: "8px"
  card: "12px"
spacing:
  page: "24px"
  card: "16px"
  section: "64px"
  control-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.input}"
    padding: "16px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#ffd365"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "16px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.input}"
    height: "40px"
  nav-item-active:
    backgroundColor: "rgba(255, 206, 84, 0.2)"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
---

# Design System: Sakustudi

## Overview

**Creative North Star: "The Deadline Beacon"**

Sakustudi adalah meja belajar yang tenang dengan satu mercusuar kuning di
tengahnya. Permukaan datar dan netral (kertas putih, tinta pekat, garis
pensil) membentuk ruang kerja yang jujur dan tidak berteriak — semua
informasi akademik tersusun dengan presisi alat tulis. Kuning sinyal
(#ffce54) adalah satu-satunya warna yang "menyala": tombol utama, indikator
aktif, dan titik kecil di navigasi. Kuning muncul jarang, dan justru karena
langka, mata tertuju ke sana saat hal itu benar-benar penting — seperti
beacon yang menyala menjelang deadline.

Sistem ini flat secara disiplin: tidak ada shadow, tidak ada gradien.
Kedalaman dibangun dari hierarki tonal (canvas vs surface) dan garis tipis
(border). Radius mengikuti tangga peran: 4px untuk kontrol masukan, 8px
untuk kontrol dan chip, 12px untuk kartu. Semua target sentuh minimal 44px
karena pengguna utama bekerja dari HP. Dark mode adalah negatif yang
setia: nilai-nilai yang sama, hanya dipindahkan ke malam hari.

Kepribadian visual sengaja menolak look template AI — tidak ada cream +
serif editorial, tidak ada dark + acid accent, tidak ada layout
broadsheet. Sistem ini adalah produk perangkat lunak yang tenang:
Geist di mana-mana, satu aksen, tanpa dekorasi yang tidak bekerja.

**Key Characteristics:**
- Flat by default; kedalaman dari tonal layering + border, bukan shadow.
- Satu aksen kuning sinyal yang langka dan selalu bermakna.
- Radius ladder peran: 4 / 8 / 12px, tidak pernah acak.
- Tipografi satu keluarga (Geist), hierarki via weight & size.
- Mobile-first: target sentuh 44px, kontrol utama di jangkauan ibu jari.

## Colors

Palet alat tulis: kertas, tinta, dan garis pensil sebagai netral, dengan
tiga sinyal status dan satu sinyal aksi (kuning) yang menyala di atasnya.

### Primary
- **Beacon Light** (#ffce54): Satu-satunya aksen. Tombol utama (primary),
  titik indikator aktif di sidebar, fill progress bar, state aktif toolbar
  dan nav (via `primary/20` tint). Jangan pernah digunakan untuk elemen
  dekoratif pasif.

### Neutral
- **Kertas Putih** (#fafafa, `canvas`): Latar halaman. Juga latar input
  dan track progress.
- **Surface Putih** (#ffffff, `surface`): Latar kartu, sidebar, mobile
  nav, dan tombol sekunder. Satu tingkat di atas canvas.
- **Tinta Pekat** (#171717, `ink`): Teks utama dan teks di atas Beacon
  Light.
- **Tinta Pudar** (#767676, `muted`): Teks sekunder, keterangan, label
  pasif.
- **Garis Pensil** (#e5e7eb, `border`): Semua garis: border kartu/input,
  divider (`divide-y`), outline tombol sekunder.
- **Focus Ring** (rgba(255,206,84,0.5)): Ring fokus keyboard pada semua
  elemen interaktif (`focus-visible:ring-2 ring-focus`).

### Secondary
- **Sinyal Hijau** (#cbe273): Status sukses/selesai — badge "Aktif",
  status completed, tint `success/20`.
- **Sinyal Merah** (#ff6b6b): Bahaya/danger — tombol hapus, error
  message, overdue, tint `danger/10` + border `danger/40`.
- **Sinyal Biru** (#60a5fa): Informasi — reminder/notification, tint
  `info/10`.

### Named Rules
**The Signal Rule.** Beacon Light muncul di ≤10% luas layar mana pun.
Kuning yang langka adalah sinyal; kuning yang sering jadi wallpaper.
**The Status-Not-Just-Color Rule.** Status tidak pernah disampaikan
warna saja — selalu ada teks atau ikon pendamping (badge "Aktif", label
"Overdue").

## Typography

**Display Font:** Geist (fallback `sans-serif`)
**Body Font:** Geist (fallback `sans-serif`)
**Label/Mono Font:** Geist Mono (fallback `monospace`; didefinisikan,
dipakai minimal untuk data/identifiers)

**Character:** Satu keluarga sans-serif yang geometris dan netral —
kepribadian datang dari weight dan ukuran, bukan dari ganti font.
Tidak ada font baru; self-hosted dan offline-friendly.

### Hierarchy
- **Display** (700, clamp 1.875→2.25rem, lh 1.15, tracking -0.025em):
  H1 hero landing page saja.
- **Headline** (700, 1.5rem, lh 1.25, tracking -0.02em): Judul section
  (landing & dashboard), judul halaman.
- **Title** (600, 0.875rem, lh 1.4): Judul kartu, nama entitas (mata
  kuliah, aktivitas), tombol.
- **Body** (400, 0.875rem, lh 1.6): Teks utama, deskripsi kartu.
  Paragraf landing dibatasi ~65ch (`max-w-xl`).
- **Label** (500, 0.75rem, lh 1.4): Keterangan kecil, timestamp, chip,
  teks di bawah ikon.

### Named Rules
**The Geist-Only Rule.** Semua teks UI memakai Geist (atau Geist Mono).
Font baru hanya lewat keputusan eksplisit, bukan per-sections improvisasi.

## Layout

Container konten `max-w-4xl` (896px) untuk landing, `max-w-3xl` untuk
form auth, dan `max-w-2xl` untuk FAQ. Padding horizontal konsisten
`px-6` (dan `--spacing-page: 24px`). Rhythm vertikal: antar-section
`py-16` (64px), antar-kartu `gap-4`, dalam-kartu `p-4/p-5/p-6` dengan
jarak antar elemen `mt-2`/`mt-3`.

Breakpoint: `sm` 640px (grid 2-3 kolom, nav anchor muncul), `lg` 1024px
(sidebar desktop muncul, mobile nav hilang). App shell: sidebar kiri
tetap 256px (`w-64`) di ≥lg, bottom nav tetap di <lg. Halaman dashboard
satu kolom di mobile, grid multi-kolom di layar besar.

Density: form input tinggi 40px, kontrol aksi 44px minimum; daftar
menggunakan `divide-y divide-border` tanpa kartu per-item.

## Elevation & Depth

**The Flat-By-Default Rule.** Sistem ini flat: tanpa `box-shadow` pada
kartu, input, atau nav. Kedalaman hanya dari dua mekanisme: (1) tonal
layering — surface (#fff) di atas canvas (#fafafa), dan (2) garis —
`border-border` pada kartu/input, `divide-border` antar item daftar.
Sticky header landing memakai `bg-canvas/90 + backdrop-blur` sebagai
satu-satunya pengecualian material (transparansi + blur, bukan shadow).

Tidak ada shadow vocabulary. Hover ditandai oleh perubahan warna (border
menjadi `border-primary/60` pada kartu progress, `hover:bg-canvas` pada
tombol sekunder), bukan oleh bayangan atau lift.

## Shapes

Tangga radius peran, konsisten di seluruh produk:

- **4px (input)** — kontrol masukan: input teks, textarea, rich text
  editor, tombol primary, toolbar button, picker.
- **8px (control)** — kontrol besar: tombol sekunder/danger, nav item,
  chip/badge, file picker button, avatar wrapper.
- **12px (card)** — wadah konten: kartu aktivitas/mata kuliah/dashboard,
  landing cards, modal surface.

**The Radius Ladder Rule.** Radius mengikuti peran elemen, bukan mode.
Kartu selalu 12px, input selalu 4px — radius yang sama di tempat berbeda
adalah bug visual, bukan variasi. Chip berbentuk pill (`rounded-full`)
hanya untuk indikator titik dan progress track.

## Components

Semua komponen: latar flat, border 1px `border-border` (kecuali dinyatakan),
focus ring kuning `ring-focus` pada `focus-visible`, target minimal 44px
untuk aksi sentuh.

### Buttons
- **Shape:** primary radius 4px; secondary/danger radius 8px.
- **Primary:** `bg-primary text-ink font-semibold` (kuning Beacon Light,
  tinta pekat), padding `px-4 py-2.5`, min-height 44px.
  Hover: `bg-primary/90`. Disabled: `opacity-60` + `cursor-not-allowed`.
- **Secondary:** `border border-border bg-surface font-medium`,
  min-height 44px. Hover: `bg-canvas`.
- **Danger:** `border border-danger bg-surface text-danger font-semibold`.
  Tint konteks: `bg-danger/10 border-danger/40` untuk alert box.
- **Ghost/toolbar:** `text-muted hover:text-ink`, min 44×44px; state
  aktif `bg-primary/20 text-ink`.

### Chips
- **Style:** radius 8px, padding `px-2 py-0.5`, teks 12px `font-medium`,
  `text-ink` di atas tint: `bg-success/20` (aktif/selesai),
  `bg-danger/10` (overdue), `bg-primary/10 border border-primary/40`
  (notice), `bg-primary/15` (ikon box).
- **State:** status selalu disertai teks, tidak hanya warna.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `bg-surface`; kartu di atas section `bg-surface`
  memakai `bg-canvas` untuk variasi tonal (pain cards landing).
- **Shadow Strategy:** none — flat (lihat Elevation).
- **Border:** 1px `border-border`; empty state pakai
  `border-dashed border-border`.
- **Internal Padding:** `p-4` (kartu list/dense) sampai `p-6` (summary).

### Inputs / Fields
- **Style:** `bg-canvas border border-border`, radius 4px, tinggi 40px,
  padding `px-3 py-2`, teks 14px.
- **Focus:** `focus-visible:ring-2 ring-focus` (kuning 50%); rich text
  editor memakai `focus-within`.
- **Error / Disabled:** pesan error `bg-danger/10 border-danger/40`
  dengan `role="alert"`; disabled `opacity-60`.

### Navigation
- **Desktop (≥lg):** sidebar kiri tetap 256px, `border-r border-border
  bg-surface`; logo dengan titik Beacon Light (`size-2.5 rounded-full
  bg-primary`); item nav `rounded-control px-3 py-2 text-sm`, default
  `text-muted hover:bg-canvas hover:text-ink`, aktif
  `bg-primary/20 text-ink`; footer user dengan avatar `bg-primary/20`.
- **Mobile (<lg):** bottom nav tetap, `border-t border-border
  bg-surface`; ikon + label kecil; 44px per item.

### Signature Component — Progress Bar
Track `h-2 rounded-full bg-canvas`, fill `bg-primary` dengan `width`
proporsional. Muncul di dashboard (progress mata kuliah) dan mock hero
landing. Satu-satunya elemen yang "terisi" kuning — metafora beacon yang
menuju pemenuhan.

## Do's and Don'ts

### Do:
- **Do** gunakan Beacon Light untuk satu hal penting per layar: tombol
  utama, titik aktif, progress fill.
- **Do** bangun kedalaman dari surface-vs-canvas + border; sistem ini
  tidak pernah memakai shadow.
- **Do** ikuti tangga radius peran: 4 input, 8 control, 12 card.
- **Do** beri setiap elemen interaktif `focus-visible` ring kuning.
- **Do** jaga target sentuh ≥44px pada kontrol mobile.
- **Do** sampaikan status dengan teks, bukan warna saja.

### Don't:
- **Don't** gunakan gradien, glow, atau bayangan besar — itu look
  template SaaS yang ditolak.
- **Don't** menambah font keluarga baru (The Geist-Only Rule).
- **Don't** memakai kuning untuk dekorasi pasif (The Signal Rule).
- **Don't** memakai radius 12px untuk input atau 4px untuk kartu
  (The Radius Ladder Rule).
- **Don't** menyalin template AI look: cream+serif, dark+acid, atau
  broadsheet.
