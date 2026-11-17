import { requireUser } from "@/lib/auth/session";
import { reviewFlights } from "@/lib/data";
import { FlightCard } from "@/components/FlightCard";
import { FlightForm } from "@/components/FlightForm";
import { addFlight, confirmFlight, hideFlight, keepFlightCancelOthers } from "../actions";
import { displayFlightNumber } from "@/lib/ingest/types";

export default async function ReviewPage() {
  const user = await requireUser();
  const flights = await reviewFlights(user.id);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted">
          Flights the importer was unsure about, and flights you can&apos;t all have taken (usually a rebooking whose cancellation
          email never arrived). Confirm, fix or remove them.
        </p>
      </div>

      {flights.length === 0 ? (
        <div className="card p-8 text-center text-muted">Nothing to review. 🎉</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {flights.map((f) => (
            <div key={f.id} className="space-y-2">
              <FlightCard f={f} units={user.units} />
              {f.clash ? (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs text-accent">
                    {f.clash.reason}: clashes with {f.clash.withNumbers.map(displayFlightNumber).join(", ")}.
                  </span>
                  <form action={keepFlightCancelOthers.bind(null, f.id, f.clash.withIds)} className="shrink-0">
                    <button className="btn btn-primary">I took this one</button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs text-accent">{f.reviewReason}</span>
                  <div className="flex shrink-0 gap-2">
                    <form action={hideFlight.bind(null, f.id)}><button className="btn btn-danger">Remove</button></form>
                    <form action={confirmFlight.bind(null, f.id)}><button className="btn btn-primary">Looks right</button></form>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">Add a flight by hand</h2>
        <p className="mb-4 text-xs text-muted">For trips that never had an email, like tickets bought at the counter or booked by someone else.</p>
        <FlightForm action={addFlight} submitLabel="Add flight" />
      </section>
    </div>
  );
}
