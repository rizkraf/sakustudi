import type { ReactNode } from "react";
import { Link } from "react-router";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export interface UserSummary {
  name?: string;
  email?: string;
}

const iconProps = {
  "aria-hidden": true,
  className: "size-5 shrink-0",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
};

function DashboardIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v14c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-14c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5v14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M9 8.5h6" />
      <path d="M9 12.5h6" />
      <path d="M9 16.5h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="M5.3 5.3l2.1 2.1" />
      <path d="M16.6 16.6l2.1 2.1" />
      <path d="M18.7 5.3l-2.1 2.1" />
      <path d="M7.4 16.6l-2.1 2.1" />
    </svg>
  );
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/academic-terms", label: "Academic Terms", icon: <BookIcon /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { to: "/notes", label: "Notes", icon: <NotesIcon /> },
  { to: "/settings/profile", label: "Settings", icon: <SettingsIcon /> },
];

function navLinkClass(active: boolean) {
  return [
    "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium",
    active ? "bg-primary/20 text-ink" : "text-muted hover:bg-canvas hover:text-ink",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  ].join(" ");
}

function initialOf(user: UserSummary) {
  const source = user.name ?? user.email ?? "?";
  return source.trim().charAt(0).toUpperCase();
}

export function DesktopNav({
  user,
  activeRoute,
}: {
  user?: UserSummary | null;
  activeRoute: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 shrink-0 items-center gap-2 px-6">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
        <span className="text-lg font-semibold tracking-tight text-ink">Sakustudi</span>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={navLinkClass(active)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-6 py-4">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-ink"
          >
            {initialOf(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user.name ?? user.email}</p>
            {user.email && user.name && (
              <p className="truncate text-xs text-muted">{user.email}</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
