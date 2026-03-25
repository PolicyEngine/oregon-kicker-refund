'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type { HouseholdRequest } from '@/lib/types';
import ChartWatermark from './ChartWatermark';

export default function HouseholdCalculator() {
  const [ageHead, setAgeHead] = useState(35);
  const [ageHeadRaw, setAgeHeadRaw] = useState('35');
  const [ageSpouse, setAgeSpouse] = useState<number | null>(null);
  const [ageSpouseRaw, setAgeSpouseRaw] = useState('35');
  const [married, setMarried] = useState(false);
  const [dependentAges, setDependentAges] = useState<number[]>([]);
  const [income, setIncome] = useState(75000);
  const [maxEarnings, setMaxEarnings] = useState(250000);
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);

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
        <h2 className="text-xl font-bold text-gray-900 mb-6">Your household</h2>

        {/* Row 1: Income, Age, Filing status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {/* Employment income */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Employment income
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
          </div>

          {/* Age */}
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

          {/* Married + spouse age */}
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
            {married && (
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
                placeholder="Spouse age"
                aria-label="Spouse age"
                className="w-full mt-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            )}
          </div>
        </div>

        {/* Row 2: Dependents */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5 mt-5">
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
            {dependentAges.length > 0 && (
              <div className="mt-2">
                <span className="block text-xs font-medium text-gray-500 mb-1">Age(s)</span>
                <div className="grid grid-cols-3 gap-1.5">
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
                      className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                      placeholder={`Age ${i + 1}`}
                      aria-label={`Dependent ${i + 1} age`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Empty columns for alignment */}
          <div />
          <div />
        </div>

        {/* Calculate button */}
        <div className="mt-8">
          <button
            onClick={handleCalculate}
            className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 transition-all shadow-sm hover:shadow-md sm:w-auto w-full"
          >
            Calculate kicker
          </button>
        </div>
      </section>

      {/* Chart x-axis options */}
      {triggered && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Chart x-axis max:</span>
          {[100000, 250000, 500000, 1000000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxEarnings(v);
                setSubmittedRequest((prev) => (prev ? { ...prev, max_earnings: v } : null));
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                maxEarnings === v
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}
            </button>
          ))}
        </div>
      )}

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
              <LineChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="income"
                  type="number"
                  tickFormatter={formatIncome}
                  stroke="#666"
                  domain={[0, xMax]}
                  allowDataOverflow={false}
                />
                <YAxis tickFormatter={formatCurrency} stroke="#666" width={80} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'kicker_credit' ? 'Kicker Credit' : 'OR Tax Before Credits',
                  ]}
                  labelFormatter={(value: number) => `Income: ${formatCurrency(value)}`}
                />
                <Legend
                  formatter={(value) =>
                    value === 'kicker_credit' ? 'Kicker Credit' : 'OR Tax Before Credits'
                  }
                />
                <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
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
              </LineChart>
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
