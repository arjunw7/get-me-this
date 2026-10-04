import { crawlerPolicy } from "@/src/seo/policy";

export const dynamic = "force-dynamic";
export default function robots() {
  return crawlerPolicy();
}
