import { Link } from "react-router";

import { NAV_ITEMS } from "./DesktopNav";

export function MobileNav({ activeRoute }: { activeRoute: string }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = activeRoute === item.to;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-ink" : "text-muted hover:text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                ].join(" ")}
              >
                {item.icon}
                <span className="sr-only">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
