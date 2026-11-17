import { requireUser } from "@/lib/auth/session";
import { getAliases } from "@/lib/data";
import { getProgress } from "@/lib/ingest/pipeline";
import { aiConfigured } from "@/lib/ingest/llm-extract";
import { SyncPanel } from "@/components/SyncPanel";
import { addAlias, removeAlias, reprocess, saveSettings } from "../actions";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await searchParams;
  const [progress, aliases] = await Promise.all([getProgress(user.id), getAliases(user.id)]);
  const connected = !!user.googleRefreshToken;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      {sp.welcome && (
        <div className="card border-accent/40 p-4 text-sm">
          <strong className="text-accent">Welcome!</strong> First, check the names below that appear on your tickets, then start the Gmail import.
          It reads flight emails back to 2016 and can take a few minutes. You can leave this page and come back.
        </div>
      )}

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Gmail import</h2>
          <p className="text-sm text-muted">
            Contrail searches your Gmail for booking, check-in, boarding-pass and cancellation emails, then reads the flights out of them.
            Email bodies are never stored.{!aiConfigured() && " AI extraction is not configured (AI_GATEWAY_API_KEY), so only emails with built-in flight markup will be read."}
          </p>
        </div>
        <SyncPanel initial={progress} connected={connected} />
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <form action={reprocess.bind(null, "errors")}><button className="btn" disabled={!progress.errors}>Retry {progress.errors} errors</button></form>
          <form action={reprocess.bind(null, "all")}><button className="btn">Read all emails again</button></form>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-semibold">Your names on tickets</h2>
          <p className="text-sm text-muted">Flights where none of these names is a passenger are treated as booked for someone else. Order and titles (MR, MS) are ignored. Changes re-sort your existing flights straight away. A one-word name such as a first name matches any ticket containing it, so avoid adding a surname alone if relatives share it.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center gap-1 rounded-full bg-panel-2 py-1 pl-3 pr-1 text-sm">
              {a.name}
              <form action={removeAlias.bind(null, a.id)}><button className="rounded-full px-2 text-muted hover:text-danger" aria-label={`Remove ${a.name}`}>×</button></form>
            </li>
          ))}
          {aliases.length === 0 && <li className="text-sm text-muted">No names yet, so every flight counts as yours.</li>}
        </ul>
        <form action={addAlias} className="flex gap-2">
          <input name="name" placeholder="e.g. KUMAR/RAVI MR" className="input max-w-xs" aria-label="Name on ticket" />
          <button className="btn">Add</button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Preferences</h2>
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs text-muted">
            Distance units
            <select name="units" defaultValue={user.units} className="input mt-1 text-sm">
              <option value="km">Kilometres</option>
              <option value="mi">Miles</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Home airport
            <input name="homeAirport" defaultValue={user.homeAirport ?? ""} maxLength={3} placeholder="BLR" className="input mt-1 text-sm uppercase" />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="includeOthers" defaultChecked={user.includeOthers} />
            Count flights booked for others in Passport
          </label>
          <div className="sm:col-span-3"><button className="btn btn-primary">Save</button></div>
        </form>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Your data</h2>
          <p className="text-sm text-muted">Download every flight.</p>
        </div>
        <div className="flex gap-2">
          <a className="btn" href="/api/export?format=csv">Export CSV</a>
          <a className="btn" href="/api/export?format=json">Export JSON</a>
          <form action="/api/auth/logout" method="post"><button className="btn btn-danger">Sign out</button></form>
        </div>
      </section>
    </div>
  );
}
