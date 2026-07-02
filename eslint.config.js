const js = require('@eslint/js');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'temp/**',
      'tmp/**',
      'uploads/**',
      'data/assets/**',
      'data/audio/**',
      'data/captions/**',
      'data/scripts/**',
      'data/videos/**',
      'data/thumbnails/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        Buffer: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        window: 'readonly',
        document: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
];