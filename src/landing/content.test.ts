import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createGroupHref,
  dashboardHref,
  dashboardLabel,
  finalCta,
  footer,
  hero,
  howItWorks,
  landingNav,
  loginHref,
  occasionTilts,
  occasions,
  startWishlistHref,
  whyItWorks,
} from "./content";
import { demoGroup, demoPeople, demoProducts, heroBubbles } from "./demo-data";

/**
 * Guardrails for the static landing content: exact approved copy anchors,
 * approved terminology only, deterministic demo data, and strictly local
 * image references (no remote CDN dependencies at runtime).
 */

const BANNED_TERMS = /shelfie|circle/i;

describe("landing content", () => {
  it("carries the approved hero copy and CTA destinations", () => {
    expect(hero.eyebrow).toBe("Group wishlists for every occasion.");
    expect(hero.title).toMatch(
      /^Make a wishlist\. Share it with your.+people\.$/,
    );
    expect(hero.primaryCta).toBe("Start my wishlist");
    expect(hero.secondaryCta).toBe("Create a group");
    expect(startWishlistHref).toBe("/auth?intent=wishlist");
    expect(createGroupHref).toBe("/auth?intent=create-group");
    expect(loginHref).toBe("/auth?intent=home");
    // ARJ-54: the signed-in header's Dashboard entry targets the real
    // authenticated home.
    expect(dashboardHref).toBe("/home");
    expect(dashboardLabel).toBe("Dashboard");
  });

  it("exposes the three anchor-nav destinations from the reference", () => {
    expect(landingNav.map((item) => item.href)).toEqual([
      "#how",
      "#why",
      "#occasions",
    ]);
  });

  it("keeps the reference's section structure", () => {
    expect(howItWorks.steps).toHaveLength(3);
    expect(whyItWorks.benefits).toHaveLength(4);
    expect(occasions).toHaveLength(7);
    expect(occasionTilts).toHaveLength(7);
    expect(finalCta.cta).toBe("Start my wishlist");
    expect(footer.tagline).toContain("No public feeds");
  });

  it("never uses the prototype's internal product nouns", () => {
    const allText = JSON.stringify({
      hero,
      howItWorks,
      whyItWorks,
      occasions,
      finalCta,
      footer,
      demoGroup,
      demoProducts,
    });
    expect(allText).not.toMatch(BANNED_TERMS);
  });
});

describe("deterministic demo data", () => {
  it("keeps the demo group's accessible name identical to its visible name", () => {
    expect(demoGroup.name).toBe("Santa Party 🎉");
    expect(demoGroup.ariaLabel).toBe(demoGroup.name);
  });

  it("renders exact approved price strings without computing conversion", () => {
    expect(demoProducts["a-matcha"].priceDisplay).toBe("₹2,450");
    expect(demoProducts["k-kettle"].priceDisplay).toBe("₹2,350");
    expect(demoProducts["z-camera"].priceDisplay).toBe("₹4,299");
    expect(demoProducts["k-vinyl"].priceDisplay).toBe("₹1,899");
    expect(demoProducts["k-bonsai"].priceDisplay).toBe("₹3,999");
    expect(demoProducts["z-claws"].priceDisplay).toBe("$22 · ≈ ₹1,850");
    expect(demoProducts["r-cups"].priceDisplay).toBe("₹1,950");
    expect(demoGroup.budgetDisplay).toBe("₹2,500 each");
  });

  it("references only local vendored assets that exist in public/", () => {
    for (const product of Object.values(demoProducts)) {
      expect(product.image).toMatch(/^\/assets\/landing\//);
      expect(product.image).not.toMatch(/^https?:/);
      const onDisk = join(process.cwd(), "public", product.image);
      expect(() => readFileSync(onDisk)).not.toThrow();
    }
  });

  it("provides the demo people the sections render", () => {
    const joined = Object.values(demoPeople).filter(
      (person) => person.status === "joined",
    );
    expect(joined).toHaveLength(5);
    for (const bubble of heroBubbles) {
      expect(demoPeople[bubble.personId]).toBeDefined();
    }
    for (const productId of ["a-matcha", "k-kettle", "z-camera"] as const) {
      expect(
        Object.prototype.hasOwnProperty.call(
          demoPeople,
          demoProducts[productId].ownerId,
        ),
      ).toBe(true);
    }
  });
});
