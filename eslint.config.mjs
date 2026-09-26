// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // El signer del agente y los secretos nunca deben acabar en un log.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Utilidades que se lanzan a mano con node (capturas, logo). Imprimir por
    // consola no es un descuido: es toda su interfaz. Y como no pasan por
    // TypeScript, hay que decirle a ESLint qué globales existen.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        // El código que va dentro de `page.evaluate` corre en el navegador.
        window: 'readonly',
        document: 'readonly',
        Image: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
);
