'use server';

interface EnvCheckResult {
  name: string;
  isValid: boolean;
  label: string;
}

function hasSwellStoreConfig(): boolean {
  return Boolean(
    process.env.SWELL_STORE_ID ||
      process.env.NEXT_PUBLIC_SWELL_STORE_ID ||
      process.env.SWELL_STORE_URL ||
      process.env.NEXT_PUBLIC_SWELL_STORE_URL ||
      process.env.SWELL_API_URL ||
      process.env.NEXT_PUBLIC_SWELL_API_URL
  );
}

function hasSwellPublicKey(): boolean {
  return Boolean(process.env.SWELL_PUBLIC_KEY || process.env.NEXT_PUBLIC_SWELL_PUBLIC_KEY);
}

export async function checkEnvs(): Promise<{
  envs: EnvCheckResult[];
  allValid: boolean;
}> {
  if (process.env.NODE_ENV === 'production') {
    return {
      envs: [],
      allValid: true,
    };
  }

  const envs: EnvCheckResult[] = [
    {
      name: 'SWELL_STORE_ID|NEXT_PUBLIC_SWELL_STORE_URL',
      label: 'Swell Store ID, Store URL, or API URL',
      isValid: hasSwellStoreConfig(),
    },
    {
      name: 'SWELL_PUBLIC_KEY',
      label: 'Swell Public Key',
      isValid: hasSwellPublicKey(),
    },
  ];

  const allValid = envs.every(env => env.isValid);

  return {
    envs,
    allValid,
  };
}
