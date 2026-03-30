"""Aggregate impact calculations for Oregon Kicker using state microsimulation.

Uses MicroSeries throughout where possible. MicroSeries.sum() is
automatically weighted, and boolean masks preserve entity alignment.
Only drops to numpy for operations MicroSeries can't do (groupby-like
decile loops, child poverty age filtering).

Based on the Keep Your Pay Act microsimulation pattern.
"""

import numpy as np
import pandas as pd
from pathlib import Path
from policyengine_us import Microsimulation
from policyengine_core.reforms import Reform

YEAR = 2025
DATASET = "hf://policyengine/policyengine-us-data/states/OR.h5"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"


def create_no_kicker_reform():
    """Create reform that eliminates the kicker credit (used as baseline)."""
    return Reform.from_dict({
        "gov.states.or.tax.income.credits.kicker.percent": {
            "2024-01-01.2100-12-31": 0
        }
    }, country_id="us")


def _poverty_metrics(baseline_rate, reform_rate):
    """Return rate change and percent change for a poverty metric."""
    rate_change = reform_rate - baseline_rate
    percent_change = (
        rate_change / baseline_rate * 100
        if baseline_rate > 0
        else 0.0
    )
    return rate_change, percent_change


def calculate_aggregate_impact():
    """Run microsimulation and return aggregate impact data."""
    print(f"Setting up simulations for {YEAR}...")

    no_kicker_reform = create_no_kicker_reform()

    # Baseline: No kicker credit
    sim_baseline = Microsimulation(reform=no_kicker_reform, dataset=DATASET)
    # Reform: Current law (kicker in effect)
    sim_reform = Microsimulation(dataset=DATASET)

    # Inject prior-year tax (using current year as proxy)
    print("Calculating Oregon tax for prior-year proxy...")
    tax_before_credits = sim_baseline.calculate("or_income_tax_before_credits", period=YEAR)
    sim_baseline.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)
    sim_reform.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)

    # Get kicker rate
    params = sim_reform.tax_benefit_system.parameters
    or_state = getattr(params.gov.states, "or")
    kicker_rate = or_state.tax.income.credits.kicker.percent(f"{YEAR}-01-01")
    print(f"Kicker rate for {YEAR}: {kicker_rate * 100:.3f}%")

    # ===== FISCAL IMPACT =====
    print("Computing fiscal impact...")
    baseline_net_income = sim_baseline.calculate(
        "household_net_income", period=YEAR, map_to="household"
    )
    reform_net_income = sim_reform.calculate(
        "household_net_income", period=YEAR, map_to="household"
    )
    income_change = reform_net_income - baseline_net_income

    total_income_change = float(income_change.sum())

    # Total households: (x * 0 + 1).sum() = sum(weights)
    total_households = float((income_change * 0 + 1).sum())

    # Kicker credit totals
    kicker_credit = sim_reform.calculate("or_kicker", period=YEAR)
    total_kicker = float(kicker_credit.sum())

    # ===== WINNERS / LOSERS =====
    print("Computing winners/losers...")
    winners = float((income_change > 1).sum())
    losers = float((income_change < -1).sum())
    beneficiaries = float((income_change > 0).sum())

    affected = abs(income_change) > 1
    affected_count = float(affected.sum())

    # Use numpy for correct weighted average
    household_weight = sim_reform.calculate("household_weight", period=YEAR)
    affected_mask = np.array(affected).astype(bool)
    change_arr = np.array(income_change)
    weight_arr = np.array(household_weight)

    avg_benefit = (
        float(np.average(
            change_arr[affected_mask],
            weights=weight_arr[affected_mask],
        ))
        if affected_count > 0
        else 0.0
    )

    winners_rate = winners / total_households * 100
    losers_rate = losers / total_households * 100
    unchanged_rate = 100 - winners_rate - losers_rate

    # ===== INCOME DECILE ANALYSIS =====
    print("Computing distributional impact by decile...")
    decile = sim_baseline.calculate(
        "household_income_decile", period=YEAR, map_to="household"
    )

    decile_data = []
    for d in range(1, 11):
        dmask = decile == d
        d_count = float(dmask.sum())
        if d_count > 0:
            d_change_sum = float(income_change[dmask].sum())
            avg_change = d_change_sum / d_count
        else:
            d_change_sum = 0.0
            avg_change = 0.0

        decile_data.append({
            "decile": d,
            "total_change_billions": round(d_change_sum / 1e9, 6),
            "avg_change_per_hh": round(avg_change, 2),
            "households_millions": round(d_count / 1e6, 3),
        })

    # ===== POVERTY IMPACT =====
    print("Computing poverty impact...")
    pov_bl = sim_baseline.calculate("in_poverty", period=YEAR, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=YEAR, map_to="person")

    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change, _ = _poverty_metrics(poverty_baseline_rate, poverty_reform_rate)

    # Child poverty needs age filtering — numpy required
    age_arr = np.array(sim_baseline.calculate("age", period=YEAR))
    is_child = age_arr < 18
    pw_arr = np.array(sim_baseline.calculate("person_weight", period=YEAR))
    child_w = pw_arr[is_child]
    total_child_w = child_w.sum()

    pov_bl_arr = np.array(pov_bl).astype(bool)
    pov_rf_arr = np.array(pov_rf).astype(bool)

    def _child_rate(arr):
        return float(
            (arr[is_child] * child_w).sum() / total_child_w * 100
        ) if total_child_w > 0 else 0.0

    child_poverty_baseline_rate = _child_rate(pov_bl_arr)
    child_poverty_reform_rate = _child_rate(pov_rf_arr)
    child_poverty_rate_change, _ = _poverty_metrics(
        child_poverty_baseline_rate, child_poverty_reform_rate
    )

    # Deep poverty
    deep_bl = sim_baseline.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_rf = sim_reform.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change, _ = _poverty_metrics(
        deep_poverty_baseline_rate, deep_poverty_reform_rate
    )

    # ===== COMPILE RESULTS =====
    metrics = {
        "total_cost_billions": round(total_income_change / 1e9, 2),
        "beneficiaries_millions": round(beneficiaries / 1e6, 2),
        "average_credit": round(avg_benefit, 2),
        "kicker_rate_percent": round(kicker_rate * 100, 3),
        "average_gain_winners": round(avg_benefit, 2),
    }

    winners_losers = [
        {"category": "winners", "percent": round(winners_rate, 1), "average_change": round(avg_benefit, 2)},
        {"category": "losers", "percent": round(losers_rate, 1), "average_change": 0.0},
        {"category": "unchanged", "percent": round(unchanged_rate, 1), "average_change": 0.0},
    ]

    poverty = [
        {"metric": "overall_poverty", "baseline": round(poverty_baseline_rate, 2),
         "reformed": round(poverty_reform_rate, 2), "change_pp": round(poverty_rate_change, 2)},
        {"metric": "child_poverty", "baseline": round(child_poverty_baseline_rate, 2),
         "reformed": round(child_poverty_reform_rate, 2), "change_pp": round(child_poverty_rate_change, 2)},
        {"metric": "deep_poverty", "baseline": round(deep_poverty_baseline_rate, 2),
         "reformed": round(deep_poverty_reform_rate, 2), "change_pp": round(deep_poverty_rate_change, 2)},
    ]

    return metrics, decile_data, winners_losers, poverty


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
