import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  HouseholdCalculationError,
  householdCalculationPauseRemaining,
  pauseHouseholdCalculations,
  shouldRetryHouseholdCalculation,
} from "@/lib/api";
import { buildHouseholdSituation } from "@/lib/household";
import type { HouseholdRequest } from "@/lib/types";

const DASHBOARD_API_CALCULATE_URL =
  "https://www.policyengine.org/api/household/calculate";
// The rate Oregon set for the 2025 kicker, which the page has always used.
const KICKER_RATE_2025 = 0.09863;

const householdRequest: HouseholdRequest = {
  age_head: 40,
  age_spouse: null,
  dependent_ages: [],
  income: 75000,
  additional_income: {},
  year: 2025,
  max_earnings: 500000,
};

interface RecordedRequest {
  url: string;
  method: string | undefined;
  body: unknown;
}

type Respond = (init: RequestInit) => Response | Promise<Response>;

/** Replaces the global fetch; returns the requests it receives. */
function stubFetch(respond: Respond): RecordedRequest[] {
  const recordedRequests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      recordedRequests.push({
        url: String(input),
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return respond(init);
    }),
  );
  return recordedRequests;
}

/** The Public API's calculated household, with values over the income axis. */
function calculatedHousehold(incomes: number[], taxes: number[]) {
  return {
    people: { you: { employment_income: { "2024": incomes } } },
    tax_units: {
      "your tax unit": { or_income_tax_before_credits: { "2024": taxes } },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okAnswer(result: unknown): Response {
  return jsonResponse(200, { status: "ok", message: null, result });
}

async function calculationFailure(): Promise<unknown> {
  try {
    await api.calculateHouseholdImpact(householdRequest);
  } catch (error) {
    return error;
  }
  throw new Error("The calculation did not fail.");
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

describe("calculateHouseholdImpact", () => {
  it("sends the 2024 household to the dashboard API and nothing else", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0, 100000], [0, 5000])),
    );

    await api.calculateHouseholdImpact(householdRequest);

    expect(recordedRequests).toEqual([
      {
        url: DASHBOARD_API_CALCULATE_URL,
        method: "POST",
        body: {
          country: "us",
          household: buildHouseholdSituation({ ...householdRequest, year: 2024 }),
        },
      },
    ]);
  });

  it("reads Oregon tax from the calculated household as before", async () => {
    const incomes = [0, 50000, 100000];
    const taxes = [-100, 2000, 6000];
    stubFetch(() => okAnswer(calculatedHousehold(incomes, taxes)));

    const impact = await api.calculateHouseholdImpact(householdRequest);

    expect(impact).toEqual({
      income_range: incomes,
      or_tax_before_credits: taxes,
      kicker_credit: [0, 2000 * KICKER_RATE_2025, 6000 * KICKER_RATE_2025],
      kicker_at_income: {
        income: 75000,
        or_tax_before_credits: 4000,
        kicker_credit: 4000 * KICKER_RATE_2025,
      },
      kicker_rate: KICKER_RATE_2025,
      x_axis_max: 500000,
    });
  });

  it("explains the shared limit after the firewall's rate limit", async () => {
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(await calculationFailure()).toMatchObject({
      // The countdown beside the button says when the page can calculate
      // again, so the message stays true after the minute.
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, and it has been reached.",
      status: 429,
      retryable: false,
      rateLimited: true,
    });
  });

  it("explains the shared limit when no answer could be read", async () => {
    // A page on another origin cannot read the firewall's 429, which has no
    // CORS headers: the browser reports a network failure instead.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Everyone " +
        "on your network, such as a workshop or an office, shares a limit " +
        "on calculations a minute, which may have been reached.",
      status: null,
      retryable: false,
      rateLimited: true,
    });
  });

  it("reports a network failure on www.policyengine.org without pausing", async () => {
    // The website serves this page there, so the page and the dashboard
    // API share an origin and the firewall's 429 is readable: no answer
    // means a network failure.
    vi.stubGlobal("location", { origin: "https://www.policyengine.org" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Check " +
        "your connection and try again.",
      status: null,
      rateLimited: false,
    });
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("pauses household calculations for a minute after a refusal", async () => {
    vi.useFakeTimers();
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    await calculationFailure();

    expect(householdCalculationPauseRemaining()).toBe(60_000);
    vi.advanceTimersByTime(60_000);
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("does not pause after other failures", async () => {
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    await calculationFailure();

    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("sends no household calculation while calculations are paused", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0, 100000], [0, 5000])),
    );
    pauseHouseholdCalculations();

    expect(await calculationFailure()).toMatchObject({ rateLimited: true });
    expect(recordedRequests).toEqual([]);
  });

  it("shows the server's message for a 403 the page can read", async () => {
    // A refused origin never reaches this: that 403 has no CORS headers, so
    // the browser reports a network failure. A page can read only a 403 the
    // dashboard API passes on from the Public API.
    stubFetch(() =>
      jsonResponse(403, {
        status: "error",
        message: "Forbidden by the Public API.",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringMatching(/HTTP 403.*Forbidden by the Public API\./),
      status: 403,
      retryable: false,
    });
  });

  it("shows the dashboard API's own message for a refused request", async () => {
    stubFetch(() =>
      jsonResponse(400, {
        status: "error",
        message: "Unknown fields: output.",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringContaining("Unknown fields: output."),
      status: 400,
      retryable: false,
    });
  });

  it("lets a brief gateway failure be retried", async () => {
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringContaining("HTTP 503"),
      status: 503,
      retryable: true,
      rateLimited: false,
    });
  });

  it("gives up after two minutes without an answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init: RequestInit = {}) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    const failure = calculationFailure();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await failure).toMatchObject({
      message: expect.stringMatching(/two minutes/i),
      status: null,
      retryable: false,
      rateLimited: false,
    });
  });
});

describe("shouldRetryHouseholdCalculation", () => {
  it("retries a retryable failure once, and nothing else", () => {
    const gatewayFailure = new HouseholdCalculationError("", 503, true);
    const rateLimited = new HouseholdCalculationError("", 429, false);

    expect(
      [0, 1].map((failureCount) =>
        shouldRetryHouseholdCalculation(failureCount, gatewayFailure),
      ),
    ).toEqual([true, false]);
    expect(shouldRetryHouseholdCalculation(0, rateLimited)).toBe(false);
    expect(shouldRetryHouseholdCalculation(0, new Error("other"))).toBe(false);
  });
});
