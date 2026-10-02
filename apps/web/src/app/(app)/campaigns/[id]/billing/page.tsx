"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatInr } from "@/lib/format";

export default function CampaignBillingPage() {
  const params = useParams();
  const campaignId = String(params.id);

  const invoicesQuery = useQuery({
    queryKey: ["campaign-invoices", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaignInvoices(campaignId);
      return result.data.invoices as Array<{
        id: string;
        invoiceNumber: string | null;
        status: string;
        totalMinor: number;
        amountPaidMinor: number;
        outstandingMinor: number;
        dueAt: string | null;
        paymentTerms: string | null;
      }>;
    },
  });

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-3xl">
      <Link href={`/campaigns/${campaignId}/ops`} className="text-sm text-muted hover:text-primary w-fit">
        ← Operations
      </Link>
      <PageHeader
        title="Billing"
        description="Invoices from accepted commercial snapshots. Manual payments are authorized records — not provider-confirmed. Live checkout remains blocked without credentials."
      />
      <ul className="divide-y rounded-xl border bg-white">
        {(invoicesQuery.data ?? []).map((inv) => (
          <li key={inv.id} className="px-4 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{inv.invoiceNumber ?? "Draft"}</span>
              <span>{inv.status.toLowerCase()}</span>
            </div>
            <p className="text-muted text-xs mt-1">
              Total {formatInr(inv.totalMinor / 100)} · Paid {formatInr(inv.amountPaidMinor / 100)} ·
              Outstanding {formatInr(inv.outstandingMinor / 100)}
              {inv.dueAt ? ` · Due ${inv.dueAt.slice(0, 10)}` : ""}
            </p>
            {inv.paymentTerms ? <p className="text-[11px] text-muted">{inv.paymentTerms}</p> : null}
          </li>
        ))}
        {(invoicesQuery.data ?? []).length === 0 && (
          <li className="px-4 py-3 text-sm text-muted">No invoices yet</li>
        )}
      </ul>
    </div>
  );
}
