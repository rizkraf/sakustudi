import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AppSchema } from "./schema";
import { courseCatalog, studyPrograms, usefulLinks } from "./schema";

export const CATALOG_SEED_VERSION = 1;

const SEED_PROGRAMS = [
  {
    code: "SI",
    name: "Sistem Informasi",
    description: "Universitas Terbuka - Program Studi Sistem Informasi",
  },
  {
    code: "TI",
    name: "Teknik Informatika",
    description: "Universitas Terbuka - Program Studi Teknik Informatika",
  },
  {
    code: "MK",
    name: "Manajemen",
    description: "Universitas Terbuka - Program Studi Manajemen",
  },
];

const SEED_USEFUL_LINKS = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    title: "Elearning UT",
    url: "https://elearning.ut.ac.id/",
    description: "LMS resmi UT untuk materi dan tugas mata kuliah",
    category: "elearning",
    position: 0,
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    title: "SIAS UT",
    url: "https://sias.ut.ac.id/",
    description: "Sistem Informasi Akademik Terpadu: KRS, KHS, wisuda",
    category: "administrasi",
    position: 1,
  },
  {
    id: "c0000000-0000-4000-8000-000000000003",
    title: "Pustaka UT",
    url: "https://pustaka.ut.ac.id/",
    description: "Perpustakaan digital UT: buku, jurnal, dan repositori",
    category: "pustaka",
    position: 2,
  },
  {
    id: "c0000000-0000-4000-8000-000000000004",
    title: "Layanan & Bantuan UT",
    url: "https://layanan.ut.ac.id/",
    description: "Pusat layanan dan bantuan mahasiswa Universitas Terbuka",
    category: "layanan",
    position: 3,
  },
];

const SEED_COURSES = [
  {
    code: "MKDU4111",
    name: "Bahasa Indonesia",
    credits: 3,
    studyProgramCode: "SI",
    description: "Mata kuliah umum Bahasa Indonesia",
  },
  {
    code: "MKDU4110",
    name: "Bahasa Inggris",
    credits: 3,
    studyProgramCode: "SI",
    description: "Mata kuliah umum Bahasa Inggris",
  },
  {
    code: "SISI4101",
    name: "Konsep Sistem Informasi",
    credits: 3,
    studyProgramCode: "SI",
    description: "Pengantar konsep sistem informasi",
  },
  {
    code: "SISI4105",
    name: "Sistem Informasi Manajemen",
    credits: 3,
    studyProgramCode: "SI",
    description: "Pemanfaatan sistem informasi dalam manajemen",
  },
  {
    code: "KOMI4101",
    name: "Algoritma dan Pemrograman",
    credits: 3,
    studyProgramCode: "TI",
    description: "Dasar algoritma dan pemrograman",
  },
  {
    code: "KOMI4201",
    name: "Struktur Data",
    credits: 3,
    studyProgramCode: "TI",
    description: "Konsep dan implementasi struktur data",
  },
  {
    code: "EKMA4111",
    name: "Pengantar Bisnis",
    credits: 3,
    studyProgramCode: "MK",
    description: "Pengantar konsep bisnis",
  },
  {
    code: "EKMA4116",
    name: "Manajemen",
    credits: 3,
    studyProgramCode: "MK",
    description: "Pengantar ilmu manajemen",
  },
];

export async function seedCatalog(
  db: NodePgDatabase<AppSchema>,
): Promise<void> {
  const sourceVersion = String(CATALOG_SEED_VERSION);

  await db
    .insert(studyPrograms)
    .values(
      SEED_PROGRAMS.map((p) => ({
        ...p,
        sourceVersion,
        isActive: true,
      })),
    )
    .onConflictDoNothing();

  const programByCode = new Map(
    (await db.select().from(studyPrograms)).map((p) => [p.code, p.id]),
  );

  const courses = SEED_COURSES.map((c) => ({
    code: c.code,
    name: c.name,
    credits: c.credits,
    description: c.description,
    sourceVersion,
    studyProgramId: programByCode.get(c.studyProgramCode) ?? null,
  }));

  await db.insert(courseCatalog).values(courses).onConflictDoNothing();

  await db
    .insert(usefulLinks)
    .values(SEED_USEFUL_LINKS.map((link) => ({ ...link, userId: null })))
    .onConflictDoNothing();
}
