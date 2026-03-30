"""
Generate aggregate impact data for the Oregon Kicker credit.

This script runs a PolicyEngine microsimulation comparing:
- Baseline: No kicker credit (kicker rate set to 0%)
- Reform: Current law (kicker rate at 9.863%)

The kicker is based on prior-year tax liability, so we inject current-year
Oregon tax as a proxy for `or_tax_before_credits_in_prior_year`.

Output: CSV files in frontend/public/data/
"""

import pandas as pd
import numpy as np
from pathlib import Path

# PolicyEngine imports
from policyengine_us import Microsimulation
from policyengine_core.reforms import Reform

YEAR = 2025
DATASET = "hf://policyengine/policyengine-us-data/states/OR.h5"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"


def calculate_aggregate_impact():
    """Run microsimulation and return aggregate impact data."""
    print(f"Setting up simulations for {YEAR}...")

    # Reform that eliminates the kicker credit (used as baseline)
    no_kicker_reform = Reform.from_dict({
        "gov.states.or.tax.income.credits.kicker.percent": {
            "2024-01-01.2100-12-31": 0
        }
    }, country_id="us")

    # Baseline: No kicker credit (Oregon-only dataset)
    baseline = Microsimulation(reform=no_kicker_reform, dataset=DATASET)

    # Reform: Current law (kicker in effect)
    reformed = Microsimulation(dataset=DATASET)

    # Calculate Oregon tax before credits to inject as prior-year proxy
    print("Calculating Oregon tax for prior-year proxy...")
    tax_before_credits = baseline.calculate("or_income_tax_before_credits", period=YEAR)

    # Inject prior-year tax values
    baseline.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)
    reformed.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)

    # Get kicker rate - use getattr chain since "or" is a reserved word
    params = reformed.tax_benefit_system.parameters
    or_state = getattr(params.gov.states, "or")
    kicker_param = or_state.tax.income.credits.kicker.percent
    kicker_rate = kicker_param(f"{YEAR}-01-01")
    print(f"Kicker rate for {YEAR}: {kicker_rate * 100:.3f}%")

    # Calculate household net income change
    print("Calculating income changes...")
    baseline_income = baseline.calculate("household_net_income", period=YEAR)
    reformed_income = reformed.calculate("household_net_income", period=YEAR)
    income_change = reformed_income - baseline_income

    # Get weights
    household_weight = baseline.calculate("household_weight", period=YEAR)
    person_weight = baseline.calculate("person_weight", period=YEAR)

    # Summary metrics
    print("Computing summary metrics...")
    total_income_change = (income_change * household_weight).sum()

    # Kicker credit amounts
    kicker_credit = reformed.calculate("or_kicker", period=YEAR)
    recipients = kicker_credit > 0
    total_kicker = (kicker_credit * household_weight).sum()
    num_recipients = household_weight[recipients].sum()
    avg_kicker = (kicker_credit[recipients] * household_weight[recipients]).sum() / num_recipients if num_recipients > 0 else 0

    # Revenue impact
    baseline_revenue = (baseline.calculate("or_income_tax", period=YEAR) * household_weight).sum()
    reformed_revenue = (reformed.calculate("or_income_tax", period=YEAR) * household_weight).sum()

    metrics = {
        "total_cost_billions": round(total_income_change / 1e9, 2),
        "beneficiaries_millions": round(num_recipients / 1e6, 2),
        "average_credit": round(avg_kicker, 2),
        "baseline_revenue_billions": round(baseline_revenue / 1e9, 2),
        "reformed_revenue_billions": round(reformed_revenue / 1e9, 2),
        "kicker_rate_percent": round(kicker_rate * 100, 3),
    }

    # Winners/losers
    print("Computing winners/losers...")
    winners = income_change > 1
    losers = income_change < -1
    unchanged = ~winners & ~losers

    total_hh = household_weight.sum()
    winners_pct = round((household_weight[winners].sum() / total_hh) * 100, 1)
    losers_pct = round((household_weight[losers].sum() / total_hh) * 100, 1)
    unchanged_pct = round((household_weight[unchanged].sum() / total_hh) * 100, 1)

    avg_gain = (income_change[winners] * household_weight[winners]).sum() / household_weight[winners].sum() if winners.any() else 0
    avg_loss = (income_change[losers] * household_weight[losers]).sum() / household_weight[losers].sum() if losers.any() else 0

    metrics["average_gain_winners"] = round(avg_gain, 2)

    winners_losers = [
        {"category": "winners", "percent": winners_pct, "average_change": round(avg_gain, 2)},
        {"category": "losers", "percent": losers_pct, "average_change": round(avg_loss, 2)},
        {"category": "unchanged", "percent": unchanged_pct, "average_change": 0.0},
    ]

    # Distributional by decile
    print("Computing distributional impact by decile...")
    income_decile = baseline.calculate("household_income_decile", period=YEAR)

    distributional = []
    for decile in range(1, 11):
        mask = income_decile == decile
        decile_change = (income_change[mask] * household_weight[mask]).sum()
        decile_hh_count = household_weight[mask].sum()
        avg_change = decile_change / decile_hh_count if decile_hh_count > 0 else 0

        distributional.append({
            "decile": decile,
            "total_change_billions": round(decile_change / 1e9, 6),
            "avg_change_per_hh": round(avg_change, 2),
            "households_millions": round(decile_hh_count / 1e6, 3),
        })

    # Poverty impact - use weighted mean from MicroSeries
    print("Computing poverty impact...")
    baseline_poverty = baseline.calculate("in_poverty", period=YEAR)
    reformed_poverty = reformed.calculate("in_poverty", period=YEAR)

    # MicroSeries .mean() uses built-in weights
    baseline_poverty_rate = float(baseline_poverty.mean()) * 100
    reformed_poverty_rate = float(reformed_poverty.mean()) * 100
    poverty_change = reformed_poverty_rate - baseline_poverty_rate

    poverty = [{
        "metric": "overall_poverty",
        "baseline": round(baseline_poverty_rate, 2),
        "reformed": round(reformed_poverty_rate, 2),
        "change_pp": round(poverty_change, 2),
    }]

    return metrics, distributional, winners_losers, poverty


def save_csv(data, filename):
    """Save data to CSV file."""
    df = pd.DataFrame(data) if isinstance(data, list) else pd.DataFrame([data])
    filepath = OUTPUT_DIR / filename
    df.to_csv(filepath, index=False)
    print(f"Saved: {filepath}")


def main():
    print("=" * 60)
    print("Oregon Kicker Credit Impact Analysis")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    metrics, distributional, winners_losers, poverty = calculate_aggregate_impact()

    # Save metrics as key-value pairs
    metrics_rows = [{"metric": k, "value": v} for k, v in metrics.items()]
    save_csv(metrics_rows, "metrics.csv")

    save_csv(distributional, "distributional_impact.csv")
    save_csv(winners_losers, "winners_losers.csv")
    save_csv(poverty, "poverty_impact.csv")

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Total cost: ${metrics['total_cost_billions']}B")
    print(f"  Beneficiaries: {metrics['beneficiaries_millions']}M")
    print(f"  Average credit: ${metrics['average_credit']}")
    print(f"  Kicker rate: {metrics['kicker_rate_percent']}%")
    print("=" * 60)


if __name__ == "__main__":
    main()
