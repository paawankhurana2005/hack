// Standalone runner for the demand aggregation job — triggers one rollup now,
// without waiting for the hourly cron. Handy for tests and the seed→aggregate→
// price walkthrough.
//
// Run:  pnpm --filter @reloop/api aggregate:demand

import { runDemandAggregation } from '../jobs/computeDemandIndex.js';

runDemandAggregation()
  .then((summary) => {
    // eslint-disable-next-line no-console
    console.log('[aggregate] done:', JSON.stringify(summary));
    process.exit(0);
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[aggregate] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
