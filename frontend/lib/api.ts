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

// 2025 kicker rate (from policyengine-us parameters)
const KICKER_RATE_2025 = 0.09863;

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

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    // Use 2024 for household calculation (2025 kicker is based on 2024 tax liability)
    const calcRequest = { ...request, year: 2024 };
    const household = buildHouseholdSituation(calcRequest);
    const yearStr = "2024";

    // Run the calculation for 2024 tax year
    const result = await peCalculate({
      household,
      output: ["or_income_tax_before_credits", "employment_income"],
    });

    // Extract 2024 Oregon tax before credits
    const taxUnit = result.result?.tax_units?.["your tax unit"];
    const personData = result.result?.people?.["you"];

    // Debug: log available tax unit variables
    const availableVars = taxUnit ? Object.keys(taxUnit) : [];
    console.log("Available tax unit variables:", availableVars.filter(v => v.includes("or_") || v.includes("OR")).join(", "));

    if (!taxUnit?.or_income_tax_before_credits) {
      // Try alternative variable name
      const orTaxVar = availableVars.find(v => v.toLowerCase().includes("or_income_tax") || v.toLowerCase().includes("oregon"));
      throw new Error(`Missing or_income_tax_before_credits. Available OR variables: ${availableVars.filter(v => v.toLowerCase().includes("or")).join(", ") || "none"}`);
    }

    const orTaxBeforeCredits: number[] = taxUnit.or_income_tax_before_credits[yearStr];
    const incomeRange: number[] = personData.employment_income[yearStr];

    if (!orTaxBeforeCredits || !incomeRange) {
      throw new Error(`Missing data for year ${yearStr}. Available keys: ${Object.keys(taxUnit.or_income_tax_before_credits || {}).join(", ")}`)
    }

    // Calculate 2025 kicker credit based on 2024 tax liability
    const kickerCredit = orTaxBeforeCredits.map(
      (tax) => Math.max(0, tax) * KICKER_RATE_2025
    );

    // Interpolate at user's income
    const taxAtIncome = interpolate(
      incomeRange,
      orTaxBeforeCredits,
      request.income
    );
    const kickerAtIncome = Math.max(0, taxAtIncome) * KICKER_RATE_2025;

    return {
      income_range: incomeRange,
      or_tax_before_credits: orTaxBeforeCredits,
      kicker_credit: kickerCredit,
      kicker_at_income: {
        income: request.income,
        or_tax_before_credits: taxAtIncome,
        kicker_credit: kickerAtIncome,
      },
      kicker_rate: KICKER_RATE_2025,
      x_axis_max: request.max_earnings,
    };
  },
};
