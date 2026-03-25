/**
 * Oregon Kicker calculation via the PolicyEngine API.
 *
 * Calls https://api.policyengine.org/us/calculate directly —
 * no backend server required.
 */

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildHouseholdSituation,
  interpolate,
} from "./household";

const PE_API_URL = "https://api.policyengine.org";

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function peCalculate(body: Record<string, any>): Promise<any> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(
      `PolicyEngine API error: ${response.status}`,
      response.status,
      errorBody
    );
  }
  return response.json();
}

// Fetch the 2025 kicker rate from PolicyEngine metadata
async function fetchKickerRate(): Promise<number> {
  try {
    const response = await fetch(`${PE_API_URL}/us/metadata`);
    if (!response.ok) throw new Error("Failed to fetch metadata");
    const data = await response.json();

    // Navigate to the kicker percent parameter
    const kickerParam = data.parameters?.["gov.states.or.tax.income.credits.kicker.percent"];
    if (kickerParam?.values) {
      // Find the value for 2025
      for (const entry of Object.values(kickerParam.values) as any[]) {
        if (entry["2025-01-01"] !== undefined) {
          return entry["2025-01-01"];
        }
      }
      // Get the most recent value
      const values = Object.entries(kickerParam.values).sort((a, b) =>
        new Date(b[0]).getTime() - new Date(a[0]).getTime()
      );
      if (values.length > 0) {
        return values[0][1] as number;
      }
    }
  } catch (e) {
    console.warn("Could not fetch kicker rate from API, using fallback");
  }
  // Fallback to known 2025 rate
  return 0.09863;
}

let cachedKickerRate: number | null = null;

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    // Fetch kicker rate (cached after first call)
    if (cachedKickerRate === null) {
      cachedKickerRate = await fetchKickerRate();
    }
    const kickerRate = cachedKickerRate;

    // Use 2024 for household calculation (2025 kicker is based on 2024 tax liability)
    const calcRequest = { ...request, year: 2024 };
    const household = buildHouseholdSituation(calcRequest);
    const yearStr = "2024";

    // Run the calculation for 2024 tax year
    const result = await peCalculate({
      household,
      output: ["or_income_tax_before_credits", "employment_income"],
    });

    const taxUnit = result.result?.tax_units?.["your tax unit"];
    const personData = result.result?.people?.["you"];

    if (!taxUnit?.or_income_tax_before_credits) {
      const availableVars = taxUnit ? Object.keys(taxUnit) : [];
      throw new Error(`Missing or_income_tax_before_credits. Available OR variables: ${availableVars.filter(v => v.toLowerCase().includes("or")).join(", ") || "none"}`);
    }

    const orTaxBeforeCredits: number[] = taxUnit.or_income_tax_before_credits[yearStr];
    const incomeRange: number[] = personData.employment_income[yearStr];

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
