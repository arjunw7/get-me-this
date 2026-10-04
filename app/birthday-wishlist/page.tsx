import { TopicGuidePage } from "@/src/marketing/topic-guide-page";
import { guideMetadata, guideStructuredData } from "@/src/seo/policy";

export function generateMetadata() {
  return guideMetadata("/birthday-wishlist");
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            guideStructuredData("/birthday-wishlist"),
          ).replace(/</g, "\\u003c"),
        }}
      />
      <TopicGuidePage path="/birthday-wishlist" />
    </>
  );
}
