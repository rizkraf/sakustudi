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
        "Kelola semester, mata kuliah, tugas, catatan, dan deadline kamu dalam satu tempat. Mandiri, privat, dan self-hostable.",
    },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { deleted: url.searchParams.get("deleted") === "1" };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { deleted } = loaderData;
  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <p className="text-lg font-semibold tracking-tight">Sakustudi</p>
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
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        {deleted ? (
          <p
            role="status"
            className="mx-auto mb-8 max-w-md rounded-control border border-border bg-surface px-4 py-3 text-sm"
          >
            Akun kamu telah dihapus beserta seluruh datanya. Terima kasih sudah
            mencoba Sakustudi.
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Semester kamu, jelas dalam satu tempat
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">
          Sakustudi membantu mahasiswa Universitas Terbuka mengelola semester,
          mata kuliah, tugas, diskusi, catatan, dan deadline — privat,
          dapat diekspor kapan saja, dan bisa di-host sendiri.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="/register"
            className="min-h-11 rounded-control bg-primary px-6 py-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Mulai gratis
          </a>
          <a
            href="/login"
            className="min-h-11 rounded-control border border-border bg-surface px-6 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Sudah punya akun
          </a>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-3xl px-6 py-8 text-center text-xs text-muted">
        Produk pihak ketiga, tidak berafiliasi dengan Universitas Terbuka.
      </footer>
    </main>
  );
}
