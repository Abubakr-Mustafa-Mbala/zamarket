// Two checks, both of which exist because of bugs that actually shipped.
//
//   rules-of-hooks  — a hook called conditionally throws React error #310 at
//                     runtime, which is a blank page, not a warning. This has
//                     happened twice on this project: once in OfferingBuilder,
//                     once on the marketplace homepage, and the second time it
//                     came back through a merge. The linter is the only thing
//                     that catches it before a customer does.
//   no-undef        — a component used in JSX without being imported builds
//                     perfectly and then renders nothing. That was the
//                     original black admin page.
//
// Run both with `npm run check`, which also runs the tests.
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, process: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'no-undef': 'error',
    },
  },
]
