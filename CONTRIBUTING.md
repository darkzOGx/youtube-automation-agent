# Contributing to YouTube Automation Agent

First off, thank you for considering contributing to the YouTube Automation Agent! It's people like you that make this community such a great place.

## How to Contribute

### 1. Reporting Bugs
This project uses `ISSUES.md` to track bugs locally. If you find a bug, please check `ISSUES.md` to see if it has already been reported. If not, feel free to open a GitHub Issue or add it to the local tracker.

When reporting a bug, please include:
- Your operating system and Node.js version.
- The exact command or API call that caused the error.
- The full stack trace from the console.
- Steps to reproduce the bug.

### 2. Suggesting Enhancements
Enhancement suggestions are tracked via GitHub issues or discussions. Provide a clear and detailed explanation of the feature you want and why it would be useful for the project.

### 3. Pull Requests
1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes (`npm test`).
5. Issue that pull request!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/youtube-automation-agent.git

# Install dependencies
npm install

# Start in development mode (with hot reloading)
npm run dev
```

### Architecture Overview
The system relies on a multi-agent architecture in the `agents/` directory:
- **Strategy Agent**: Decides what to make.
- **Script Writer**: Generates the content.
- **SEO Agent**: Optimizes metadata.
- **Production Management**: Assembles video/audio.
- **Publishing Agent**: Interfaces with YouTube APIs.

Please ensure any changes you make respect this separation of concerns.

## Code Style
- Use ES6+ syntax.
- Async/Await over Promises.
- Keep agent functions modular.

We appreciate your contributions and look forward to building the best automated YouTube management system together!
