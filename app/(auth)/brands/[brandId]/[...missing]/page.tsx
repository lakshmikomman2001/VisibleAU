import { notFound } from "next/navigation";

/**
 * Leftovers task, part 1 (17 Nov): a URL under a brand that isn't one of its pages ("/brands/<id>/no-such-page")
 * answers 404 with the not-found page inside the signed-in shell, after the brand layout has checked the brand. It
 * matched no route, so Next drew its bare 404 page with no shell (no sidebar, no way back but the link).
 */
export default function BrandPageNotFound(): never {
  notFound();
}
