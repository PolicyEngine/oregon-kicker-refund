'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

// App-v2 color tokens
const COLORS = {
  gainMore5: '#285E61',    // primary-700
  gainLess5: '#31979599',  // primary-500 @ 60%
  noChange: '#E2E8F0',     // gray-200
  loseLess5: '#9CA3AF',    // gray-400
  loseMore5: '#4B5563',    // gray-600
  positive: '#319795',     // primary-500
  negative: '#4B5563',     // gray-600
};

// Shared chart margins
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };

// Shared axis tick style
const TICK_STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 12 };

interface AggregateData {
  budget: {
    budgetary_impact: number;
    households: number;
    kicker_rate: number;
  };
  decile: {
    average: Record<string, number>;
    relative: Record<string, number>;
  };
  intra_decile: {
    all: Record<string, number>;
    deciles: Record<string, number[]>;
  };
  total_cost: number;
  beneficiaries: number;
  avg_benefit: number;
  winners: number;
  losers: number;
  winners_rate: number;
  losers_rate: number;
  poverty: {
    poverty: {
      all: { baseline: number; reform: number };
      child: { baseline: number; reform: number };
    };
    deep_poverty: {
      all: { baseline: number; reform: number };
      child: { baseline: number; reform: number };
    };
  };
  by_income_bracket: {
    bracket: string;
    beneficiaries: number;
    total_cost: number;
    avg_benefit: number;
  }[];
}

// Custom tooltip component
function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 4,
      padding: '8px 12px',
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
    }}>
      {label && <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1A202C' }}>{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color || '#4A5568' }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
        </p>
      ))}
    </div>
  );
}

