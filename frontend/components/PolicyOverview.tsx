'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

// Historical kicker rates from policyengine-us parameters (odd years only)
const KICKER_HISTORY = [
  { year: 2021, rate: 0.17341 },
  { year: 2023, rate: 0.4428 },
  { year: 2025, rate: 0.09863 },
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function PolicyOverview() {

  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Oregon&apos;s Kicker Credit
        </h2>
        <p className="text-gray-700 mb-4">
          The Oregon Kicker, officially known as the Oregon Surplus Refund, is a tax provision
          that returns excess state revenue to taxpayers. When Oregon&apos;s actual revenue for a two-year
          budget period exceeds the forecasted revenue by more than 2%, the surplus is returned to
          taxpayers as a refundable credit on their state income tax return.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">When it triggers</h3>
            <p className="text-sm text-gray-600">
              The kicker is triggered when actual state revenue exceeds the forecast by more than 2%.
              It only occurs in odd years (2021, 2023, 2025, etc.) as Oregon budgets on a biennial cycle.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">How it&apos;s calculated</h3>
            <p className="text-sm text-gray-600">
              Your kicker equals your prior year&apos;s Oregon tax liability before credits multiplied
              by the kicker rate. For 2025, the rate is <strong>9.863%</strong>.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Eligibility requirements</h3>
            <p className="text-sm text-gray-600">
              You must have filed an Oregon tax return for the prior year and have a tax liability.
              You must also file a return for the current year to claim the credit.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Refundable credit</h3>
            <p className="text-sm text-gray-600">
              The kicker is a refundable credit, meaning you receive the full amount even if it
              exceeds your tax liability.
            </p>
          </div>
        </div>
      </div>

      {/* 2025 Kicker Rate */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-primary-800 mb-2">
          2025 Kicker Rate: 9.863%
        </h3>
        <p className="text-gray-700">
          For tax year 2025, Oregon will return <strong>9.863%</strong> of 2024 Oregon tax liability
          before credits. For example, if you had $5,000 in Oregon tax liability for 2024, your 2025
          kicker credit would be <strong>$493.15</strong>.
        </p>
      </div>

      {/* Historical kicker rates chart */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Historical kicker rates
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={KICKER_HISTORY} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 12 }} domain={[0, 0.5]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const rate = payload[0]?.value as number;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                      <p className="font-semibold text-gray-900 mb-2">Tax Year {label}</p>
                      <p className="text-sm text-gray-600">
                        Kicker Rate: {rate > 0 ? formatPercent(rate) : 'No kicker'}
                      </p>
                      {rate > 0 && (
                        <p className="text-sm text-gray-500 mt-1">
                          Based on {Number(label) - 1} tax liability
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="rate"
                fill="#319795"
                radius={[4, 4, 0, 0]}
                name="Kicker Rate"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartWatermark />
        <p className="text-xs text-gray-500 mt-2">
          The kicker only occurs in odd years, following Oregon&apos;s biennial budget cycle.
        </p>
      </div>

      {/* Important notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">Important notes</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700 text-sm">
          <li>The kicker is based on your Oregon tax liability before credits, not your tax paid or refund amount.</li>
          <li>Federal income taxes are not included in the kicker calculation.</li>
          <li>If you didn&apos;t file an Oregon return for the prior year, you won&apos;t receive a kicker.</li>
          <li>The kicker rate is determined after each budget cycle closes, based on actual vs. forecasted revenue.</li>
        </ul>
      </div>

      {/* Sources */}
      <div className="border-t pt-4 text-sm text-gray-500">
        <p className="font-medium mb-1">Sources</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <a
              href="https://www.oregon.gov/dor/programs/individuals/pages/kicker.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              Oregon Department of Revenue: Oregon Surplus (&quot;Kicker&quot;)
            </a>
          </li>
          <li>
            <a
              href="https://www.oregonlegislature.gov/bills_laws/Pages/OrConst.aspx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              Oregon Constitution Article IX Section 14
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
