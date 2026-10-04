import { publicSitemap } from "@/src/seo/policy";

export const dynamic = "force-dynamic";
export default function sitemap() {
  return publicSitemap();
}