export default function AggregateImpact() {
  const [data, setData] = useState<AggregateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'fiscal' | 'distributional' | 'winners' | 'poverty'>('fiscal');
  const [distMode, setDistMode] = useState<'relative' | 'absolute'>('relative');

  useEffect(() => {
    async function loadData() {
      try {
        const basePath = '/us/oregon-kicker-refund';
        const res = await fetch(`${basePath}/data/aggregate_impact.json`);
        if (!res.ok) {
          throw new Error(`Failed to load data: ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
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
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading statewide impact data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-gray-800 font-semibold mb-2">Statewide impact data not available</h3>
        <p className="text-gray-600 font-medium mb-2">{error}</p>
        <p className="text-sm text-gray-500 mt-4">
          Precomputed data has not been generated yet. Run: <code>python scripts/generate_impacts.py</code>
        </p>
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatCurrencyWithSign = (value: number) => {
    const formatted = `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const formatBillions = (value: number) => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return formatCurrencyWithSign(value);
  };

  // Section tabs
  const sections = [
    { key: 'fiscal' as const, label: 'Budgetary impact' },
    { key: 'distributional' as const, label: 'Distributional impact' },
    { key: 'winners' as const, label: 'Winners & losers' },
    { key: 'poverty' as const, label: 'Poverty impact' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Statewide impact analysis</h2>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== FISCAL IMPACT ===== */}
      {activeSection === 'fiscal' && (
        <div className="space-y-6">
          {/* Budget headline */}
          <div className="rounded-lg p-6 border bg-green-50 border-green-300 max-w-md">
            <p className="text-sm text-gray-700 mb-2">Budgetary impact (2025)</p>
            <p className="text-3xl font-bold text-green-600">
              {formatBillions(data.budget.budgetary_impact)}
            </p>
          </div>

          {/* Income bracket table */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Impact by income bracket</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left px-4 py-3 font-medium text-gray-900">Income bracket</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Affected households</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Total impact</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Average impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.by_income_bracket.map((bracket, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">{bracket.bracket}</td>
                      <td className="px-4 py-3 text-gray-700 text-right">{Math.round(bracket.beneficiaries).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.total_cost >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatBillions(bracket.total_cost)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-right"
                        style={{ color: bracket.avg_benefit >= 0 ? COLORS.positive : COLORS.negative }}>
                        {formatCurrencyWithSign(bracket.avg_benefit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== DISTRIBUTIONAL IMPACT ===== */}
      {activeSection === 'distributional' && (() => {
        const isRelative = distMode === 'relative';
        const rawValues = isRelative
          ? Object.values(data.decile.relative).map(v => v * 100)
          : Object.values(data.decile.average);
        const maxAbs = Math.max(...rawValues.map(Math.abs));
        const niceStep = (() => {
          const rough = maxAbs / 3;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;
        const symmetricDomain = [-niceMax, niceMax];
        const niceTicks = Array.from(
          { length: Math.round(2 * niceMax / niceStep) + 1 },
          (_, i) => -niceMax + i * niceStep,
        );
        const chartData = isRelative
          ? Object.entries(data.decile.relative).map(([k, v]) => ({ decile: k, value: v * 100 }))
          : Object.entries(data.decile.average).map(([k, v]) => ({ decile: k, value: v }));

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Impact by income decile</h3>
              <div className="flex gap-1">
                {(['relative', 'absolute'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDistMode(mode)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      distMode === mode
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {mode === 'relative' ? 'Relative' : 'Absolute'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-gray-700">
              {isRelative
                ? 'Change in household net income as a percentage of baseline income, by decile.'
                : 'Average change in household net income in dollars, by decile.'}
            </p>
            <div className="bg-white border rounded-lg p-6">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="decile" tick={TICK_STYLE} stroke="#A0AEC0" label={{ value: 'Income decile', position: 'insideBottom', offset: -15, style: { ...TICK_STYLE, fill: '#718096' } }} />
                  <YAxis
                    domain={symmetricDomain}
                    ticks={niceTicks}
                    tickFormatter={isRelative
                      ? (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
                      : formatCurrencyWithSign}
                    tick={TICK_STYLE}
                    stroke="#A0AEC0"
                    width={isRelative ? 60 : 80}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip formatter={isRelative
                    ? (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                    : (v) => formatCurrencyWithSign(v)} />}
                  />
                  <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                  <Bar dataKey="value" name={isRelative ? 'Relative impact (% of income)' : 'Average impact'} radius={[2, 2, 0, 0]}>
                    {rawValues.map((v, i) => (
                      <Cell key={i} fill={v >= 0 ? COLORS.positive : COLORS.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
            </div>
          </div>
        );
      })()}

      {/* ===== WINNERS & LOSERS ===== */}
      {activeSection === 'winners' && (() => {
        const intra = data.intra_decile;
        const categories = [
          { key: 'gain_more_than_5pct', label: 'Gain more than 5%', color: COLORS.gainMore5 },
          { key: 'gain_less_than_5pct', label: 'Gain less than 5%', color: COLORS.gainLess5 },
          { key: 'no_change', label: 'No change', color: COLORS.noChange },
          { key: 'lose_less_than_5pct', label: 'Lose less than 5%', color: COLORS.loseLess5 },
          { key: 'lose_more_than_5pct', label: 'Lose more than 5%', color: COLORS.loseMore5 },
        ] as const;

        const stackedData = [
          {
            label: 'All',
            ...Object.fromEntries(categories.map(c => [c.key, (intra.all[c.key] * 100)])),
          },
          ...Array.from({ length: 10 }, (_, i) => {
            const d = 10 - i;
            return {
              label: `${d}`,
              ...Object.fromEntries(categories.map(c => [c.key, (intra.deciles[c.key][d - 1] * 100)])),
            };
          }),
        ];

        return (
          <div className="space-y-6">
            {/* Headline */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#F0FDFA', borderColor: COLORS.positive }}>
                <p className="text-sm text-gray-700 mb-2">Winners</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.gainMore5 }}>{data.winners_rate.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                <p className="text-sm text-gray-700 mb-2">No change</p>
                <p className="text-3xl font-bold text-gray-600">
                  {(100 - data.winners_rate - data.losers_rate).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#F9FAFB', borderColor: COLORS.loseMore5 }}>
                <p className="text-sm text-gray-700 mb-2">Losers</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.loseMore5 }}>{data.losers_rate.toFixed(1)}%</p>
              </div>
            </div>

            {/* Stacked bar chart by decile */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Winners & losers by income decile</h3>
              <div className="bg-white border rounded-lg p-6">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={stackedData} layout="vertical" stackOffset="expand" barSize={24} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis type="number" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={TICK_STYLE} stroke="#A0AEC0" />
                    <YAxis type="category" dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" width={40} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                    {categories.map((c) => (
                      <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <ChartWatermark />
                {/* Custom legend */}
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4A5568' }}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== POVERTY IMPACT ===== */}
      {activeSection === 'poverty' && (() => {
        const pov = data.poverty;
        const povertyMetrics = [
          {
            label: 'Overall poverty',
            baseline: pov.poverty.all.baseline,
            reform: pov.poverty.all.reform,
          },
          {
            label: 'Child poverty',
            baseline: pov.poverty.child.baseline,
            reform: pov.poverty.child.reform,
          },
          {
            label: 'Deep poverty',
            baseline: pov.deep_poverty.all.baseline,
            reform: pov.deep_poverty.all.reform,
          },
          {
            label: 'Deep child poverty',
            baseline: pov.deep_poverty.child.baseline,
            reform: pov.deep_poverty.child.reform,
          },
        ];

        const chartData = povertyMetrics.map((m) => {
          const pctChange = m.baseline !== 0 ? ((m.reform - m.baseline) / m.baseline) * 100 : 0;
          return { ...m, pctChange };
        });

        const pctValues = chartData.map(d => d.pctChange);
        const minVal = Math.min(0, ...pctValues);
        const maxVal = Math.max(0, ...pctValues);
        const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal), 0.1);
        const niceStep = (() => {
          const rough = maxAbs / 3;
          if (rough < 0.1) return 0.1;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMin = Math.floor(minVal / niceStep) * niceStep;
        const niceMax = Math.ceil(maxVal / niceStep) * niceStep;
        const niceTicks = Array.from(
          { length: Math.round((niceMax - niceMin) / niceStep) + 1 },
          (_, i) => niceMin + i * niceStep,
        );

        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Change in poverty rates (%)</h3>
              <div className="bg-white border rounded-lg p-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" />
                    <YAxis domain={[niceMin, niceMax]} ticks={niceTicks} tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} tick={TICK_STYLE} stroke="#A0AEC0" width={70} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} />} />
                    <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                    <Bar dataKey="pctChange" name="Change (%)" radius={[2, 2, 0, 0]}>
                      {chartData.map((m, i) => (
                        <Cell key={i} fill={m.pctChange <= 0 ? COLORS.positive : COLORS.negative} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ChartWatermark />
              </div>
            </div>
          </div>
        );
      })()}

      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
        These estimates are static: they do not capture behavioral responses such as changes in labor supply, tax avoidance, or migration.
      </p>
    </div>
  );
}
