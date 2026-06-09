// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  // Global ignores must be in their own object (flat-config rule).
  { ignores: ['dist/*', 'node_modules/*', '.expo/*', 'start-expo.js', 'eslint.config.js'] },
  expoConfig,
  {
    rules: {
      // Apostrophes in copy are intentional; RN <Text> renders them fine.
      'react/no-unescaped-entities': 'off',
      // `Buffer` is provided by the RN/Node polyfill at runtime.
      'no-undef': 'off',
      // Circular-import breaks in the Zustand stores are deliberate
      // (authStore ↔ appStore ↔ diaryStore). These requires are load-bearing.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      // React-Compiler-era rules (eslint-config-expo 56). Too aggressive to gate an
      // existing codebase on. Keep the high-value rules (no-unused-vars,
      // exhaustive-deps) loud; silence the experimental ones.
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },
]);
