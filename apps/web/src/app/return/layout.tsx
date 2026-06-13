export default function ReturnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-navy-700 bg-navy-800">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Return flow
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
