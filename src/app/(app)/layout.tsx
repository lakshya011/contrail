import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { reviewFlights } from "@/lib/data";
import { BottomNav, TopNav } from "@/components/AppNav";
import { LogoSvg } from "@/components/Logo";
import { ThemeToggle, type ThemeChoice } from "@/components/ThemeToggle";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { NavTracker } from "@/components/NavTracker";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const reviewCount = (await reviewFlights(user.id)).length;
  const saved = (await cookies()).get("theme")?.value;
  const theme: ThemeChoice = saved === "light" || saved === "dark" ? saved : "system";
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <LogoSvg className="h-7 w-7" />
            <span className="font-serif text-lg tracking-tight">Contrail</span>
          </Link>
          <TopNav reviewCount={reviewCount} />
          <div className="flex items-center gap-2 text-xs text-muted">
            <ThemeToggle initial={theme} />
            {user.image ? <img src={user.image} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" /> : null}
            <span className="hidden md:inline">{user.email}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:pb-12">{children}</main>
      <BottomNav reviewCount={reviewCount} />
      <Suspense fallback={null}>
        <NavTracker />
      </Suspense>
    </>
  );
}
