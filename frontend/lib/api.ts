/**
 * Oregon Kicker calculation via www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards the household
 * to the Public API's /us/calculate.
 */

import {
  createPolicyEngineApiClient,
  DEFAULT_BASE_URL,
  PolicyEngineApiError,
  RATE_LIMIT_WAIT_MILLISECONDS,
} from "@policyengine/api-client";

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  interpolate,
} from "./household";

const policyengine = createPolicyEngineApiClient();

/**
 * The rate Oregon set for the 2025 kicker: the share of 2024 Oregon tax
 * liability before credits that is returned. It is the 2025 value of
 * gov.states.or.tax.income.credits.kicker.percent, and the rate this page
 * has always used.
 */
const KICKER_RATE_2025 = 0.09863;

/**
 * How long a calculation may take before the page gives up on it: 30 s more
 * than the dashboard API's 750 s wait for a household calculation (the
 * policyengine-api-access skill's errors table), so the dashboard API's own
 * 504 arrives first. Its route runs for at most 800 s.
 */
const CALCULATION_TIMEOUT_MILLISECONDS = 780_000;

/**
 * Statuses after which a household calculation is tried once more, following
 * the errors table of the policyengine-api-access skill. A 502 (the dashboard
 * API could not get its token or reach the Public API), or a 503 from the
 * Public API (it could not check the token), is worth one more try. A 503
 * from the dashboard API itself (its settings are missing) fails the same way
 * on that one retry and is then shown. A 504 is not retried: the dashboard API
 * has already waited 750 s for the household.
 */
const RETRYABLE_STATUSES = new Set([502, 503]);

/** The shortest wait before the one retry of a household calculation. */
const SHORTEST_RETRY_WAIT_MILLISECONDS = 2_000;

/**
 * The longest wait the page retries after. A failure whose Retry-After asks
 * for longer is shown instead.
 */
const LONGEST_RETRY_WAIT_MILLISECONDS = 60_000;

/**
 * What the page says about the firewall's limit, which everyone behind one
 * address shares.
 */
export const SHARED_LIMIT_EXPLANATION =
  "Everyone on your network, such as a workshop or an office, shares a " +
  "limit on calculations a minute";

const RATE_LIMIT_REFUSAL_MESSAGE = `${SHARED_LIMIT_EXPLANATION}, and it has been reached.`;

/**
 * When the page may send household calculations again after a refusal for
 * the firewall's limit, in `Date.now()` milliseconds. Every household
 * calculation checks it when it is sent.
 */
let householdCalculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (the firewall's minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_WAIT_MILLISECONDS,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may send household calculations again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/** Calls `listener` whenever a pause starts or is ended early; returns the unsubscribe. */
export function onHouseholdCalculationPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/**
 * Whether the page is served from the dashboard API's own origin
 * (www.policyengine.org), where the firewall's 429 is readable.
 */
function pageSharesDashboardApiOrigin(): boolean {
  return globalThis.location?.origin === new URL(DEFAULT_BASE_URL).origin;
}

/** A household calculation failed; `message` is written for the user. */
export class HouseholdCalculationError extends Error {
  override name = "HouseholdCalculationError";

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /** Whether one more try, after a short wait, could succeed. */
    readonly retryable: boolean,
    /**
     * Whether the firewall's limit may have refused it: a 429, no readable
     * answer on another origin (which is how such a page sees a 429), or a
     * calculation held back during the pause after a refusal.
     */
    readonly rateLimited: boolean = false,
    /** The answer's Retry-After in seconds, or null when it named none. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

/**
 * How long React Query waits before retrying a failed household calculation:
 * the failure's Retry-After, but never less than two seconds.
 */
export function householdRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  const retryAfterMilliseconds =
    error instanceof HouseholdCalculationError &&
    error.retryAfterSeconds !== null
      ? error.retryAfterSeconds * 1000
      : 0;
  return Math.max(SHORTEST_RETRY_WAIT_MILLISECONDS, retryAfterMilliseconds);
}

/**
 * Whether React Query should retry a failed household calculation: once,
 * only after a 502 or a 503, and only when the wait before it is a minute or
 * less, since the firewall allows 30 calculations a minute.
 */
export function shouldRetryHouseholdCalculation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof HouseholdCalculationError &&
    error.retryable &&
    householdRetryDelay(failureCount, error) <= LONGEST_RETRY_WAIT_MILLISECONDS
  );
}

function dashboardApiMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}

