import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { LogoSvg } from "@/components/Logo";

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account is not allowed to use this app.",
  scope: "Gmail access was not granted. Tick the Gmail permission on Google's consent screen so flights can be found.",
  state: "Sign-in expired. Please try again.",
  config: "Google sign-in is not set up yet. Fill ALLOWED_EMAIL, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { error } = await searchParams;
  const demo = process.env.DEMO_MODE === "1";
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M-50 520 C 200 440, 420 260, 860 60" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 5" fill="none" />
        <path d="M-50 560 C 240 470, 460 300, 860 120" stroke="var(--accent-2)" strokeWidth="1" fill="none" opacity=".5" />
        <path d="M-50 300 C 220 260, 520 200, 860 260" stroke="var(--accent)" strokeWidth="1" fill="none" opacity=".3" />
      </svg>
      <div className="card relative w-full max-w-md p-8 text-center">
        <LogoSvg className="mx-auto h-16 w-16 -rotate-3 shadow-[0_6px_18px_-8px_rgba(22,38,63,0.6)] rounded-[22%]" />
        <h1 className="mt-4 text-4xl tracking-tight">Contrail</h1>
        <p className="mt-2 text-sm text-muted">Every flight you have taken, found in your Gmail, turned into a flight log and a Passport of your travels.</p>
        {typeof error === "string" && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{ERRORS[error] ?? "Sign-in failed."}</p>}
        <a href="/api/auth/login" className="btn btn-primary mt-6 w-full py-3">Continue with Google</a>
        <p className="mt-3 text-xs text-muted">Read-only Gmail access. Email bodies are never stored.</p>
        {demo && <a href="/api/auth/demo" className="btn mt-4 w-full">Preview with sample data</a>}
      </div>
    </main>
  );
}
