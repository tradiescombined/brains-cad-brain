import { getSettings } from "@/lib/settings";
import { BusinessForm } from "./BusinessForm";

export const metadata = { title: "Business details · Settings" };

export default async function BusinessSettingsPage() {
  const s = await getSettings();
  return (
    <BusinessForm
      v={{
        businessName: s.businessName,
        tradingName: s.tradingName,
        businessNumber: s.businessNumber,
        licenceNumber: s.licenceNumber,
        email: s.email,
        phone: s.phone,
        website: s.website,
        address: s.address,
        cityTown: s.cityTown,
        state: s.state,
        postcode: s.postcode,
        country: s.country,
        currency: s.currency,
        logoDataUrl: s.logoDataUrl,
        brandColour: s.brandColour,
      }}
    />
  );
}
