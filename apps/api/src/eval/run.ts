// Offline eval CLI: `pnpm eval`. Runs the deterministic decision layers against the
// synthetic seed, prints a labelled report, and writes eval/report.json at the repo
// root. No NVIDIA key, no network — fully reproducible. This is the baseline later
// ML phases must beat.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEval } from './metrics.js';

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src/eval
const repoRoot = join(here, '..', '..', '..', '..');
const outDir = join(repoRoot, 'eval');
const outFile = join(outDir, 'report.json');

const report = runEval();

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/* eslint-disable no-console */
console.log('\nReLoop eval — deterministic baseline  (synthetic seed)\n');
console.log(`Grading aggregation        (N=${report.grading.n})`);
console.log(`  exact-grade accuracy     ${pct(report.grading.exactAccuracy)}`);
console.log(`  within-1-grade accuracy  ${pct(report.grading.within1Accuracy)}`);
console.log(`  abstention rate          ${pct(report.grading.abstentionRate)}`);
console.log(`\nConfidence calibration     (N=${report.calibration.n})`);
console.log(`  temperature (pinned)     ${report.calibration.temperature}  (grid-best ${report.calibration.gridBestTemperature})`);
console.log(`  ECE   ${report.calibration.eceBefore.toFixed(3)} → ${report.calibration.eceAfter.toFixed(3)}`);
console.log(`  Brier ${report.calibration.brierBefore.toFixed(3)} → ${report.calibration.brierAfter.toFixed(3)}`);
console.log(`\nPricing policy             (N=${report.pricing.n})`);
console.log(`  MAE                      ₹${report.pricing.maeRupees.toLocaleString('en-IN')}`);
console.log(`  MAPE                     ${report.pricing.mapePct}%`);
console.log(`  interval coverage        ${report.pricing.intervalCoverage}`);
console.log(`\nResale-ratio model (GBDT)  (N=${report.pricingModel.n}, held-out)`);
console.log(`  MAE (pp of retail)       model ${report.pricingModel.modelMaePp}  vs  baseline ${report.pricingModel.baselineMaePp}`);
console.log(`  improvement over baseline ${report.pricingModel.improvementPct}%`);
console.log(`  interval coverage        ${pct(report.pricingModel.intervalCoverage)}  (target ${pct(report.pricingModel.nominalCoverage)})`);
console.log(`\nRouting hard-rule conformance (N=${report.routing.n})`);
console.log(`  forced-path accuracy     ${pct(report.routing.accuracy)}`);
if (report.routing.mismatches.length > 0) {
  for (const m of report.routing.mismatches) {
    console.log(`    ✗ ${m.id}: expected ${m.expected}, got ${m.got}`);
  }
}
console.log(`\nRouting EV optimization     (N=${report.routingEv.n}, viable paths)`);
console.log(`  argmax-EV selection      ${pct(report.routingEv.optimality)}`);
console.log(`  distinct paths chosen    ${report.routingEv.distinctPaths}  [${report.routingEv.chosen.join(', ')}]`);
console.log(`\nReturn-risk classifier     (N=${report.returnRisk.n}, held-out)`);
console.log(`  AUC                      model ${report.returnRisk.auc}  vs  category-prior ${report.returnRisk.baselineAuc}`);
console.log(`\nProvenance flywheel        (${report.flywheel.chains} sample chains)`);
console.log(`  labelled training rows   ${report.flywheel.totalRows}  [grading ${report.flywheel.gradingRows} · pricing ${report.flywheel.pricingRows} · routing ${report.flywheel.routingRows}]`);
console.log(`\nRufus RAG grounding`);
console.log(`  grounding checks passed  ${report.rufusGrounding.passed}/${report.rufusGrounding.checks}`);
console.log(`\nDrift watchdog (PSI)`);
console.log(`  stable   PSI ${report.drift.psiStable} → ${report.drift.actionStable}`);
console.log(`  shifted  PSI ${report.drift.psiShifted} → ${report.drift.actionShifted}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote ${outFile}\n`);
/* eslint-enable no-console */
