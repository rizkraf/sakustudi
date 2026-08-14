import { data, redirect, Form, useActionData } from "react-router";

import { CoursePicker } from "~/components/catalog/CoursePicker";
import { OnboardingChecklist } from "~/components/onboarding/OnboardingChecklist";
import { csrfTokenContext, sessionUserContext } from "~/context";
import {
  onboardingCoursesSchema,
  onboardingProgramSchema,
  onboardingTermSchema,
  SKIP_PROGRAM_VALUE,
} from "~/modules/onboarding/onboarding.schema";
import { requireConsentsMiddleware, requireUserMiddleware } from "~/lib/auth/session";
import { isFieldErrorResponse, type FieldErrorResponse } from "~/lib/errors/response";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { parseForm } from "~/lib/validation/form-data";
import {
  createCourseFromCatalog,
  createCustomCourse,
  listCatalogCourses,
} from "~/modules/catalog/catalog.service";
import { listActiveStudyPrograms } from "~/modules/catalog/catalog.repository";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import {
  findActiveTerm,
  findOwnedTerm,
  type AcademicTermRow,
} from "~/modules/academic-terms/terms.repository";
import {
  completeOnboarding,
  getOnboardingStatus,
} from "~/modules/onboarding/onboarding.service";

import type { Route } from "./+types/onboarding";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function fieldErrorsFor(
  actionData: ActionData,
  field: string,
): string[] | undefined {
  return actionData?.fieldErrors[field];
}

export const meta: Route.MetaFunction = () => [
  { title: "Set up your workspace | SakuStudi" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const status = await getOnboardingStatus(user.id);
  if (status.completed) throw redirect("/dashboard");

  const url = new URL(request.url);
  const programs = await listActiveStudyPrograms(user.id);

  let step = Math.min(Math.max(Number(url.searchParams.get("step") ?? "1") || 1, 1), 3);
  let programId = url.searchParams.get("programId") ?? undefined;
  let termId = url.searchParams.get("termId") ?? undefined;

  const programIsValid =
    programId !== undefined &&
    (programId === SKIP_PROGRAM_VALUE || programs.some((p) => p.id === programId));

  if (!programIsValid) {
    programId = undefined;
    termId = undefined;
    step = 1;
  }
  if (step >= 2 && programId === undefined) {
    step = 1;
  }

  const activeTerm =
    termId !== undefined ? await findOwnedTerm(user.id, termId) : undefined;
  if (termId !== undefined && !activeTerm) {
    termId = undefined;
    if (step === 3) step = 2;
  }
  if (step === 3 && termId === undefined) {
    step = 2;
  }

  const params = new URLSearchParams();
  if (programId !== undefined) params.set("programId", programId);
  if (termId !== undefined) params.set("termId", termId);
  const canonical = params.size === 0 ? "/onboarding" : `/onboarding?${params}`;
  const currentStep = url.searchParams.get("step") ?? "1";
  const currentProgramId = url.searchParams.get("programId") ?? undefined;
  const currentTermId = url.searchParams.get("termId") ?? undefined;
  if (
    String(step) !== currentStep ||
    programId !== currentProgramId ||
    termId !== currentTermId
  ) {
    throw redirect(canonical);
  }

  const now = new Date();
  const catalogCourses =
    step === 3
      ? await listCatalogCourses(user.id, {
          programId: programId === SKIP_PROGRAM_VALUE ? undefined : programId,
        })
      : [];

  return {
    step,
    programId,
    termId,
    programs,
    activeTerm,
    catalogCourses,
    csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
    defaults: {
      termName: "Semester 1",
      startDate: toDateInputValue(now),
      endDate: toDateInputValue(addMonths(now, 6)),
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const status = await getOnboardingStatus(user.id);
  if (status.completed) throw redirect("/dashboard");

  await assertCsrfMutation(request, user.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "program") {
    const parsed = parseForm(onboardingProgramSchema, formData);
    if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });

    const programId = parsed.programId;
    if (programId !== SKIP_PROGRAM_VALUE) {
      const programs = await listActiveStudyPrograms(user.id);
      if (!programs.some((p) => p.id === programId)) {
        return data<FieldErrorResponse>(
          {
            ok: false,
            fieldErrors: { programId: ["Choose a valid study program."] },
            formErrors: [],
          },
          { status: 400 },
        );
      }
    }
    throw redirect(`/onboarding?step=2&programId=${encodeURIComponent(programId)}`);
  }

  if (intent === "term") {
    const parsed = parseForm(onboardingTermSchema, formData);
    if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });

    const programId = String(formData.get("programId") ?? "");

    let term: AcademicTermRow;
    const existing = await findActiveTerm(user.id);
    if (existing) {
      term = existing;
    } else {
      try {
        term = await createAcademicTerm(user.id, parsed);
      } catch (error) {
        const resumed = await findActiveTerm(user.id);
        if (!resumed) throw error;
        term = resumed;
      }
    }

    const params = new URLSearchParams();
    if (programId !== "") params.set("programId", programId);
    params.set("termId", term.id);
    throw redirect(`/onboarding?step=3&${params}`);
  }

  if (intent === "courses") {
    const parsed = parseForm(onboardingCoursesSchema, formData);
    if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });

    const termId = String(formData.get("termId") ?? "");
    const term = await findOwnedTerm(user.id, termId);
    if (!term) {
      return data<FieldErrorResponse>(
        {
          ok: false,
          fieldErrors: {},
          formErrors: ["Your term was not found. Please start again."],
        },
        { status: 400 },
      );
    }

    for (const catalogCourseId of parsed.courseIds) {
      await createCourseFromCatalog(user.id, term.id, catalogCourseId);
    }
    if (parsed.customName !== undefined) {
      await createCustomCourse(user.id, term.id, {
        name: parsed.customName,
        code: parsed.customCode,
      });
    }

    await completeOnboarding(user.id);
    throw redirect("/dashboard");
  }

  return data<FieldErrorResponse>(
    { ok: false, fieldErrors: {}, formErrors: ["Unknown onboarding step."] },
    { status: 400 },
  );
}

