'use client';

import { useState } from 'react';
import HouseholdCalculator from '@/components/HouseholdCalculator';
import PolicyOverview from '@/components/PolicyOverview';
import AggregateImpact from '@/components/AggregateImpact';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'policy' | 'calculator' | 'statewide'>('policy');

  const TAB_CONFIG = [
    { id: 'policy' as const, label: 'How it works' },
    { id: 'calculator' as const, label: 'Household calculator' },
    { id: 'statewide' as const, label: 'Statewide impact' },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-700 via-primary-500 to-primary-400 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            Oregon Kicker Refund Calculator
          </h1>
          <p className="text-lg opacity-90">
            Calculate your Oregon surplus revenue credit
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4 overflow-x-auto" role="tablist">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-t-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          className="bg-white rounded-lg shadow-md p-6"
        >
          {activeTab === 'policy' && <PolicyOverview />}
          {activeTab === 'calculator' && <HouseholdCalculator />}
          {activeTab === 'statewide' && <AggregateImpact />}
        </div>
      </div>
    </main>
  );
}
