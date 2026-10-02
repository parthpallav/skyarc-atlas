"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { DigitalAvailabilityPanel } from "@/components/digital-availability-panel";
import { FlightDateRangePicker, defaultFlightRange } from "@/components/flight-date-range-picker";
import { parseLiveInventory } from "@/lib/live-inventory";

type Step = "dates" | "package" | "quote" | "checkout";

export default function CampaignBuilderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locationId = searchParams.get("locationId") ?? "";
  const defaults = defaultFlightRange();
  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;

  const [step, setStep] = useState<Step>("dates");
  const [playsPerDay, setPlaysPerDay] = useState(60);
  const [creativeDurationSec, setCreativeDurationSec] = useState(10);
  const [campaignId, setCampaignId] = useState("");
  const [mediaPlanId, setMediaPlanId] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const { data: location } = useQuery({
    queryKey: ["builder-location", locationId, from, to],
    enabled: Boolean(locationId),
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocation(locationId, { from, to });
      return result.data as Record<string, unknown>;
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["builder-campaigns"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 50);
      return (result.data as { campaigns?: Array<{ id: string; name: string }> }).campaigns ?? [];
    },
  });

  const primaryFace = location?.primaryFace as { inventoryId?: string; isDigital?: boolean } | undefined;
  const inventoryId = primaryFace?.inventoryId ?? "";
  const live = parseLiveInventory(location?.liveInventory);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!inventoryId) throw new Error("No bookable inventory for this site");
      const client = createWebApiClient();
      return client.bookingQuote({
        inventoryId,
        startDate: new Date(`${from}T00:00:00.000Z`).toISOString(),
        endDate: new Date(`${to}T23:59:59.999Z`).toISOString(),
        playsPerDay,
        creativeDurationSec,
        distributionMode: "ALL_DAY",
      });
    },
  });

  const quotePreview = previewMutation.data?.data as
    | { total?: number; currency?: string; chargesJson?: unknown; feasible?: boolean }
    | undefined;

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("Select a campaign");
      if (!inventoryId) throw new Error("Missing inventory");
      const client = createWebApiClient();
      let planId = mediaPlanId;
      if (!planId) {
        const built = await client.buildMediaPlanFromSelection(campaignId, {
          inventoryIds: [inventoryId],
          holdInventory: true,
          status: "PROPOSED",
          totalBudget: 1,
          name: `Self-serve · ${locationName}`,
        });
        const body = built.data as { plan?: { id?: string }; message?: string };
        if (!body.plan?.id) {
          throw new Error(body.message || "Could not create plan from this site");
        }
        planId = body.plan.id;
        setMediaPlanId(planId);
      }
      const issued = await client.issueQuote({
        campaignId,
        mediaPlanId: planId!,
        lines: [
          {
            inventoryId,
            startDate: new Date(`${from}T00:00:00.000Z`).toISOString(),
            endDate: new Date(`${to}T23:59:59.999Z`).toISOString(),
            playsPerDay,
            creativeDurationSec,
            distributionMode: "ALL_DAY",
          },
        ],
      });
      return issued.data as { id: string };
    },
    onSuccess: (data) => {
      setQuoteId(data.id);
      setStep("checkout");
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("Issue a quote first");
      const client = createWebApiClient();
      const key = `builder_${quoteId}_${Date.now()}`;
      const accepted = await client.acceptQuote(quoteId, {
        mode: "hold",
        requireVendorApproval: true,
        idempotencyKey: key,
      });
      const booking = (accepted.data as { booking?: { id: string } }).booking;
      if (booking?.id) setBookingId(booking.id);
      return accepted.data;
    },
    onSuccess: () => setMessage("Reservation created. Complete sandbox payment below."),
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("No quote");
      const client = createWebApiClient();
      const idempotencyKey = `pay_${quoteId}`;
      const intent = await client.createPaymentIntent({
        quoteRevisionId: quoteId,
        idempotencyKey,
      });
      const data = intent.data as {
        paymentIntentId: string;
        testCaptureToken?: string;
        provider: string;
      };
      if (data.provider === "test") {
        await client.captureTestPayment(data.paymentIntentId);
      }
      return data;
    },
    onSuccess: () => {
      setMessage("Sandbox payment captured. Track status on your booking page.");
      if (bookingId) router.push(`/bookings/${bookingId}`);
    },
  });

  const steps: Step[] = ["dates", "package", "quote", "checkout"];
  const stepIndex = steps.indexOf(step);

  const locationName = String(location?.name ?? "Selected site");

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <Link href={locationId ? `/locations/${locationId}?from=${from}&to=${to}` : "/locations"} className="text-sm text-muted hover:text-slate-900">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Configure campaign</h1>
        <p className="text-sm text-muted">
          Choose dates, plays, and review an itemized quote. Plays are spread across operating hours — not a fixed clock time.
        </p>
      </div>

      <ol className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {steps.map((s, i) => (
          <li key={s} className={i <= stepIndex ? "text-primary" : ""}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {locationId && location ? (
        <DigitalAvailabilityPanel
          live={live}
          flightFrom={from}
          flightTo={to}
          isDigital={Boolean(live?.isDigital ?? primaryFace?.isDigital)}
          liveStatus={live?.status}
          locationId={locationId}
          showConfigureCta={false}
        />
      ) : null}

      {step === "dates" ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Campaign dates</h2>
          <FlightDateRangePicker from={from} to={to} />
          <p className="text-xs text-muted">
            Site: <strong>{locationName}</strong>
          </p>
          <button type="button" className="btn-primary" onClick={() => setStep("package")}>
            Continue
          </button>
        </section>
      ) : null}

      {step === "package" ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Package & creative</h2>
          <label className="block text-sm">
            Plays per day
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={playsPerDay}
              onChange={(e) => setPlaysPerDay(Number(e.target.value))}
            />
          </label>
          <p className="text-xs text-muted">
            A play is one appearance of your ad on the loop during open hours.
          </p>
          <label className="block text-sm">
            Creative length (seconds)
            <input
              type="number"
              min={5}
              max={60}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={creativeDurationSec}
              onChange={(e) => setCreativeDurationSec(Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep("dates")}>Back</button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                previewMutation.mutate();
                setStep("quote");
              }}
            >
              See pricing
            </button>
          </div>
        </section>
      ) : null}

      {step === "quote" ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Itemized quote preview</h2>
          {previewMutation.isPending ? <p className="text-sm text-muted">Calculating…</p> : null}
          {quotePreview ? (
            <p className="text-lg font-semibold">
              {quotePreview.currency === "INR" && quotePreview.total != null
                ? formatInr(quotePreview.total)
                : `Total: ${quotePreview.total}`}
            </p>
          ) : null}
          <label className="block text-sm">
            Campaign
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Select campaign</option>
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep("package")}>Back</button>
            <button
              type="button"
              className="btn-primary"
              disabled={issueMutation.isPending || !campaignId}
              onClick={() => issueMutation.mutate()}
            >
              Save authoritative quote
            </button>
          </div>
        </section>
      ) : null}

      {step === "checkout" ? (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Review & sandbox checkout</h2>
          <p className="text-sm text-muted">
            Vendor approval may still be required after payment. Execution does not start until creative is approved and sites are ready.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}
            >
              Reserve (hold)
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={payMutation.isPending || !quoteId}
              onClick={() => payMutation.mutate()}
            >
              Pay (sandbox)
            </button>
          </div>
          {message ? <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">{message}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