function FieldError({
  field,
  actionData,
}: {
  field: string;
  actionData: ActionData;
}) {
  const errors = fieldErrorsFor(actionData, field);
  if (!errors || errors.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export default function Onboarding({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { step, programId, termId, programs, activeTerm, catalogCourses, csrfToken, defaults } =
    loaderData;
  const formError =
    actionData && actionData.formErrors.length > 0
      ? actionData.formErrors[0]
      : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page py-10 text-ink">
      <div className="w-full max-w-2xl rounded-card border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold">Welcome to SakuStudi</h1>
        <p className="mt-1 text-sm text-muted">
          Set up your study workspace in three steps.
        </p>

        <div className="mt-6">
          <OnboardingChecklist
            programDone={step >= 2}
            termDone={step >= 3}
            coursesDone={false}
            activeStep={step}
            courseCount={0}
          />
        </div>

        {formError && (
          <p
            role="alert"
            className="mt-4 rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
          >
            {formError}
          </p>
        )}

        <div className="mt-6">
          {step === 1 && (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="program" />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Study program</legend>
                {programs.map((program) => (
                  <label
                    key={program.id}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-input border border-border bg-canvas px-3 py-2 focus-within:ring-2 focus-within:ring-focus"
                  >
                    <input
                      type="radio"
                      name="programId"
                      value={program.id}
                      required
                      className="mt-1 size-4"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-ink">{program.name}</span>{" "}
                      <span className="text-xs text-muted">({program.code})</span>
                      {program.description && (
                        <span className="mt-0.5 block text-xs text-muted">
                          {program.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-input border border-border bg-canvas px-3 py-2 focus-within:ring-2 focus-within:ring-focus">
                  <input
                    type="radio"
                    name="programId"
                    value={SKIP_PROGRAM_VALUE}
                    required
                    className="mt-1 size-4"
                  />
                  <span className="text-sm text-ink">
                    I&apos;ll fill in my courses myself
                  </span>
                </label>
              </fieldset>
              <FieldError field="programId" actionData={actionData} />
              <button
                type="submit"
                className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Continue
              </button>
            </Form>
          )}

          {step === 2 && (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="term" />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="programId" value={programId ?? ""} />
              <label className="block">
                <span className="text-sm font-medium">Term name</span>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={defaults.termName}
                  aria-invalid={fieldErrorsFor(actionData, "name") ? true : undefined}
                  className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                />
                <FieldError field="name" actionData={actionData} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium">Start date</span>
                  <input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={defaults.startDate}
                    aria-invalid={fieldErrorsFor(actionData, "startDate") ? true : undefined}
                    className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                  <FieldError field="startDate" actionData={actionData} />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">End date</span>
                  <input
                    name="endDate"
                    type="date"
                    required
                    defaultValue={defaults.endDate}
                    aria-invalid={fieldErrorsFor(actionData, "endDate") ? true : undefined}
                    className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                  <FieldError field="endDate" actionData={actionData} />
                </label>
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Continue
              </button>
            </Form>
          )}

          {step === 3 && (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="courses" />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="programId" value={programId ?? ""} />
              <input type="hidden" name="termId" value={termId ?? ""} />
              {activeTerm && (
                <p className="rounded-input border border-border bg-canvas px-3 py-2 text-sm text-muted">
                  Active term:{" "}
                  <span className="font-medium text-ink">{activeTerm.name}</span>{" "}
                  ({toDateInputValue(activeTerm.startDate)} –{" "}
                  {toDateInputValue(activeTerm.endDate)})
                </p>
              )}
              <CoursePicker
                courses={catalogCourses}
                name="courseIds"
                label="Add courses to this term"
                emptyMessage="No catalog courses found for this program."
              />
              <FieldError field="courseIds" actionData={actionData} />
              <div className="rounded-input border border-dashed border-border p-4">
                <p className="text-sm font-medium">Add a custom course</p>
                <div className="mt-3 grid gap-3">
                  <label className="block">
                    <span className="text-sm font-medium">Course name</span>
                    <input
                      name="customName"
                      type="text"
                      aria-invalid={fieldErrorsFor(actionData, "customName") ? true : undefined}
                      className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    <FieldError field="customName" actionData={actionData} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Course code</span>
                    <input
                      name="customCode"
                      type="text"
                      aria-invalid={fieldErrorsFor(actionData, "customCode") ? true : undefined}
                      className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    />
                    <FieldError field="customCode" actionData={actionData} />
                  </label>
                </div>
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Finish setup
              </button>
            </Form>
          )}
        </div>
      </div>
    </main>
  );
}
