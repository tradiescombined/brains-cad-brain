// Module 4 (Estimates) owns this file: header actions such as status change, Create job, Prepare quote, Duplicate.
import { LinkButton } from "@/components/ui";
import type { Estimate } from "@/db/schema";

export function EstimateHeaderActions({ estimate }: { estimate: Estimate }) {
  return (
    <div className="flex gap-2">
      <LinkButton variant="secondary" href={`/estimates/${estimate.id}/quote`}>Prepare quote</LinkButton>
    </div>
  );
}
