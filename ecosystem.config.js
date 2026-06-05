module.exports = {
  apps: [
    {
      name: 'youtube-automation',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3456
      }
    }
  ]
};
