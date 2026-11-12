import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HouseholdCalculator from "@/components/HouseholdCalculator";
import { pauseHouseholdCalculations } from "@/lib/api";

/**
 * The calculator's first render as HTML. This repository has no DOM test
 * environment, so the page is rendered on the server.
 */
function renderedCalculator(): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(HouseholdCalculator),
    ),
  );
}

/** The text of HTML markup, without its tags. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of each element with `role="status"`, which screen readers announce. */
function liveRegionTexts(markup: string): string[] {
  const liveRegions = markup.matchAll(
    /<(\w+)[^>]*\srole="status"[^>]*>(.*?)<\/\1>/g,
  );
  return Array.from(liveRegions, (liveRegion) => textOf(liveRegion[2]));
}

afterEach(() => {
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

describe("HouseholdCalculator during a pause", () => {
  it("announces the shared limit, but not the countdown that changes every second", () => {
    vi.useFakeTimers();
    pauseHouseholdCalculations();

    const markup = renderedCalculator();

    expect(liveRegionTexts(markup)).toEqual([
      "Everyone on your network, such as a workshop or an office, shares a " +
        "limit on calculations a minute.",
    ]);
    expect(textOf(markup)).toContain("This page can calculate again in 60 s.");
  });
});
