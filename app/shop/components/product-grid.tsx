export const ProductGrid = ({ children }: { children: React.ReactNode }) => {
  return <div className="grid grid-cols-2 md:grid-cols-3">{children}</div>;
};
