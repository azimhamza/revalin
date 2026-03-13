export function COAGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3">
      {children}
    </div>
  );
}
