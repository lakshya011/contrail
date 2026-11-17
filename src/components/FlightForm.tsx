"use client";

import { useActionState } from "react";

type Defaults = Partial<Record<"flightNumber" | "depIata" | "arrIata" | "depDate" | "depTime" | "arrDate" | "arrTime" | "seat" | "cabin" | "pnr" | "aircraftType", string | null>> & {
  forOthers?: boolean;
  cancelled?: boolean;
};
type Result = { error?: string; ok?: boolean };

export function FlightForm({
  action, defaults = {}, submitLabel,
}: { action: (prev: Result, fd: FormData) => Promise<Result>; defaults?: Defaults; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const f = (name: keyof Defaults, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-xs text-muted">
      {label}
      <input name={name} defaultValue={(defaults[name] as string | null) ?? ""} className="input mt-1 text-sm" {...props} />
    </label>
  );
  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {f("flightNumber", "Flight number", { required: true, placeholder: "6E 2131" })}
      {f("depIata", "From (IATA)", { required: true, maxLength: 3, placeholder: "DEL", className: "input mt-1 text-sm uppercase" })}
      {f("arrIata", "To (IATA)", { required: true, maxLength: 3, placeholder: "BOM", className: "input mt-1 text-sm uppercase" })}
      {f("pnr", "PNR")}
      {f("depDate", "Departure date", { type: "date", required: true })}
      {f("depTime", "Departure time", { type: "time" })}
      {f("arrDate", "Arrival date", { type: "date" })}
      {f("arrTime", "Arrival time", { type: "time" })}
      {f("seat", "Seat", { placeholder: "12A" })}
      <label className="text-xs text-muted">
        Cabin
        <select name="cabin" defaultValue={defaults.cabin ?? ""} className="input mt-1 text-sm">
          <option value="">—</option>
          <option value="economy">Economy</option>
          <option value="premium_economy">Premium Economy</option>
          <option value="business">Business</option>
          <option value="first">First</option>
        </select>
      </label>
      {f("aircraftType", "Aircraft", { placeholder: "Airbus A320neo" })}
      <div className="flex flex-col justify-end gap-1 text-xs text-muted">
        <label className="flex items-center gap-2"><input type="checkbox" name="cancelled" defaultChecked={defaults.cancelled} /> Cancelled</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="forOthers" defaultChecked={defaults.forOthers} /> Booked for someone else</label>
      </div>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.ok && <span className="text-sm text-ok">Saved</span>}
      </div>
    </form>
  );
}
