class RedditAdapter {
  constructor(options = {}) {
    this.enabled = options.enabled === true;
    this.disabledReason = options.disabledReason
      || 'Reddit stays disabled until official/authenticated access is configured.';
  }

  async collect(source = {}) {
    return {
      items: [],
      skipped: true,
      reason: source.disabledReason || this.disabledReason
    };
  }
}

module.exports = { RedditAdapter };
