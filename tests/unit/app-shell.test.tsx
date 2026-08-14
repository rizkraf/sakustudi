import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { EmptyState } from "~/components/feedback/EmptyState";
import { ErrorState } from "~/components/feedback/ErrorState";
import { LoadingState } from "~/components/feedback/LoadingState";
import { AppShell } from "~/components/layout/AppShell";
import { DesktopNav } from "~/components/layout/DesktopNav";
import { MobileNav } from "~/components/layout/MobileNav";

const NAV_LABELS = ["Dashboard", "Academic Terms", "Calendar", "Notes", "Settings"];

describe("AppShell", () => {
  it("renders every navigation label in both navs", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell activeRoute="/dashboard">Page content</AppShell>
      </MemoryRouter>,
    );

    for (const label of NAV_LABELS) {
      expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
    }
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("marks the active route with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/calendar"]}>
        <MobileNav activeRoute="/calendar" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("uses semantic theme token classes on the shell", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell activeRoute="/dashboard">Page content</AppShell>
      </MemoryRouter>,
    );

    const nav = screen.getAllByRole("navigation", { name: "Primary" })[1];
    expect(nav).toHaveClass("bg-surface", "border-border");
    const shell = screen.getByText("Page content").closest("div")?.parentElement;
    expect(shell).toHaveClass("bg-canvas");
  });

  it("shows user identity in the desktop nav", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DesktopNav activeRoute="/dashboard" user={{ name: "Rizky", email: "r@example.dev" }} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Rizky")).toBeInTheDocument();
    expect(screen.getByText("r@example.dev")).toBeInTheDocument();
  });

  it("hides user identity when no user is provided", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DesktopNav activeRoute="/dashboard" user={null} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Sakustudi")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.queryByText("r@example.dev")).not.toBeInTheDocument();
  });
});

describe("feedback primitives", () => {
  it("renders a loading state with a polite status region", () => {
    render(<LoadingState />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/loading/i);
  });

  it("renders an empty state with title, message, and action link", () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="No notes yet"
          message="Create your first note to get started."
          actionHref="/notes/new"
          actionLabel="New note"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "No notes yet" })).toBeInTheDocument();
    expect(screen.getByText("Create your first note to get started.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New note" })).toHaveAttribute(
      "href",
      "/notes/new",
    );
  });

  it("renders a safe error state with a retry link", () => {
    render(
      <MemoryRouter>
        <ErrorState
          title="Something went wrong"
          message="We could not load your data. Please try again."
          retryHref="/dashboard"
        />
      </MemoryRouter>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("We could not load your data. Please try again.");
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders an error state without a retry link when retryHref is omitted", () => {
    render(
      <MemoryRouter>
        <ErrorState title="Not found" message="This page does not exist." />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Try again" })).not.toBeInTheDocument();
  });
});