/** Turns a failure of the dashboard API client into a message for the user. */
function calculationError(error: PolicyEngineApiError): HouseholdCalculationError {
  if (error.status === null) {
    if (pageSharesDashboardApiOrigin()) {
      // The firewall's 429 would be readable here, so this is a network
      // failure.
      return new HouseholdCalculationError(
        "PolicyEngine's calculation service could not be reached. Check " +
          "your connection and try again.",
        null,
        false,
      );
    }
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  if (error.status === 429) {
    return new HouseholdCalculationError(
      RATE_LIMIT_REFUSAL_MESSAGE,
      429,
      false,
      true,
      error.retryAfterSeconds,
    );
  }
  if (error.status === 504) {
    // The dashboard API waited 750 s for the Public API. Its message names
    // that service, which the reader does not know, and gives no next step.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service did not answer in time " +
        "(HTTP 504). Try again in a few minutes.",
      504,
      false,
      false,
      error.retryAfterSeconds,
    );
  }
  const detail =
    dashboardApiMessage(error.body) ?? "Try again in a few minutes.";
  return new HouseholdCalculationError(
    `PolicyEngine could not calculate this household (HTTP ${error.status}): ${detail}`,
    error.status,
    RETRYABLE_STATUSES.has(error.status),
    false,
    error.retryAfterSeconds,
  );
}

/** Values over the income axis, keyed by year. */
type ValuesByYear = Record<string, number[] | undefined>;

/** The parts of a calculated household this page reads. */
interface CalculatedHousehold {
  people?: Record<string, Record<string, ValuesByYear> | undefined>;
  tax_units?: Record<string, Record<string, ValuesByYear> | undefined>;
}

async function calculateHousehold(
  household: Record<string, unknown>
): Promise<CalculatedHousehold> {
  if (householdCalculationPauseRemaining() > 0) {
    // Held back during the pause after a refusal, so never sent. The pause
    // may have started from a request with no answer, which only may have
    // met the limit.
    throw new HouseholdCalculationError(
      `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CALCULATION_TIMEOUT_MILLISECONDS
  );
  try {
    return await policyengine.calculateHousehold<CalculatedHousehold>(
      { country: "us", household },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HouseholdCalculationError(
        `The calculation took longer than ${CALCULATION_TIMEOUT_MILLISECONDS / 60_000} minutes. Try again.`,
        null,
        false,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      const failure = calculationError(error);
      if (failure.rateLimited) {
        // Pause at once, so that nothing else the page sends during the
        // minute reaches the firewall.
        pauseHouseholdCalculations();
      }
      throw failure;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    const kickerRate = KICKER_RATE_2025;

    // Use 2024 for household calculation (2025 kicker is based on 2024 tax liability)
    const calcRequest = { ...request, year: 2024 };
    const household = buildHouseholdSituation(calcRequest);
    const yearStr = "2024";

    // Run the calculation for 2024 tax year. It resolves with the
    // calculated household (the Public API's `result`).
    const result = await calculateHousehold(household);

    const taxUnit = result.tax_units?.["your tax unit"];
    const personData = result.people?.["you"];

    if (!taxUnit?.or_income_tax_before_credits) {
      const availableVars = taxUnit ? Object.keys(taxUnit) : [];
      throw new Error(`Missing or_income_tax_before_credits. Available OR variables: ${availableVars.filter(v => v.toLowerCase().includes("or")).join(", ") || "none"}`);
    }

    const orTaxBeforeCredits = taxUnit.or_income_tax_before_credits[yearStr];
    const incomeRange = personData?.employment_income?.[yearStr];

    if (!orTaxBeforeCredits || !incomeRange) {
      throw new Error(`Missing data for year ${yearStr}`);
    }

    // Calculate 2025 kicker credit based on 2024 tax liability
    const kickerCredit = orTaxBeforeCredits.map(
      (tax) => Math.max(0, tax) * kickerRate
    );

    // Interpolate at user's income
    const taxAtIncome = interpolate(incomeRange, orTaxBeforeCredits, request.income);
    const kickerAtIncome = Math.max(0, taxAtIncome) * kickerRate;

    return {
      income_range: incomeRange,
      or_tax_before_credits: orTaxBeforeCredits,
      kicker_credit: kickerCredit,
      kicker_at_income: {
        income: request.income,
        or_tax_before_credits: taxAtIncome,
        kicker_credit: kickerAtIncome,
      },
      kicker_rate: kickerRate,
      x_axis_max: request.max_earnings,
    };
  },
};
