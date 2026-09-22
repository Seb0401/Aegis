import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // `@aegis/contracts` se publica como ESM compilado dentro del monorepo.
  // Declararlo aquí evita sorpresas de resolución cuando Next lo empaqueta.
  transpilePackages: ['@aegis/contracts'],
};

export default config;
