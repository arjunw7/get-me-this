import { TopicGuidePage } from "@/src/marketing/topic-guide-page";
import { guideMetadata, guideStructuredData } from "@/src/seo/policy";

export function generateMetadata() {
  return guideMetadata("/wishlist-from-different-stores");
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            guideStructuredData("/wishlist-from-different-stores"),
          ).replace(/</g, "\\u003c"),
        }}
      />
      <TopicGuidePage path="/wishlist-from-different-stores" />
    </>
  );
}
