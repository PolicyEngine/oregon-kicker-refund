'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

interface Metrics {
  total_cost_billions: number;
  beneficiaries_millions: number;
  average_credit: number;
  average_gain_winners: number;
  baseline_revenue_billions: number;
  reformed_revenue_billions: number;
  kicker_rate_percent: number;
}

interface DistributionalData {
  decile: number;
  total_change_billions: number;
  avg_change_per_hh: number;
  households_millions: number;
}

interface WinnersLosers {
  category: string;
  percent: number;
  average_change: number;
}

interface PovertyData {
  metric: string;
  baseline: number;
  reformed: number;
  change_pp: number;
}

async function loadCSV<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const val = values[i];
      obj[h] = isNaN(Number(val)) ? val : Number(val);
    });
    return obj as T;
  });
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  }
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function AggregateImpact() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [distributional, setDistributional] = useState<DistributionalData[]>([]);
  const [winnersLosers, setWinnersLosers] = useState<WinnersLosers[]>([]);
  const [poverty, setPoverty] = useState<PovertyData[]>([]);
  const [viewMode, setViewMode] = useState<'absolute' | 'relative'>('absolute');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [metricsData, distData, wlData, povData] = await Promise.all([
          loadCSV<{ metric: string; value: number }>('/us/oregon-kicker-refund/data/metrics.csv'),
          loadCSV<DistributionalData>('/us/oregon-kicker-refund/data/distributional_impact.csv'),
          loadCSV<WinnersLosers>('/us/oregon-kicker-refund/data/winners_losers.csv'),
          loadCSV<PovertyData>('/us/oregon-kicker-refund/data/poverty_impact.csv'),
        ]);

        const metricsObj: Record<string, number> = {};
        metricsData.forEach(m => { metricsObj[m.metric] = m.value; });
        setMetrics(metricsObj as unknown as Metrics);
        setDistributional(distData);
        setWinnersLosers(wlData);
        setPoverty(povData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary-500 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading impact data...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-700">Failed to load impact data.</p>
      </div>
    );
  }

  const winners = winnersLosers.find(w => w.category === 'winners');
  const povertyImpact = poverty[0];

  // Calculate relative change per decile (as % of baseline)
  const chartData = distributional.map(d => ({
    decile: `D${d.decile}`,
    value: viewMode === 'absolute' ? d.avg_change_per_hh : (d.avg_change_per_hh / 1000) * 100, // rough relative %
    total: d.total_change_billions * 1e9,
  }));

  return (
    <div className="space-y-8">
      {/* Summary Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Statewide Impact of the 2025 Oregon Kicker
        </h2>
        <p className="text-gray-700 mb-6">
          These estimates are based on PolicyEngine's microsimulation model using the 2022 Current Population Survey,
          calibrated to Oregon's population and income distribution.
        </p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <p className="text-sm text-gray-600 mb-1">Total Cost to State</p>
          <p className="text-2xl font-bold text-green-700">${metrics.total_cost_billions}B</p>
          <p className="text-xs text-gray-500 mt-1">Returned to taxpayers</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <p className="text-sm text-gray-600 mb-1">Beneficiaries</p>
          <p className="text-2xl font-bold text-blue-700">{metrics.beneficiaries_millions}M</p>
          <p className="text-xs text-gray-500 mt-1">Tax units receiving credit</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
          <p className="text-sm text-gray-600 mb-1">Average Credit</p>
          <p className="text-2xl font-bold text-purple-700">${Math.round(metrics.average_credit)}</p>
          <p className="text-xs text-gray-500 mt-1">Among recipients</p>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-5">
          <p className="text-sm text-gray-600 mb-1">Kicker Rate</p>
          <p className="text-2xl font-bold text-teal-700">{metrics.kicker_rate_percent}%</p>
          <p className="text-xs text-gray-500 mt-1">Of 2024 tax liability</p>
        </div>
      </div>

      {/* Distributional Impact */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Impact by Income Decile
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('absolute')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'absolute'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              $ per household
            </button>
            <button
              onClick={() => setViewMode('relative')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'relative'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Total ($B)
            </button>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="decile" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) => viewMode === 'absolute' ? `$${v}` : `$${(v / 1e9).toFixed(2)}B`}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value, name) => {
                  const numValue = value as number;
                  if (viewMode === 'absolute') {
                    return [`$${Math.round(numValue).toLocaleString()}`, 'Avg. per household'];
                  }
                  return [`$${(numValue / 1e9).toFixed(3)}B`, 'Total'];
                }}
                labelFormatter={(label) => `Income Decile ${String(label).replace('D', '')}`}
              />
              <Bar
                dataKey={viewMode === 'absolute' ? 'value' : 'total'}
                fill="#319795"
                radius={[4, 4, 0, 0]}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill="#319795" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartWatermark />
        <p className="text-xs text-gray-500 mt-2">
          Decile 1 = lowest income, Decile 10 = highest income. Higher-income households receive larger credits
          because the kicker is proportional to tax liability.
        </p>
      </div>

      {/* Winners and Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Winners & Losers</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Households gaining</span>
              <span className="text-green-600 font-semibold">{winners?.percent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full"
                style={{ width: `${winners?.percent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Average gain among winners</span>
              <span className="text-gray-700 font-medium">${Math.round(winners?.average_change ?? 0)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            No households lose from the kicker credit as it is a refundable tax credit.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Poverty Impact</h3>
          {povertyImpact && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Baseline poverty rate</span>
                <span className="text-gray-700 font-semibold">{povertyImpact.baseline.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">With kicker credit</span>
                <span className="text-gray-700 font-semibold">{povertyImpact.reformed.toFixed(2)}%</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Change</span>
                  <span className="text-green-600 font-bold">{povertyImpact.change_pp} pp</span>
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-4">
            The kicker has a modest impact on poverty rates because it is proportional to tax liability,
            which is lower for low-income households.
          </p>
        </div>
      </div>

      {/* Methodology Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">Methodology</p>
        <p>
          These estimates use PolicyEngine's microsimulation model with the 2022 Current Population Survey (CPS).
          The baseline scenario eliminates the kicker credit, while the reform represents current law (9.863% rate).
          Since the kicker is based on prior-year tax liability, we use current-year Oregon tax as a proxy.
        </p>
      </div>
    </div>
  );
}
