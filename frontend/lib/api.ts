/**
 * Oregon Kicker calculation via www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards the household
 * to the Public API's /us/calculate.
 */

import {
  createPolicyEngineApiClient,
  PolicyEngineApiError,
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

/** How long a calculation may take before the page gives up on it. */
const CALCULATION_TIMEOUT_MILLISECONDS = 120_000;

/** Brief gateway failures, which are worth retrying. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/**
 * How long the page waits after a refusal for the firewall's limit before
 * it calculates again: the firewall counts calculations a minute.
 */
export const RATE_LIMIT_PAUSE_MILLISECONDS = 60_000;

/** What the page says about the firewall's limit, which everyone behind
 * one address shares. */
const SHARED_LIMIT_EXPLANATION =
  "Everyone on your network, such as a workshop or an office, shares a " +
  "limit on calculations a minute";

/** A household calculation failed; `message` is written for the user. */
export class HouseholdCalculationError extends Error {
  override name = "HouseholdCalculationError";

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /** Whether trying again at once could succeed. */
    readonly retryable: boolean,
    /**
     * Whether the firewall's limit may have refused it: a 429, or no
     * readable answer, which is how a page on another origin sees a 429.
     */
    readonly rateLimited: boolean = false,
  ) {
    super(message);
  }
}

/**
 * Whether React Query should retry a failed household calculation: once,
 * and only after a brief gateway failure, since the firewall allows 30
 * calculations a minute.
 */
export function shouldRetryHouseholdCalculation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof HouseholdCalculationError &&
    error.retryable
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
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}: if it has been reached, this page can ` +
        "calculate again in a minute.",
      null,
      false,
      true,
    );
  }
  if (error.status === 429) {
    return new HouseholdCalculationError(
      `${SHARED_LIMIT_EXPLANATION}, and it has been reached. This page can ` +
        "calculate again in a minute.",
      429,
      false,
      true,
    );
  }
  const detail =
    dashboardApiMessage(error.body) ?? "Try again in a few minutes.";
  return new HouseholdCalculationError(
    `PolicyEngine could not calculate this household (HTTP ${error.status}): ${detail}`,
    error.status,
    RETRYABLE_STATUSES.has(error.status),
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
        "The calculation took longer than two minutes. Try again.",
        null,
        false,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      throw calculationError(error);
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
