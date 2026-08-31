// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * The rule this is here for is `react-hooks/rules-of-hooks`.
 *
 * Two crashes in one day came from a hook written below an early return, so it
 * ran only on renders that got that far: "Rendered more hooks than during the
 * previous render", once on the profile screen and once on the library hero.
 * tsc cannot see it - it is a runtime contract, not a type - and nothing else
 * was checking. That rule stays an error.
 *
 * The React Compiler rules that ship alongside it are a different matter. They
 * assume a codebase without Reanimated shared values or refs written during
 * render, and this one has both by design.
 *
 * They used to fire dozens of times on correct code, which made the whole set
 * unreadable - 53 warnings nobody could triage. Every one of those sites now
 * carries its own eslint-disable and a line saying why, so the count is zero
 * and a warning that appears from here is genuinely new. Grep for
 * eslint-disable-next-line to read the deliberate ones.
 */
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'web-shims/*', '.expo/*'],
  },
  {
    rules: {
      'react-hooks/rules-of-hooks': 'error',

      // Reanimated writes shared values from worklets, and a ref assigned
      // during render is how a focus effect reads the latest callback.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      // The load paths here set state from an effect on purpose - that is what
      // fetching on mount is.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      // Native modules that throw on import unless the binary has them are
      // required lazily, inside try/catch.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
