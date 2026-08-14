import type { ReactNode } from "react";

import { DesktopNav, type UserSummary } from "./DesktopNav";
import { MobileNav } from "./MobileNav";

export function AppShell({
  children,
  user,
  activeRoute,
}: {
  children: ReactNode;
  user?: UserSummary | null;
  activeRoute: string;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <DesktopNav user={user} activeRoute={activeRoute} />
      <div className="lg:pl-64">
        <main className="mx-auto max-w-5xl px-page pb-24 pt-6 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>
      <MobileNav activeRoute={activeRoute} />
    </div>
  );
}
