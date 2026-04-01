"""Aggregate impact calculations for Oregon Kicker using state microsimulation.

Uses MicroSeries throughout where possible. MicroSeries.sum() is
automatically weighted, and boolean masks preserve entity alignment.
Only drops to numpy for operations MicroSeries can't do (groupby-like
decile loops, child poverty age filtering).

Based on the Keep Your Pay Act microsimulation pattern.
"""

import json
import numpy as np
from pathlib import Path
from policyengine_us import Microsimulation
from policyengine_core.reforms import Reform

YEAR = 2024
KICKER_RATE = 0.09863  # 9.863% for 2025 kicker (based on 2024 tax filing)
DATASET = "hf://policyengine/test/mar/OR.h5"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

# API v2 intra-decile bounds and labels
_INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
_INTRA_LABELS = [
    "Lose more than 5%",
    "Lose less than 5%",
    "No change",
    "Gain less than 5%",
    "Gain more than 5%",
]
# Keys for JSON output (matching KYPA component expectations)
_INTRA_KEYS = [
    "lose_more_than_5pct",
    "lose_less_than_5pct",
    "no_change",
    "gain_less_than_5pct",
    "gain_more_than_5pct",
]


def create_kicker_reform():
    """Create reform that sets the kicker rate to 9.863% (actual 2025 rate)."""
    return Reform.from_dict({
        "gov.states.or.tax.income.credits.kicker.percent": {
            "2024-01-01.2100-12-31": KICKER_RATE
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
    """Run microsimulation and return aggregate impact data (KYPA format)."""
    print(f"Setting up simulations for {YEAR}...")

    kicker_reform = create_kicker_reform()

    # Baseline: Current law (no kicker for 2024, rate = 0%)
    sim_baseline = Microsimulation(dataset=DATASET)
    # Reform: Kicker at 9.863% rate
    sim_reform = Microsimulation(reform=kicker_reform, dataset=DATASET)

    # Inject 2024 tax as prior-year tax (the kicker is based on this)
    print("Calculating Oregon tax for 2024...")
    tax_before_credits = sim_baseline.calculate("or_income_tax_before_credits", period=YEAR)
    sim_baseline.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)
    sim_reform.set_input("or_tax_before_credits_in_prior_year", YEAR, tax_before_credits.values)

    print(f"Kicker rate: {KICKER_RATE * 100:.3f}%")

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

    # ===== INCOME DECILE ANALYSIS =====
    print("Computing distributional impact by decile...")
    decile = sim_baseline.calculate(
        "household_income_decile", period=YEAR, map_to="household"
    )

    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile == d
        d_count = float(dmask.sum())
        if d_count > 0:
            d_change_sum = float(income_change[dmask].sum())
            decile_average[str(d)] = d_change_sum / d_count
            d_baseline_sum = float(baseline_net_income[dmask].sum())
            decile_relative[str(d)] = (
                d_change_sum / d_baseline_sum
                if d_baseline_sum != 0
                else 0.0
            )
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    # Intra-decile requires person-weighted proportions — need numpy
    print("Computing intra-decile distribution...")
    people_per_hh = sim_baseline.calculate(
        "household_count_people", period=YEAR, map_to="household"
    )
    capped_baseline = np.maximum(np.array(baseline_net_income), 1)
    rel_change_arr = np.array(income_change) / capped_baseline

    decile_arr = np.array(decile)
    people_weighted = np.array(people_per_hh) * weight_arr

    intra_decile_deciles = {key: [] for key in _INTRA_KEYS}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]

        for lower, upper, key in zip(
            _INTRA_BOUNDS[:-1], _INTRA_BOUNDS[1:], _INTRA_KEYS
        ):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = (
                float(d_people[in_group].sum() / d_total_people)
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[key].append(proportion)

    intra_decile_all = {
        key: sum(intra_decile_deciles[key]) / 10
        for key in _INTRA_KEYS
    }

    # ===== POVERTY IMPACT =====
    print("Computing poverty impact...")
    pov_bl = sim_baseline.calculate("in_poverty", period=YEAR, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=YEAR, map_to="person")

    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change, poverty_percent_change = _poverty_metrics(
        poverty_baseline_rate, poverty_reform_rate
    )

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
    child_poverty_rate_change, child_poverty_percent_change = _poverty_metrics(
        child_poverty_baseline_rate, child_poverty_reform_rate
    )

    # Deep poverty
    deep_bl = sim_baseline.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_rf = sim_reform.calculate("in_deep_poverty", period=YEAR, map_to="person")
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change, deep_poverty_percent_change = _poverty_metrics(
        deep_poverty_baseline_rate, deep_poverty_reform_rate
    )

    deep_bl_arr = np.array(deep_bl).astype(bool)
    deep_rf_arr = np.array(deep_rf).astype(bool)
    deep_child_poverty_baseline_rate = _child_rate(deep_bl_arr)
    deep_child_poverty_reform_rate = _child_rate(deep_rf_arr)
    deep_child_poverty_rate_change, deep_child_poverty_percent_change = _poverty_metrics(
        deep_child_poverty_baseline_rate,
        deep_child_poverty_reform_rate,
    )

    # ===== INCOME BRACKET BREAKDOWN =====
    print("Computing income bracket breakdown...")
    agi = sim_reform.calculate(
        "adjusted_gross_income", period=YEAR, map_to="household"
    )
    agi_arr = np.array(agi)
    affected_mask_brackets = np.abs(change_arr) > 1

    income_brackets = [
        (0, 50_000, "Under $50k"),
        (50_000, 100_000, "$50k-$100k"),
        (100_000, 200_000, "$100k-$200k"),
        (200_000, 500_000, "$200k-$500k"),
        (500_000, 1_000_000, "$500k-$1M"),
        (1_000_000, 2_000_000, "$1M-$2M"),
        (2_000_000, float("inf"), "Over $2M"),
    ]

    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (
            (agi_arr >= min_inc)
            & (agi_arr < max_inc)
            & affected_mask_brackets
        )
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float(
                (change_arr[mask] * weight_arr[mask]).sum()
            )
            bracket_avg = float(
                np.average(change_arr[mask], weights=weight_arr[mask])
            )
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append({
            "bracket": label,
            "beneficiaries": bracket_affected,
            "total_cost": bracket_cost,
            "avg_benefit": bracket_avg,
        })

    # ===== COMPILE RESULTS (KYPA FORMAT) =====
    return {
        "budget": {
            "budgetary_impact": total_income_change,
            "households": total_households,
            "kicker_rate": KICKER_RATE,
        },
        "decile": {
            "average": decile_average,
            "relative": decile_relative,
        },
        "intra_decile": {
            "all": intra_decile_all,
            "deciles": intra_decile_deciles,
        },
        "total_cost": total_income_change,
        "beneficiaries": beneficiaries,
        "avg_benefit": avg_benefit,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty": {
            "poverty": {
                "all": {
                    "baseline": poverty_baseline_rate,
                    "reform": poverty_reform_rate,
                },
                "child": {
                    "baseline": child_poverty_baseline_rate,
                    "reform": child_poverty_reform_rate,
                },
            },
            "deep_poverty": {
                "all": {
                    "baseline": deep_poverty_baseline_rate,
                    "reform": deep_poverty_reform_rate,
                },
                "child": {
                    "baseline": deep_child_poverty_baseline_rate,
                    "reform": deep_child_poverty_reform_rate,
                },
            },
        },
        "by_income_bracket": by_income_bracket,
    }


def main():
    print("=" * 60)
    print("Oregon Kicker Credit Impact Analysis")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    data = calculate_aggregate_impact()

    # Save as single JSON file (like KYPA)
    filepath = OUTPUT_DIR / "aggregate_impact.json"
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved: {filepath}")

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Total cost: ${data['total_cost'] / 1e9:.2f}B")
    print(f"  Beneficiaries: {data['beneficiaries'] / 1e6:.2f}M")
    print(f"  Average credit: ${data['avg_benefit']:.2f}")
    print(f"  Kicker rate: {data['budget']['kicker_rate'] * 100:.3f}%")
    print("=" * 60)


if __name__ == "__main__":
    main()
