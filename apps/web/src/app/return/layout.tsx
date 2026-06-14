import Link from 'next/link';
import { PackageIcon } from '@/components/return/icons';

export default function ReturnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/return" className="flex items-center gap-2.5 group">
            <span className="grid size-8 place-items-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/20">
              <PackageIcon className="h-4 w-4" />
            </span>
            <span className="font-mono text-xs uppercase tracking-widest text-brand">
              Return flow
            </span>
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
            Powered by ReLoop
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
