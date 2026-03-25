export interface HouseholdRequest {
  age_head: number;
  age_spouse: number | null;
  dependent_ages: number[];
  income: number;
  year: number;
  max_earnings: number;
}

export interface KickerAtIncome {
  income: number;
  or_tax_before_credits: number;
  kicker_credit: number;
}

export interface HouseholdImpactResponse {
  income_range: number[];
  or_tax_before_credits: number[];
  kicker_credit: number[];
  kicker_at_income: KickerAtIncome;
  kicker_rate: number;
  x_axis_max: number;
}
