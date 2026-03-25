/**
 * Build a PolicyEngine household situation for the PE API.
 * Oregon-specific for kicker calculation.
 */

import type { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

function addMemberToUnits(
  situation: Record<string, any>,
  memberId: string
): void {
  for (const unit of GROUP_UNITS) {
    const key = Object.keys(situation[unit])[0];
    situation[unit][key].members.push(memberId);
  }
}

export function buildHouseholdSituation(
  params: HouseholdRequest
): Record<string, any> {
  const {
    age_head,
    age_spouse,
    dependent_ages,
    income,
    additional_income,
    year,
    max_earnings,
  } = params;
  const yearStr = String(year);
  const axisMax = Math.max(max_earnings, income);

  // Build person object with all income sources
  const personData: Record<string, any> = {
    age: { [yearStr]: age_head },
    employment_income: { [yearStr]: null },
  };

  // Add any additional income sources
  if (additional_income) {
    for (const [key, value] of Object.entries(additional_income)) {
      if (value && value > 0) {
        personData[key] = { [yearStr]: value };
      }
    }
  }

  const situation: Record<string, any> = {
    people: { you: personData },
    families: { "your family": { members: ["you"] } },
    marital_units: { "your marital unit": { members: ["you"] } },
    spm_units: { "your household": { members: ["you"] } },
    tax_units: {
      "your tax unit": {
        members: ["you"],
        or_income_tax_before_credits: { [yearStr]: null },  // Request this output
      },
    },
    households: {
      "your household": {
        members: ["you"],
        state_code: { [yearStr]: "OR" },  // Fixed to Oregon
      },
    },
    axes: [
      [
        {
          name: "employment_income",
          min: 0,
          max: axisMax,
          count: Math.min(4001, Math.max(501, Math.floor(axisMax / 500))),
          period: yearStr,
          target: "person",
        },
      ],
    ],
  };

  if (age_spouse != null) {
    situation.people["your partner"] = { age: { [yearStr]: age_spouse } };
    addMemberToUnits(situation, "your partner");
    situation.marital_units["your marital unit"].members.push("your partner");
  }

  for (let i = 0; i < dependent_ages.length; i++) {
    const childId =
      i === 0
        ? "your first dependent"
        : i === 1
          ? "your second dependent"
          : `dependent_${i + 1}`;

    situation.people[childId] = { age: { [yearStr]: dependent_ages[i] } };
    addMemberToUnits(situation, childId);
    situation.marital_units[`${childId}'s marital unit`] = {
      members: [childId],
    };
  }

  return situation;
}

/**
 * Linear interpolation helper — find the value at `x` in sorted arrays.
 */
export function interpolate(
  xs: number[],
  ys: number[],
  x: number
): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}
