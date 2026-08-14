/**
 * Onboarding progress checklist. Shows the three steps with completion
 * marks and calls out the first-value action (adding a first course) so a
 * new user sees the payoff of the session.
 */
export function OnboardingChecklist({
  programDone,
  termDone,
  coursesDone,
  activeStep,
  courseCount,
}: {
  programDone: boolean;
  termDone: boolean;
  coursesDone: boolean;
  activeStep: number;
  courseCount: number;
}) {
  const steps = [
    {
      label: "Choose a study program",
      done: programDone,
      step: 1,
    },
    {
      label: "Set up your active term",
      done: termDone,
      step: 2,
    },
    {
      label: "Add your courses",
      done: coursesDone,
      step: 3,
    },
  ];

  return (
    <section aria-label="Onboarding progress" className="space-y-2">
      <ol className="space-y-2">
        {steps.map((item) => (
          <li
            key={item.step}
            aria-current={item.step === activeStep ? "step" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-input border px-3 text-sm ${
              item.done
                ? "border-success/40 bg-success/10 text-ink"
                : item.step === activeStep
                  ? "border-border bg-surface text-ink"
                  : "border-border bg-canvas text-muted"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                item.done
                  ? "bg-success text-ink"
                  : item.step === activeStep
                    ? "bg-primary text-ink"
                    : "bg-canvas text-muted"
              }`}
            >
              {item.done ? "✓" : item.step}
            </span>
            <span>{item.label}</span>
            {item.step === 3 && coursesDone && (
              <span className="ml-auto text-xs text-muted">
                {courseCount} {courseCount === 1 ? "course" : "courses"}
              </span>
            )}
          </li>
        ))}
      </ol>
      {activeStep === 3 && !coursesDone && (
        <p className="rounded-input border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-ink">
          Add your first course to see your study plan take shape.
        </p>
      )}
    </section>
  );
}
