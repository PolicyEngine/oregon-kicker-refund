'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type { HouseholdRequest, IncomeSourceKey } from '@/lib/types';
import ChartWatermark from './ChartWatermark';

const INCOME_SOURCE_OPTIONS: { key: IncomeSourceKey; label: string }[] = [
  { key: "capital_gains", label: "Capital gains" },
  { key: "self_employment_income", label: "Self-employment income" },
  { key: "taxable_social_security", label: "Social Security" },
  { key: "taxable_pension_income", label: "Pension income" },
  { key: "dividend_income", label: "Dividend income" },
  { key: "taxable_interest_income", label: "Taxable interest" },
  { key: "taxable_retirement_distributions", label: "Retirement distributions" },
];

export default function HouseholdCalculator() {
  const [ageHead, setAgeHead] = useState(35);
  const [ageHeadRaw, setAgeHeadRaw] = useState('35');
  const [ageSpouse, setAgeSpouse] = useState<number | null>(null);
  const [ageSpouseRaw, setAgeSpouseRaw] = useState('35');
  const [married, setMarried] = useState(false);
  const [dependentAges, setDependentAges] = useState<number[]>([]);
  const [income, setIncome] = useState(75000);
  const [additionalIncome, setAdditionalIncome] = useState<Partial<Record<IncomeSourceKey, number>>>({});
  const [selectedIncomeSources, setSelectedIncomeSources] = useState<IncomeSourceKey[]>([]);
  const [maxEarnings, setMaxEarnings] = useState(500000);
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);

  const handleAddIncomeSource = (key: IncomeSourceKey) => {
    if (!selectedIncomeSources.includes(key)) {
      setSelectedIncomeSources([...selectedIncomeSources, key]);
      setAdditionalIncome({ ...additionalIncome, [key]: 0 });
    }
  };

  const handleRemoveIncomeSource = (key: IncomeSourceKey) => {
    setSelectedIncomeSources(selectedIncomeSources.filter(k => k !== key));
    const newIncome = { ...additionalIncome };
    delete newIncome[key];
    setAdditionalIncome(newIncome);
  };

  const handleAdditionalIncomeChange = (key: IncomeSourceKey, value: number) => {
    setAdditionalIncome({ ...additionalIncome, [key]: value });
  };

  const availableIncomeSources = INCOME_SOURCE_OPTIONS.filter(
    opt => !selectedIncomeSources.includes(opt.key)
  );

  const handleMarriedChange = (value: boolean) => {
    setMarried(value);
    if (!value) {
      setAgeSpouse(null);
    } else {
      setAgeSpouse(35);
      setAgeSpouseRaw('35');
    }
  };

  const handleDependentCountChange = (count: number) => {
    const ages = [...dependentAges];
    while (ages.length < count) ages.push(10);
    ages.splice(count);
    setDependentAges(ages);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  const parseNumber = (str: string) => {
    const num = Number(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const buildRequest = (): HouseholdRequest => ({
    age_head: ageHead,
    age_spouse: married ? ageSpouse : null,
    dependent_ages: dependentAges,
    income,
    additional_income: additionalIncome,
    year: 2025,
    max_earnings: maxEarnings,
  });

  const handleCalculate = () => {
    setSubmittedRequest(buildRequest());
    setTriggered(true);
  };

  return (
    <div className="space-y-6">
      {/* Inline household config */}
      <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Your household</h2>
        <p className="text-sm text-gray-600 mb-6">
          Enter your 2024 tax year information below. Your 2025 Oregon Kicker is based on your 2024 Oregon tax liability.
        </p>

        {/* Row 1: Income, Filing status, Dependents */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {/* Employment income */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              2024 employment income
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="text"
                value={formatNumber(income)}
                onChange={(e) => setIncome(parseNumber(e.target.value))}
                className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
            {/* Add income source dropdown */}
            {availableIncomeSources.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddIncomeSource(e.target.value as IncomeSourceKey);
                  }
                }}
                className="mt-2 w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors cursor-pointer"
              >
                <option value="">+ Add other income source</option>
                {availableIncomeSources.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            )}
            {/* Additional income source inputs */}
            {selectedIncomeSources.map(key => {
              const label = INCOME_SOURCE_OPTIONS.find(opt => opt.key === key)?.label ?? key;
              return (
                <div key={key} className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input
                      type="text"
                      value={formatNumber(additionalIncome[key] ?? 0)}
                      onChange={(e) => handleAdditionalIncomeChange(key, parseNumber(e.target.value))}
                      placeholder={label}
                      className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <span className="text-xs text-gray-500 min-w-[100px]">{label}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveIncomeSource(key)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${label}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Filing status */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Filing status</label>
            <label
              htmlFor="married"
              className="flex items-center gap-3 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                id="married"
                checked={married}
                onChange={(e) => handleMarriedChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Married filing jointly</span>
            </label>
          </div>

          {/* Dependents */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Dependents</label>
            <input
              type="number"
              value={dependentAges.length}
              onChange={(e) => handleDependentCountChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        {/* Row 2: Ages (side by side when married) + Dependent ages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5 mt-5">
          {/* Your age */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Your age</label>
            <input
              type="number"
              value={ageHeadRaw}
              onChange={(e) => setAgeHeadRaw(e.target.value)}
              onBlur={() => {
                const clamped = Math.max(18, Math.min(100, parseInt(ageHeadRaw) || 18));
                setAgeHead(clamped);
                setAgeHeadRaw(String(clamped));
              }}
              min={18}
              max={100}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
          </div>

          {/* Spouse's age (shown when married) */}
          {married && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Spouse's age</label>
              <input
                type="number"
                value={ageSpouseRaw}
                onChange={(e) => setAgeSpouseRaw(e.target.value)}
                onBlur={() => {
                  const clamped = Math.max(18, Math.min(100, parseInt(ageSpouseRaw) || 18));
                  setAgeSpouse(clamped);
                  setAgeSpouseRaw(String(clamped));
                }}
                min={18}
                max={100}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          )}

          {/* Dependent ages (shown when dependents > 0) */}
          {dependentAges.length > 0 && (
            <div className={married ? "md:col-span-1" : "md:col-span-2"}>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Dependent ages</label>
              <div className="flex flex-wrap gap-2">
                {dependentAges.map((age, i) => (
                  <input
                    key={i}
                    type="number"
                    value={age}
                    onChange={(e) => {
                      const newAges = [...dependentAges];
                      newAges[i] = Math.max(0, Math.min(26, parseInt(e.target.value) || 0));
                      setDependentAges(newAges);
                    }}
                    min={0}
                    max={26}
                    className="w-16 px-2 py-2 bg-white border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    aria-label={`Dependent ${i + 1} age`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Calculate button */}
        <div className="mt-8">
          <button
            onClick={handleCalculate}
            className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 transition-all shadow-sm hover:shadow-md sm:w-auto w-full"
          >
            Calculate 2025 kicker
          </button>
        </div>
      </section>

      {/* Impact results */}
      {submittedRequest && (
        <ImpactResults
          request={submittedRequest}
          triggered={triggered}
          maxEarnings={maxEarnings}
        />
      )}
    </div>
  );
}

interface ImpactResultsProps {
  request: HouseholdRequest | null;
  triggered: boolean;
  maxEarnings?: number;
}

function ImpactResults({ request, triggered, maxEarnings }: ImpactResultsProps) {
  const { data, isLoading, error } = useHouseholdImpact(request, triggered);

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Calculating your kicker...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-800 font-semibold mb-2">Error calculating kicker</h2>
        <p className="text-red-700">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('en-US')}`;
  const formatIncome = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const xMax = maxEarnings ?? data.x_axis_max;
  const chartData = data.income_range
    .map((inc, i) => ({
      income: inc,
      or_tax_before_credits: data.or_tax_before_credits[i],
      kicker_credit: data.kicker_credit[i],
    }))
    .filter((d) => d.income <= xMax);

  const kickerInfo = data.kicker_at_income;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-primary">Your Oregon Kicker</h2>

      {/* Personal impact */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Your estimated 2025 kicker
        </h3>
        <p className="text-gray-600 mb-4">
          Based on your 2024 employment income of <strong>{formatCurrency(request?.income ?? 0)}</strong>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg p-6 border bg-gray-50 border-gray-200">
            <p className="text-sm text-gray-700 mb-2">2024 Oregon tax before credits</p>
            <p className="text-2xl font-bold text-gray-800">
              {formatCurrency(kickerInfo.or_tax_before_credits)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              This becomes the basis for your 2025 kicker
            </p>
          </div>
          <div
            className={`rounded-lg p-6 border ${
              kickerInfo.kicker_credit > 0
                ? 'bg-green-50 border-success'
                : 'bg-gray-50 border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-700 mb-2">2025 kicker credit ({(data.kicker_rate * 100).toFixed(3)}%)</p>
            <p
              className={`text-3xl font-bold ${
                kickerInfo.kicker_credit > 0 ? 'text-green-600' : 'text-gray-600'
              }`}
            >
              {formatCurrency(kickerInfo.kicker_credit)}
            </p>
            {kickerInfo.kicker_credit > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Refundable credit on your 2025 return
              </p>
            )}
          </div>
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Chart */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          2025 kicker credit by 2024 employment income
        </h3>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="kickerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#319795" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#319795" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="income"
                  type="number"
                  tickFormatter={formatIncome}
                  stroke="#666"
                  domain={[0, xMax]}
                  allowDataOverflow={false}
                  niceTicks="snap125"
                />
                <YAxis tickFormatter={formatCurrency} stroke="#666" width={80} niceTicks="snap125" />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(value as number),
                    name === 'kicker_credit' ? 'Kicker Credit' : 'OR Tax Before Credits',
                  ]}
                  labelFormatter={(value) => `Income: ${formatCurrency(value as number)}`}
                />
                <Legend
                  formatter={(value) =>
                    value === 'kicker_credit' ? 'Kicker Credit' : 'OR Tax Before Credits'
                  }
                />
                <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="kicker_credit"
                  fill="url(#kickerGradient)"
                  stroke="none"
                  name="kicker_area"
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="or_tax_before_credits"
                  stroke="#9CA3AF"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="or_tax_before_credits"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="kicker_credit"
                  stroke="#319795"
                  strokeWidth={3}
                  name="kicker_credit"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <ChartWatermark />
          </div>

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">How this is calculated</p>
        <p>
          The 2025 kicker credit equals your 2024 Oregon tax liability before credits multiplied by the kicker rate
          ({(data.kicker_rate * 100).toFixed(3)}%). The kicker is a refundable credit,
          meaning you receive the full amount even if you have no 2025 tax liability.
        </p>
      </div>
    </div>
  );
}
