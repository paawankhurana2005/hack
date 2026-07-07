// Angle-aware capture spec — the single source of truth for "which photos does
// the AI grader want, per category". Mirrors ai-grading/config.py's
// CATEGORY_CAPTURE so the web upload UI, the API grade route, and the trained
// model all agree on the same required/optional angles and never drift.
//
// The web renders one upload slot per angle; the API uses the same spec to flag
// a missing required angle as "needs in-person review" (the model's
// missing_required signal, enforced app-side so it survives the VLM fallback).

/** The four buckets the trained grader was trained against. */
export type GradingCategory = 'footwear' | 'electronics' | 'apparel' | 'home';

export interface CaptureAngle {
  /** Stable id sent to the grader (e.g. 'sole', 'front'). */
  id: string;
  /** Human label for the upload slot (e.g. 'Sole'). */
  label: string;
  /** Required angles gate a complete grade; missing ones → in-person review. */
  required: boolean;
  /** What this angle diagnoses — shown as a hint under the slot. */
  diagnostic: string;
}

export const CATEGORY_CAPTURE: Record<GradingCategory, CaptureAngle[]> = {
  footwear: [
    { id: 'sole', label: 'Sole', required: true, diagnostic: 'tread & outsole abrasion' },
    { id: 'top', label: 'Top', required: true, diagnostic: 'upper creasing, scuffs, toe box' },
    { id: 'heel', label: 'Heel', required: false, diagnostic: 'heel drag & counter wear' },
  ],
  electronics: [
    { id: 'front', label: 'Front', required: true, diagnostic: 'screen scratches, cracks' },
    { id: 'back', label: 'Back', required: true, diagnostic: 'casing dents, wear' },
    { id: 'edges', label: 'Edges', required: false, diagnostic: 'port & frame damage' },
  ],
  apparel: [
    { id: 'front', label: 'Front', required: true, diagnostic: 'stains, pilling, holes' },
    { id: 'back', label: 'Back', required: true, diagnostic: 'stains, wear, seams' },
    { id: 'label', label: 'Label', required: false, diagnostic: 'size/care tag, authenticity' },
  ],
  home: [
    { id: 'overall', label: 'Overall', required: true, diagnostic: 'overall condition & finish' },
    { id: 'surface', label: 'Surface', required: false, diagnostic: 'scratches, chips, coating wear' },
    { id: 'base', label: 'Base', required: false, diagnostic: 'rust, base wear, residue' },
  ],
};

// The app speaks several category vocabularies (ItemCategory, MockOrder.category,
// raw SKU-derived strings). Fold them all onto the grader's four buckets so a
// single spec drives every surface. Unknown → 'electronics' (a safe front/back
// default that reads sensibly for most boxed goods).
const GRADING_CATEGORY_ALIASES: Record<string, GradingCategory> = {
  footwear: 'footwear',
  shoes: 'footwear',
  sneakers: 'footwear',
  sports: 'footwear',
  electronics: 'electronics',
  toys: 'electronics',
  apparel: 'apparel',
  fashion: 'apparel',
  clothing: 'apparel',
  home: 'home',
  kitchenware: 'home',
  books: 'home',
};

export function toGradingCategory(category: string | null | undefined): GradingCategory {
  if (!category) return 'electronics';
  return GRADING_CATEGORY_ALIASES[category.toLowerCase()] ?? 'electronics';
}

/** The capture spec (angle list) for whatever category vocabulary you pass. */
export function captureSpecFor(category: string | null | undefined): CaptureAngle[] {
  return CATEGORY_CAPTURE[toGradingCategory(category)];
}

/** Just the required angle ids for a category. */
export function requiredAngles(category: string | null | undefined): string[] {
  return captureSpecFor(category)
    .filter((a) => a.required)
    .map((a) => a.id);
}

/** Required angles that were NOT among the photographed ones. */
export function missingRequiredAngles(
  category: string | null | undefined,
  providedAngleIds: readonly string[],
): string[] {
  const have = new Set(providedAngleIds);
  return requiredAngles(category).filter((id) => !have.has(id));
}

/** Map angle ids to their human labels (for review messages). */
export function angleLabels(category: string | null | undefined, ids: readonly string[]): string[] {
  const spec = captureSpecFor(category);
  return ids.map((id) => spec.find((a) => a.id === id)?.label ?? id);
}

/** One captured angle: its id + the base64 image (no data: prefix). */
export interface AngleImage {
  angle: string;
  imageBase64: string;
}
