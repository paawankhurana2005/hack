// Deterministic liquidation-lot economics trace (spec 016.1). Run:
//   pnpm --filter @reloop/api exec tsx src/scripts/lot-trace.ts
// Prints a manifested pallet's buyer auction, the manifest premium vs a mystery
// lot, and the closed-form ship-now-vs-wait verdict. No network, fully reproducible.
import {
  bestBuyer, secondBestBuyer, shipNowOrWait, type LotComposition, type Grade,
} from '@reloop/shared';

const rupees = (c: number) => '₹' + Math.round(c / 100).toLocaleString('en-IN');
const hist = (a: number, b: number, c: number, s: number): Record<Grade, number> =>
  ({ A: a, B: b, C: c, Salvage: s });

const manifested: LotComposition = {
  category: 'electronics',
  gradeHistogram: hist(6, 14, 8, 2),
  avgClearingCents: 240_000,
  manifestCoverageFrac: 0.9,
};
const mystery: LotComposition = { ...manifested, manifestCoverageFrac: 0 };

console.log('\n=== ReLoop liquidation-lot engine — deterministic pallet economics ===\n');
console.log('Pallet: 30 electronics units · avg clearing ₹2,400 · 90% Health-Card manifest\n');

const best = bestBuyer(manifested);
console.log('Winning buyer:     ', best.buyer);
console.log('  gross            ', rupees(best.grossCents));
console.log('  Amazon take (10%)', rupees(best.amazonCutCents));
console.log('  seller proceeds  ', rupees(best.sellerCents));
console.log('  term breakdown:');
for (const t of best.terms) console.log('    -', t.label.padEnd(46), rupees(t.valueCents));

const second = secondBestBuyer(manifested);
console.log('\nSecond-best (auto re-match if the deal falls through):', second?.buyer, rupees(second?.sellerCents ?? 0));

const bm = bestBuyer(manifested).sellerCents;
const bu = bestBuyer(mystery).sellerCents;
console.log('\n--- Manifest premium: graded pallet vs mystery lot (identical units) ---');
console.log('  Manifested (90% Health-Card):', rupees(bm));
console.log('  Mystery lot  (0% manifest):  ', rupees(bu));
console.log('  Premium the manifest earns:  ', rupees(bm - bu), `(+${Math.round((bm / bu - 1) * 100)}%)`);

console.log('\n--- Ship-now-vs-wait: closed-form breakeven n* = ceil(sqrt(F·lambda / (delta·v))) ---');
for (const [a, b, c, s] of [[2, 6, 3, 1], [5, 11, 6, 2], [8, 19, 11, 2]] as const) {
  const lot: LotComposition = { ...manifested, gradeHistogram: hist(a, b, c, s) };
  const n = a + b + c + s;
  const v = shipNowOrWait(lot);
  console.log(`  ${String(n).padStart(2)}/40 → shipNow=${String(v.shipNow).padEnd(5)} breakeven=${v.breakevenUnits}  ${v.reason}`);
}
console.log('');
