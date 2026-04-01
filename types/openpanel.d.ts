interface OpenPanelProxy {
  (action: string, options: Record<string, unknown>): void;
  track: (event: string, properties?: Record<string, unknown>) => void;
  identify: (options: { profileId: string; firstName?: string; email?: string; properties?: Record<string, unknown> }) => void;
  setGlobalProperties: (properties: Record<string, unknown>) => void;
  q?: unknown[];
}

interface Window {
  op?: OpenPanelProxy;
}
