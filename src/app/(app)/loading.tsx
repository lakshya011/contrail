/** Shown the instant you switch tabs, while the page loads: faded boarding-pass shapes on paper. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-md bg-panel-2" />
        <div className="h-4 w-28 animate-pulse rounded bg-panel-2/70" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card grid grid-cols-[minmax(0,1fr)_88px] overflow-hidden">
            <div className="space-y-3 p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-panel-2" />
              <div className="flex items-end justify-between">
                <div className="h-9 w-16 animate-pulse rounded bg-panel-2" />
                <div className="h-px w-20 border-t border-dashed border-perf" />
                <div className="h-9 w-16 animate-pulse rounded bg-panel-2" />
              </div>
              <div className="perf-x pt-2">
                <div className="h-3 w-32 animate-pulse rounded bg-panel-2/70" />
              </div>
            </div>
            <div className="perf-y flex flex-col items-center gap-2 bg-panel-2/40 px-2 py-4">
              <div className="h-3 w-8 animate-pulse rounded bg-panel-2" />
              <div className="h-4 w-10 animate-pulse rounded bg-panel-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
