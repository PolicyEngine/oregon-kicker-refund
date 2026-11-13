import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HouseholdCalculator, { ImpactResults } from "@/components/HouseholdCalculator";
import {
  rememberShownHouseholdRequest,
  useHouseholdImpact,
} from "@/hooks/useHouseholdImpact";
import {
  api,
  HouseholdCalculationError,
  pauseHouseholdCalculations,
  SHARED_LIMIT_EXPLANATION,
} from "@/lib/api";
import type { HouseholdImpactResponse, HouseholdRequest } from "@/lib/types";

// Server rendering runs no effects, and this repository has no DOM test
// environment. So the components' effects are kept as they are rendered,
// and `renderWithEffects` runs them after the render, as React does on the
// client; what they return to clean up runs when a test unmounts them.
const { pendingEffects, effectCleanups } = vi.hoisted(() => ({
  pendingEffects: [] as Array<() => void | (() => void)>,
  effectCleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    // Every effect runs after every render, whatever its dependencies:
    // running these effects again with the same values changes nothing.
    useEffect: (effect: () => void | (() => void)) => {
      pendingEffects.push(effect);
    },
  };
});

const queryClient = new QueryClient();

/**
 * Renders `element` as HTML, then runs the effects it rendered. This
 * repository has no DOM test environment, so the page is rendered on the
 * server.
 */
function renderWithEffects(element: ReactElement): string {
  const markup = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: queryClient }, element),
  );
  for (const effect of pendingEffects.splice(0)) {
    const cleanup = effect();
    if (typeof cleanup === "function") {
      effectCleanups.push(cleanup);
    }
  }
  return markup;
}

/** Removes everything rendered so far from the page, running its cleanups. */
function unmountAll(): void {
  for (const cleanup of effectCleanups.splice(0)) {
    cleanup();
  }
}

/** The calculator as it is first shown when its tab is opened. */
function renderedCalculator(): string {
  return renderWithEffects(createElement(HouseholdCalculator));
}

/**
 * Stands in for the calculator's results area, which the calculator does
 * not export: it calls the same hook for the submitted household and
 * prints what the results area shows, an error panel or the income of the
 * household whose answer is shown.
 */
function ResultsArea({ request }: { request: HouseholdRequest }) {
  const { data, error, shownRequest, rateLimitNotice } = useHouseholdImpact(
    request,
    true,
  );
  if (error) {
    return createElement("p", null, `Error calculating kicker: ${error.message}`);
  }
  if (data === undefined) {
    return null;
  }
  return createElement(
    "p",
    null,
    `${rateLimitNotice ?? ""} Answer for an income of ${shownRequest?.income}.`,
  );
}

/** Renders the results area for `request`, then runs its effects. */
function renderedResultsArea(request: HouseholdRequest): string {
  return renderWithEffects(createElement(ResultsArea, { request }));
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

const calculatedRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [],
  income: 75000,
  additional_income: {},
  year: 2025,
  max_earnings: 500000,
};

const calculatedAnswer: HouseholdImpactResponse = {
  income_range: [0, 75000, 500000],
  or_tax_before_credits: [0, 5000, 40000],
  kicker_credit: [0, 493, 3945],
  kicker_at_income: {
    income: 75000,
    or_tax_before_credits: 5000,
    kicker_credit: 493,
  },
  kicker_rate: 0.09863,
  x_axis_max: 500000,
};

// Another household, which the firewall refuses.
const refusedRequest: HouseholdRequest = { ...calculatedRequest, income: 60000 };

const REFUSAL_MESSAGE =
  "Everyone on your network, such as a workshop or an office, shares a " +
  "limit on calculations a minute, and it has been reached.";

/** Stores a refusal for the firewall's limit as `request`'s calculation. */
async function refuse(request: HouseholdRequest): Promise<void> {
  await queryClient
    .fetchQuery({
      queryKey: ["householdImpact", request],
      queryFn: () =>
        Promise.reject(
          new HouseholdCalculationError(REFUSAL_MESSAGE, 429, false, true),
        ),
      retry: false,
    })
    .catch(() => undefined);
}

afterEach(() => {
  unmountAll();
  pendingEffects.length = 0;
  vi.restoreAllMocks();
  queryClient.clear();
  rememberShownHouseholdRequest(queryClient, null);
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

describe("HouseholdCalculator during a pause", () => {
  it("announces the shared limit once, but not the countdown that changes every second, even above a kept answer", async () => {
    vi.useFakeTimers();
    pauseHouseholdCalculations();

    const markup = renderedCalculator();

    expect(liveRegionTexts(markup)).toEqual([
      "Everyone on your network, such as a workshop or an office, shares a " +
        "limit on calculations a minute.",
    ]);
    expect(textOf(markup)).toContain("This page can calculate again in 60 s.");

    // A refusal keeps the household calculated before on screen, under its
    // notice, during the pause the refusal started. The page renders the
    // results area inside the calculator, below the Calculate button.
    unmountAll();
    queryClient.setQueryData(
      ["householdImpact", calculatedRequest],
      calculatedAnswer,
    );
    rememberShownHouseholdRequest(queryClient, calculatedRequest);
    await refuse(refusedRequest);
    const pageMarkup = renderWithEffects(
      createElement(
        Fragment,
        null,
        createElement(HouseholdCalculator),
        createElement(ImpactResults, {
          request: refusedRequest,
          triggered: true,
        }),
      ),
    );

    expect(textOf(pageMarkup)).toContain(
      "The results below are for the household shown before.",
    );
    expect(
      liveRegionTexts(pageMarkup).filter((liveRegionText) =>
        liveRegionText.includes(SHARED_LIMIT_EXPLANATION),
      ),
    ).toEqual([
      "Everyone on your network, such as a workshop or an office, shares a " +
        "limit on calculations a minute.",
    ]);
  });
});

describe("HouseholdCalculator while a household calculates", () => {
  it("says a first calculation can take a few minutes", () => {
    // Nothing is sent: a server render starts no calculation, and none
    // could reach the network.
    vi.spyOn(api, "calculateHouseholdImpact").mockReturnValue(
      new Promise(() => undefined),
    );

    const markup = textOf(
      renderWithEffects(
        createElement(ImpactResults, {
          request: calculatedRequest,
          triggered: true,
        }),
      ),
    );

    expect(markup).toContain("Calculating your kicker...");
    expect(markup).toContain("A first calculation can take a few minutes.");
  });
});

describe("HouseholdCalculator after its tab is opened again", () => {
  it("shows a refusal itself after the household tab is opened again", async () => {
    // The reader calculates a household, opens another tab and comes back.
    queryClient.setQueryData(
      ["householdImpact", calculatedRequest],
      calculatedAnswer,
    );
    expect(textOf(renderedResultsArea(calculatedRequest))).toContain(
      "Answer for an income of 75000.",
    );
    unmountAll();
    // Opened again, the tab shows the form and no results.
    expect(textOf(renderedCalculator())).not.toContain("Your Oregon Kicker");

    // The next household is refused: the earlier answer is no longer on
    // screen, so the refusal must not bring it back.
    await refuse(refusedRequest);
    const markup = textOf(renderedResultsArea(refusedRequest));

    expect(markup).toBe(`Error calculating kicker: ${REFUSAL_MESSAGE}`);
  });
});
