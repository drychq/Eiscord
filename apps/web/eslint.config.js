import baseConfig from '@eiscord/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../app/*',
                '../../app/*',
                '../../../app/*',
                '../features/*',
                '../../features/*',
                '../../../features/*',
              ],
              message: 'shared code must not depend on app or feature layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../app/*', '../../app/*', '../../../app/*'],
              message: 'feature code must not depend on the app layer.',
            },
          ],
        },
      ],
    },
  },
];
