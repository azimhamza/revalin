import { ResearchDisclaimerPopup } from './components/research-disclaimer-popup';

export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ResearchDisclaimerPopup />
      {children}
    </>
  );
}
