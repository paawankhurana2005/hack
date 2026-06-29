// Phase 7 — end-to-end integration trace for the dynamic reprice engine.
// Drives one listing through its lifecycle and prints every step:
//   event → significance filter → reward model → bandit → guardrails → narration →
//   outcome → reward → bandit update. Run: pnpm --filter api reprice:trace
//
// Uses the deterministic in-process reward model, so it needs no Python and no network.

import type { DemandEvent, DemandEventType, PricingStateVector } from '@reloop/shared';
import { RepriceEngine, type RepriceRequest } from '../services/pricing/reprice-engine.js';
import { HeuristicRewardModel } from '../services/pricing/reward-model.js';
import { isSignificant } from '../services/pricing/reprice-events.js';

const LISTING_ID = 'lst_demo_iphone13';

function baseState(over: Partial<PricingStateVector> = {}): RepriceRequest['state'] {
  return {
    category: 'Electronics',
    gradeKey: 'good',
    compMedianPrice: 18000,
    amazonNewPrice: 25000,
    sellerFloor: 9000,
    routeElsewhereValue: 7000,
    viewVelocity24h: 6,
    ...over,
  };
}

function event(type: DemandEventType, payload: Record<string, unknown> = {}): DemandEvent {
  return { type, listingId: LISTING_ID, timestamp: new Date().toISOString(), payload };
}

async function main(): Promise<void> {
  const engine = new RepriceEngine(new HeuristicRewardModel(), 'heuristic-v1');

  // The full state the significance filter reads (the engine fills defaults itself).
  const filterState = {
    ...baseState(),
    compMinPrice: 15300,
    viewVelocity24h: 6,
  } as unknown as PricingStateVector;

  // event, optional state override, expected significance for narration
  const steps: { ev: DemandEvent; state?: Partial<PricingStateVector>; reprices: number }[] = [
    { ev: event('initial_listing'), reprices: 0 },
    { ev: event('comp_listed', { price: 17500 }), reprices: 1 }, // NOT significant (>95% of median)
    { ev: event('dwell_threshold', { daysOnMarket: 7 }), state: { daysOnMarket: 7 }, reprices: 1 },
    { ev: event('comp_listed', { price: 15000 }), reprices: 2 }, // significant (undercuts >5%)
    { ev: event('view_velocity_drop', { currentVelocity: 1 }), reprices: 3 },
    { ev: event('heartbeat'), reprices: 4 },
  ];

  console.log('=== Phase 7 — Dynamic Reprice: End-to-End Trace ===');
  console.log(`Listing ${LISTING_ID} · Electronics/good · median ₹18000 · floor ₹9000 · new ₹25000\n`);

  let step = 0;
  for (const { ev, state, reprices } of steps) {
    step += 1;
    const significant = isSignificant(ev, { ...filterState, ...state } as PricingStateVector);
    console.log(`[${step}] event=${ev.type}  significant=${significant ? 'YES' : 'no (dropped)'}`);
    if (!significant) {
      console.log('     → filter dropped it; engine never woke.\n');
      continue;
    }

    const decision = await engine.decide({
      listingId: LISTING_ID,
      event: ev,
      state: baseState({ numReprices: reprices, ...state }),
    });
    const fired = decision.guardrailsApplied.filter((g) => g.triggered).map((g) => g.rule);
    console.log(
      `     reward/arm: ${[0.78, 0.85, 0.92, 1.0, 1.1]
        .map((a) => `${a}:₹${Math.round(decision.predictedRewards[a as 0.78])}`)
        .join('  ')}`,
    );
    console.log(`     arm=${decision.chosenArm}×  raw=₹${Math.round(decision.rawPrice)}  →  final=₹${decision.finalPrice}`);
    console.log(`     guardrails: ${fired.length ? fired.join(', ') : 'none'}`);
    console.log(`     “${decision.reason}”\n`);
  }

  // The item sells locally after the last reprice → log the outcome.
  console.log('--- outcome: sold locally at ₹15300 after 9 days on market ---');
  const before = engine.getBanditState(LISTING_ID);
  const { reward, bucketUpdated } = engine.logOutcome({
    listingId: LISTING_ID,
    decisionId: 'n/a',
    arm: 0.85,
    finalPrice: 15300,
    sold: true,
    daysOnMarket: 9,
    reward: 0,
    soldLocally: true,
    rerouted: false,
  });
  const after = engine.getBanditState(LISTING_ID);
  console.log(`reward = ₹${reward}  (margin − holding·days + carbon)   bucketUpdated=${bucketUpdated}`);
  console.log(`bandit obs for 0.85 arm: before=${before?.armObservations[0.85]} → after=${after?.armObservations[0.85]}`);
  console.log(`logged outcomes (next-retrain rows): ${engine.loggedOutcomeCount}`);
  console.log('\nThat row joins the training log. At ~500 rows XGBoost retrains — the loop.');
}

void main();
