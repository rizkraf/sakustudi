import { fireEvent, render, screen } from "@testing-library/react";

import { describe, expect, it } from "vitest";

import { CoursePicker } from "~/components/catalog/CoursePicker";
import { OnboardingChecklist } from "~/components/onboarding/OnboardingChecklist";
import { customCourseSchema } from "~/modules/catalog/catalog.service";
import { normalizeSearchTerm } from "~/modules/catalog/catalog.repository";
import {
  onboardingCoursesSchema,
  onboardingProgramSchema,
} from "~/modules/onboarding/onboarding.schema";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("onboarding step validation", () => {
  describe("onboardingProgramSchema", () => {
    it("accepts a study program id", () => {
      expect(onboardingProgramSchema.parse({ programId: UUID }).programId).toBe(
        UUID,
      );
    });

    it("accepts the skip sentinel", () => {
      expect(onboardingProgramSchema.parse({ programId: "skip" }).programId).toBe(
        "skip",
      );
    });

    it("rejects an empty program selection", () => {
      expect(() => onboardingProgramSchema.parse({ programId: "" })).toThrow();
    });
  });

  describe("onboardingCoursesSchema", () => {
    it("accepts a single course id as an array", () => {
      const parsed = onboardingCoursesSchema.parse({ courseIds: UUID });
      expect(parsed.courseIds).toEqual([UUID]);
    });

    it("accepts multiple course ids", () => {
      const parsed = onboardingCoursesSchema.parse({
        courseIds: [UUID, "4c8b1a76-8c1c-4f2e-bf0e-4f6f3f6f3f6f"],
      });
      expect(parsed.courseIds).toHaveLength(2);
    });

    it("accepts no course ids", () => {
      expect(onboardingCoursesSchema.parse({}).courseIds).toEqual([]);
      expect(
        onboardingCoursesSchema.parse({ courseIds: "" }).courseIds,
      ).toEqual([]);
    });

    it("rejects a malformed course id", () => {
      expect(() => onboardingCoursesSchema.parse({ courseIds: "not-a-uuid" }))
        .toThrow();
    });

    it("treats empty custom course fields as absent", () => {
      const parsed = onboardingCoursesSchema.parse({
        customName: "   ",
        customCode: "",
      });
      expect(parsed.customName).toBeUndefined();
      expect(parsed.customCode).toBeUndefined();
    });

    it("keeps a custom course name", () => {
      const parsed = onboardingCoursesSchema.parse({ customName: "Skripsi" });
      expect(parsed.customName).toBe("Skripsi");
    });
  });

  describe("customCourseSchema", () => {
    it("requires a non-empty name", () => {
      const result = customCourseSchema.safeParse({ name: "   " });
      expect(result.success).toBe(false);
    });

    it("caps the name length", () => {
      const result = customCourseSchema.safeParse({
        name: "x".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("caps the code length", () => {
      const result = customCourseSchema.safeParse({
        name: "Valid",
        code: "x".repeat(21),
      });
      expect(result.success).toBe(false);
    });

    it("accepts a missing or empty code", () => {
      expect(customCourseSchema.parse({ name: "Valid" }).code).toBeUndefined();
      expect(customCourseSchema.parse({ name: "Valid", code: "" }).code).toBe("");
    });
  });

  describe("search normalization", () => {
    it("trims, lowercases, and collapses whitespace", () => {
      expect(
        normalizeSearchTerm("  ALGORITMA   dan  PEMROGRAMAN "),
      ).toBe("algoritma dan pemrograman");
    });

    it("escapes LIKE wildcards so they match literally", () => {
      expect(normalizeSearchTerm("100%_done")).toBe("100\\%\\_done");
    });
  });
});

describe("OnboardingChecklist", () => {
  it("shows all three steps with completion marks", () => {
    render(
      <OnboardingChecklist
        programDone
        termDone
        coursesDone={false}
        activeStep={3}
        courseCount={0}
      />,
    );

    const list = screen.getByRole("list");
    const items = screen.getAllByRole("listitem");
    expect(list).toBeInTheDocument();
    expect(items).toHaveLength(3);
    expect(screen.getByText("Choose a study program")).toBeInTheDocument();
    expect(screen.getByText("Set up your active term")).toBeInTheDocument();
    expect(screen.getByText("Add your courses")).toBeInTheDocument();
  });

  it("highlights the active step and calls out the first course", () => {
    render(
      <OnboardingChecklist
        programDone
        termDone
        coursesDone={false}
        activeStep={3}
        courseCount={0}
      />,
    );

    expect(
      screen.getByText("Add your first course to see your study plan take shape."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { current: "step" }),
    ).toHaveTextContent("Add your courses");
  });

  it("shows the course count once courses are done", () => {
    render(
      <OnboardingChecklist
        programDone
        termDone
        coursesDone
        activeStep={3}
        courseCount={4}
      />,
    );
    expect(screen.getByText("4 courses")).toBeInTheDocument();
  });
});

describe("CoursePicker", () => {
  const courses = [
    {
      id: UUID,
      code: "SISI4101",
      name: "Konsep Sistem Informasi",
      description: "Pengantar konsep sistem informasi",
      credits: 3,
      studyProgramId: "prog-1",
      studyProgramCode: "SI",
      studyProgramName: "Sistem Informasi",
    },
    {
      id: "4c8b1a76-8c1c-4f2e-bf0e-4f6f3f6f3f6f",
      code: "KOMI4101",
      name: "Algoritma dan Pemrograman",
      description: "Dasar algoritma dan pemrograman",
      credits: 3,
      studyProgramId: "prog-2",
      studyProgramCode: "TI",
      studyProgramName: "Teknik Informatika",
    },
  ];

  it("renders courses with code and credits", () => {
    render(<CoursePicker courses={courses} name="courseIds" label="Courses" />);
    expect(screen.getByText("Konsep Sistem Informasi")).toBeInTheDocument();
    expect(screen.getByText("SISI4101")).toBeInTheDocument();
    expect(screen.getAllByText(/3 credits/).length).toBeGreaterThan(0);
  });

  it("filters the list as the user types", async () => {
    render(<CoursePicker courses={courses} name="courseIds" label="Courses" />);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "algoritma" } });
    expect(
      screen.getByText("Algoritma dan Pemrograman"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Konsep Sistem Informasi"),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    render(
      <CoursePicker
        courses={courses}
        name="courseIds"
        label="Courses"
        emptyMessage="No courses found."
      />,
    );
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No courses found.")).toBeInTheDocument();
  });

  it("submits checked courses under the given name", async () => {
    render(<CoursePicker courses={courses} name="courseIds" label="Courses" />);
    fireEvent.click(screen.getByLabelText(/Konsep Sistem Informasi/));

    const checked = screen
      .getAllByRole("checkbox")
      .filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect((checked[0] as HTMLInputElement).name).toBe("courseIds");
    expect((checked[0] as HTMLInputElement).value).toBe(UUID);
  });
});
