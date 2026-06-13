// Listing Agent narration: the LLM phrases ONE plain-English sentence explaining
// the action the deterministic engine already chose. Logic decides, the model
// narrates. A template fallback guarantees a sentence even if the model fails.

import type { AgentNarrateRequest } from '@reloop/shared';
import type { Config } from '../../config.js';
import { nvidiaChat } from '../nvidia/client.js';

const SYSTEM_PROMPT = `You are ReLoop's autonomous listing agent. You have just taken an action on a
second-hand listing to help it sell. Write EXACTLY ONE plain-English sentence, in
the first person ("I"), explaining what you did and why, using the specific
numbers given. Maximum 28 words. No jargon, no markdown, no quotes.`;

function inr(cents: number | undefined): string {
  if (cents === undefined) return '';
  return `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;
}

export function fallbackNarration(req: AgentNarrateRequest): string {
  switch (req.action) {
    case 'reprice':
      return `I lowered the price from ${inr(req.priceFromCents)} to ${inr(
        req.priceToCents,
      )} to close the gap to the ${inr(req.comparableCents)} comparable, staying above the ${inr(
        req.floorCents,
      )} floor.`;
    case 'widen_radius':
      return `Price is competitive, so I widened the match radius to ${req.radiusKm}km to reach demand beyond the neighbourhood.`;
    case 'improve_listing':
      return `Lots of views but no offers — I flagged the listing for stronger photos or more detail.`;
    case 'escalate_route':
      return `Resale isn't viable at the ${inr(req.floorCents)} floor, so I recommend ${
        req.routeRecommendation === 'recycle' ? 'recycling' : 'donating'
      } it to recover value and avoid landfill.`;
    default:
      return req.diagnosis;
  }
}

export async function narrateAgentDecision(
  cfg: Config,
  req: AgentNarrateRequest,
): Promise<string> {
  const userMsg = JSON.stringify({
    action: req.action,
    diagnosis: req.diagnosis,
    priceFrom: inr(req.priceFromCents),
    priceTo: inr(req.priceToCents),
    floor: inr(req.floorCents),
    comparable: inr(req.comparableCents),
    demand: req.demand,
    radiusKm: req.radiusKm,
    route: req.routeRecommendation,
    daysListed: req.day,
    item: req.title,
  });

  try {
    const text = await nvidiaChat(cfg, {
      model: cfg.PRICING_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      maxTokens: 80,
      temperature: 0.4,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return cleaned || fallbackNarration(req);
  } catch {
    return fallbackNarration(req);
  }
}
