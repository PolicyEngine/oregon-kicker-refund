# Oregon Kicker Refund Calculator

A household calculator to estimate your Oregon Kicker (Surplus Revenue Credit) based on your employment income and household situation.

## What is the Oregon Kicker?

The Oregon Kicker is a unique tax provision that returns excess state revenue to taxpayers when actual revenue exceeds the forecast by more than 2%. It occurs only in odd years (2021, 2023, 2025, etc.) as part of Oregon's biennial budget cycle.

The kicker credit equals your prior year's Oregon tax liability before credits multiplied by the kicker rate:
- **2025**: 9.863% rate
- **2023**: 44.28% rate
- **2021**: 17.341% rate

## Features

- **How it Works**: Explains the Oregon Kicker mechanism, eligibility, and historical rates
- **Household Calculator**: Calculates your estimated kicker based on:
  - Employment income
  - Filing status (single/married)
  - Number and ages of dependents
  - Tax year selection

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Charts**: Recharts
- **API**: www.policyengine.org's dashboard API, through [`@policyengine/api-client`](https://www.npmjs.com/package/@policyengine/api-client), which forwards household calculations to the PolicyEngine Public API
- **State Management**: TanStack Query

## Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Run the unit tests (Vitest)
npm test
```

The app runs at http://localhost:3009. Pages on `localhost` call the production dashboard API at www.policyengine.org, which allows them; no credential is needed.

## Deployment

This app is designed to be deployed on Vercel at `policyengine.org/us/oregon-kicker-refund`.

```bash
cd frontend
npm run build
```

## Data Sources

- The 2025 kicker rate (9.863%) is fixed in the calculator; it is the 2025 value of policyengine-us's `gov.states.or.tax.income.credits.kicker.percent` parameter
- Oregon tax calculations by the PolicyEngine Public API, reached through www.policyengine.org's dashboard API
- Official information from [Oregon Department of Revenue](https://www.oregon.gov/dor/programs/individuals/pages/kicker.aspx)
