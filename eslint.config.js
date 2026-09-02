const js = require('@eslint/js');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'logs/**',
      'config/flow-profile/**',
      'temp/**',
      'tmp/**',
      'uploads/**',
      'data/assets/**',
      'data/audio/**',
      'data/captions/**',
      'data/scripts/**',
      'data/videos/**',
      'data/thumbnails/**',
      'data/short-batch/**',
      'data/short-batch-cartoon/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        AbortController: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        module: 'readonly',
        process: 'readonly',
        prompt: 'readonly',
        require: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        window: 'readonly',
        document: 'readonly',
        matchMedia: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        IntersectionObserver: 'readonly',
        PointerEvent: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none'
      }]
    }
  }
];
