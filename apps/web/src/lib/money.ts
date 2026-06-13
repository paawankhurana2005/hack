import type { Money } from '@reloop/shared';

/** USD cents → "$1,234.56". Shared formatter for the user-app surfaces. */
export function formatMoney(m: Money): string {
  return `$${(m.amountCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
