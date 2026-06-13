import type { Money } from '@reloop/shared';

/** INR paise → "₹1,234". Shared formatter for the user-app surfaces. */
export function formatMoney(m: Money): string {
  return `₹${(m.amountCents / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}
