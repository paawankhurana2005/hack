'use client';

/** Shared catalog controls: a search box + category chips. Used by Store and the
 *  Mesh borrow grid so filtering looks and behaves identically on both surfaces. */
export function FilterBar({
  groups,
  active,
  onSelect,
  query,
  onQuery,
  placeholder = 'Search products…',
  resultCount,
}: {
  /** Category labels (without the leading "All"). */
  groups: string[];
  /** Currently selected group, or null for "All". */
  active: string | null;
  onSelect: (group: string | null) => void;
  query: string;
  onQuery: (q: string) => void;
  placeholder?: string;
  /** Optional count shown beside the search box. */
  resultCount?: number;
}) {
  return (
    <div className="mb-8 space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-full border border-border bg-card/60 py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand"
          >
            Clear
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="All" selected={active === null} onClick={() => onSelect(null)} />
        {groups.map((g) => (
          <Chip key={g} label={g} selected={active === g} onClick={() => onSelect(g)} />
        ))}
        {typeof resultCount === 'number' && (
          <span className="ml-auto self-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
        selected
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-border text-muted-foreground hover:border-brand/60 hover:text-brand'
      }`}
    >
      {label}
    </button>
  );
}
