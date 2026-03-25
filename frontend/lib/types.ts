export type IncomeSourceKey =
  | "capital_gains"
  | "self_employment_income"
  | "taxable_social_security"
  | "taxable_pension_income"
  | "dividend_income"
  | "taxable_interest_income"
  | "taxable_retirement_distributions";

export interface HouseholdRequest {
  age_head: number;
  age_spouse: number | null;
  dependent_ages: number[];
  income: number;
  additional_income: Partial<Record<IncomeSourceKey, number>>;
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
