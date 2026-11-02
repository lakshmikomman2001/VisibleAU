import { redirect } from "next/navigation";

/**
 * 2 Nov: the agency branding is edited in one place, Settings -> Report
 * branding -- with the logo uploader instead of a "Logo URL" box, owners
 * and admins only, and a save that updates the workspace's row in place.
 * This old address (the Agency Dashboard's link, bookmarks) opens it.
 */
export default function AgencyBrandingPage() {
  redirect("/settings/report-branding");
}
