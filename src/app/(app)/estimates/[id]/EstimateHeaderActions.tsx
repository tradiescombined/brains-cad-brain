// Module 4 (Estimates): header actions — status change, Prepare quote, Create/View job, overflow menu.
import { LinkButton } from "@/components/ui";
import type { Estimate } from "@/db/schema";
import { getLookups } from "@/lib/settings";
import { StatusSelect, OverflowMenu } from "../_components/HeaderControls";
import { EmailQuoteButton } from "./EmailQuote";

export async function EstimateHeaderActions({ estimate }: { estimate: Estimate }) {
  const statuses = (await getLookups("estimate_status")).map((s) => s.name);
  if (!statuses.includes(estimate.status)) statuses.unshift(estimate.status);
  const e = estimate;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!e.isTemplate && <StatusSelect key={e.status} id={e.id} status={e.status} statuses={statuses} />}
      {e.isTemplate ? (
        <LinkButton href={`/estimates/new?template=${e.id}`}>Use template</LinkButton>
      ) : (
        <>
          <EmailQuoteButton estimateId={e.id} sent={!!e.sentAt} />
          <LinkButton variant="secondary" href={`/estimates/${e.id}/quote`}>Prepare quote</LinkButton>
          {e.jobId ? (
            <LinkButton variant="secondary" href={`/jobs/${e.jobId}`}>View job</LinkButton>
          ) : (
            <LinkButton href={`/jobs/new?estimateId=${e.id}`}>Create job</LinkButton>
          )}
        </>
      )}
      <OverflowMenu id={e.id} name={e.name} isTemplate={e.isTemplate} archived={e.archived} hasJob={!!e.jobId} />
    </div>
  );
}
