import { HowItWorksPage } from "@/src/marketing/how-it-works-page";
import { howItWorksMetadata, howItWorksStructuredData } from "@/src/seo/policy";

export function generateMetadata() {
  return howItWorksMetadata();
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(howItWorksStructuredData()).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <HowItWorksPage />
    </>
  );
}
