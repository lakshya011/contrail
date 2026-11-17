"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncProgress } from "@/lib/ingest/pipeline";

export function SyncPanel({ initial, connected }: { initial: SyncProgress; connected: boolean }) {
  const [p, setP] = useState(initial);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stop = useRef(false);
  const router = useRouter();

  const run = useCallback(async () => {
    setRunning(true);
    setErr(null);
    stop.current = false;
    try {
      for (let i = 0; i < 500 && !stop.current; i++) {
        const res = await fetch("/api/sync/run", { method: "POST" });
        if (!res.ok) throw new Error(`Sync failed (${res.status})`);
        const next = (await res.json()) as SyncProgress;
        setP(next);
        router.refresh();
        if (next.done || next.lastError) {
          if (next.lastError) setErr(next.lastError);
          break;
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [router]);

  const processed = p.total - p.pending;
  const pct = p.total ? Math.round((processed / p.total) * 100) : 0;
  const stats: [string, number][] = [
    ["Emails found", p.total], ["Read", processed], ["With flights", p.extracted],
    ["Skipped", p.ignored + p.noFlights], ["Errors", p.errors], ["Flights", p.flights],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!connected || running} onClick={run}>
          {running ? "Syncing…" : p.total ? "Sync now" : "Start Gmail import"}
        </button>
        {running && <button className="btn" onClick={() => (stop.current = true)}>Pause</button>}
        <span className="text-sm text-muted">
          {!connected ? "Gmail is not connected." : !p.backfillListed ? "Searching your Gmail back to 2016…" : p.done ? "Up to date." : `${p.pending} emails left to read`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent transition-all" style={{ width: `${p.backfillListed ? pct : Math.min(pct, 10)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-panel-2 p-3">
            <div className="text-lg font-semibold tabular">{v.toLocaleString()}</div>
            <div className="text-[11px] text-muted">{k}</div>
          </div>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
