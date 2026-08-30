class GitHubNewsAdapter {
  constructor(options = {}) {
    this.enabled = options.enabled === true;
    this.disabledReason = options.disabledReason
      || 'Official GitHub API adapter is reserved for a later phase. Unofficial trending mirrors are not used as evidence.';
  }

  async collect(source = {}) {
    return {
      items: [],
      skipped: true,
      reason: source.disabledReason || this.disabledReason
    };
  }
}

module.exports = { GitHubNewsAdapter };
