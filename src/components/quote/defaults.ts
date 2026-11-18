/** Default letter text for new quotes (original copy). Merge fields are resolved at render time. */

export const DEFAULT_COVER_LETTER = `Dear [ClientName],

Thank you for inviting us to price [EstimateName] at [SiteAddress]. We have reviewed the scope of work and are pleased to present quotation [EstimateNumber] for your consideration.

Our price for the works described in this quotation is **[QuoteTotal]** including GST. The price is valid until [ValidUntil].

If anything in the scope needs clarifying, or you would like to talk through options, please get in touch. We look forward to working with you.

Kind regards,
[BusinessName]`;

export const DEFAULT_TERMS = `**Acceptance.** This quotation becomes a binding agreement once accepted in writing or online. Pricing is valid until [ValidUntil]; after that date we may need to re-price.

**Payment.** Unless otherwise agreed, a deposit is payable on acceptance, with progress claims issued as stages are completed. Invoices are due within 14 days.

**Allowances.** Prime cost (PC) and provisional sum (PS) items are estimates only. The final amount is adjusted up or down to the actual cost, plus our margin on any increase.

**Exclusions.** Unless listed in this quotation, the following are not included:
- Council, certification or engineering fees
- Rock excavation, contaminated soil or asbestos removal
- Rectification of hidden defects found during the works

**Variations.** Changes to the scope are confirmed in writing and priced before the work proceeds.

**Site access.** The client will provide clear access, power and water for the duration of the works.

**Warranty.** Workmanship is covered as required by the relevant state building legislation. Manufacturer warranties apply to supplied products.`;

export const DEFAULT_QUOTE_TITLE = "Quotation";
