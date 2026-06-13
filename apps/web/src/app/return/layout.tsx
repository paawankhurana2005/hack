export default function ReturnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-widest text-brand">Return flow</p>
        </div>
      </div>
      {children}
    </div>
  );
}
