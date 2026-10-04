import { TopicGuidePage } from "@/src/marketing/topic-guide-page";
import { guideMetadata, guideStructuredData } from "@/src/seo/policy";

export function generateMetadata() {
  return guideMetadata("/secret-santa");
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(guideStructuredData("/secret-santa")).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <TopicGuidePage path="/secret-santa" />
    </>
  );
}
