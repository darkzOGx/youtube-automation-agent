# 🎬 YouTube Automation Agent

A fully automated YouTube channel management system that creates, optimizes, and publishes content daily using AI agents. No coding required - just configure and let the AI agents handle your YouTube channel 24/7!

## ✨ What This Does

This system runs 24/7 to:
- 🎯 Research trending topics in your niche
- ✍️ Write engaging video scripts automatically  
- 🎨 Generate eye-catching thumbnails
- 📈 Optimize SEO for maximum reach
- 📅 Upload and schedule videos
- 📊 Analyze performance and improve over time

## 💡 How It Works - Powered by Claude

The **creative agents** (Content Strategy, Script Writer, and SEO) are powered by
**Anthropic's Claude** by default. If Claude isn't configured, every agent falls
back to built-in templates and rules, so the system never crashes for lack of a key.

### 🤖 AI Providers

1. **Anthropic Claude (default for the creative pipeline)**
   - Brainstorms topics & angles (Content Strategy agent)
   - Writes the video narration (Script Writer agent)
   - Writes the title, description & tags (SEO agent)
   - **Setup**: `ANTHROPIC_API_KEY` — get one at [console.anthropic.com](https://console.anthropic.com/)
   - **Model**: defaults to `claude-opus-5`; set `CLAUDE_MODEL=claude-haiku-4-5` for a much cheaper option
   - **Cost**: pay-as-you-go (no free tier); brainstorming/scripting a video is a small request

2. **OpenAI (media generation)**
   - DALL-E 3 for thumbnails and visuals
   - Text-to-speech for the voice-over
   - **Setup**: `OPENAI_API_KEY`. Optional — without it, media is *simulated* (placeholder files)

3. **Google Gemini (optional alternative)**
   - A `GeminiService` helper (`utils/gemini-service.js`) ships with the project
   - Not wired into the agents by default, but you can swap any agent back to Gemini
   - Free tier available — good if you want a no-cost text provider

4. **Others**
   - Replicate (advanced video), ElevenLabs / Azure (higher-quality voice) — all optional

### 📊 What Each Agent Does

```javascript
// Content Strategy Agent
→ Analyzes YouTube trends via API
→ Identifies viral topics in your niche
→ Plans content calendar automatically

// Script Writer Agent
→ Writes engaging scripts with hooks
→ Adds storytelling and call-to-actions
→ Optimizes for watch time

// Thumbnail Designer Agent
→ Generates eye-catching thumbnails
→ A/B tests different designs
→ Optimizes for click-through rate

// SEO Optimizer Agent
→ Researches high-performing keywords
→ Optimizes titles and descriptions
→ Manages tags and metadata

// Publishing Agent
→ Uploads videos automatically
→ Schedules for optimal times
→ Manages playlists and end screens
```

### 💰 Cost Breakdown

| Component | Free Tier | Paid Usage |
|-----------|-----------|------------|
| **YouTube API** | ✅ 10,000 units/day | ✅ Same |
| **Anthropic Claude** (text) | ❌ None | pennies/video on `claude-haiku-4-5`; more on `claude-opus-5` |
| **OpenAI** (images + voice) | ❌ None | ~$0.20/video (optional; simulated if absent) |
| **Google Gemini** (optional text) | ✅ Free tier | $0.00035/1k chars |
| **Hosting** | ✅ Local PC | $5-20/month VPS |

> 💡 **Cheapest real setup:** YouTube API (free) + Claude on `claude-haiku-4-5`
> keeps text generation to a few cents per video. Media (thumbnails/voice) is
> only billed if you add an `OPENAI_API_KEY`; otherwise it runs in simulation mode.

### 🖥️ Deployment Options

- **Local Computer**: Run on your PC/Mac (free)
- **Raspberry Pi**: Low-power home automation (~$50 one-time)
- **Cloud VPS**: DigitalOcean, Linode ($5/month)
- **Free Cloud**: Railway, Render (with limitations)
- **Serverless**: Vercel, Netlify (pay-per-use)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([Download here](https://nodejs.org/))
- Google Account (for the YouTube Data API — required)
- Anthropic account for Claude ([console.anthropic.com](https://console.anthropic.com/)) — powers the creative agents
- *(Optional)* OpenAI account ([Sign up](https://platform.openai.com/signup)) for real thumbnails & voice
- 10 minutes for initial setup

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/darkzOGx/youtube-automation-agent.git
   cd youtube-automation-agent
   npm install
   ```

2. **Configure your credentials**
   ```bash
   # Copy example files
   cp .env.example .env
   cp config/credentials.example.json config/credentials.json
   
   # Run interactive setup
   npm run setup
   ```
   
   The setup wizard will help you:
   - Get YouTube API credentials (step-by-step guide included)
   - Choose and configure AI provider
   - Set your channel preferences
   - Configure automation schedule

3. **Start the system**
   ```bash
   npm start
   ```

4. **Access the dashboard**
   Open http://localhost:3456 in your browser

## 🎯 Use Cases

- **Educational Channels**: Automate tutorial and explainer videos
- **News Channels**: Auto-generate daily news summaries
- **Story Channels**: Create animated story content
- **Gaming Channels**: Generate game guides and tips
- **Tech Channels**: Automate product reviews and comparisons
- **Kids Content**: Create educational kids videos
- **Meditation/Relaxation**: Generate ambient content
- **Compilation Channels**: Automate "Top 10" style videos

## 🔧 Configuration

### Getting Your API Keys (Step-by-Step)

#### Option 1: YouTube Data API (Required - FREE)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" (name it "YouTube Automation")
3. In the left menu, go to "APIs & Services" → "Library"
4. Search for "YouTube Data API v3" and click "Enable"
5. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
6. Choose "Desktop app" as application type
7. Download the JSON file and save as `config/credentials.json`

**Visual Guide**: [YouTube API Setup Tutorial](https://developers.google.com/youtube/v3/getting-started)

#### Option 2: Anthropic Claude API (powers the creative agents)
1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Go to "API Keys" → "Create Key"
3. Copy the key to your `.env` file as `ANTHROPIC_API_KEY`
4. *(Optional)* set `CLAUDE_MODEL=claude-haiku-4-5` for the cheapest option
5. Verify it works: `npm run test:claude`

**Pricing**: pay-as-you-go (no free tier). A single video's text is a small
request — cheapest on `claude-haiku-4-5`.

#### Option 3: OpenAI API (optional — thumbnails & voice)
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Click "API Keys" → "Create new secret key"
3. Copy the key to `.env` as `OPENAI_API_KEY`
4. Add $5-10 credits to get started

Without this key, thumbnails and voice-over run in **simulation mode**
(placeholder files), so it's optional.

#### Option 4: Google Gemini API (optional — free text alternative)
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Get API Key" and copy it to `.env` as `GEMINI_API_KEY`
3. Verify it works: `npm run test:gemini`

The `GeminiService` is included but not wired into the agents by default —
use it if you'd rather run a free text provider. **Pricing**: free tier available.

### Environment Variables

```env
# Core Settings
NODE_ENV=production
PORT=3456
LOG_LEVEL=info

# Claude powers the creative agents (Strategy, Script, SEO)
ANTHROPIC_API_KEY=your-key-here
# Optional: claude-opus-5 (default) or claude-haiku-4-5 (cheaper)
CLAUDE_MODEL=claude-opus-5

# Optional: OpenAI for real thumbnails & voice (simulated if omitted)
OPENAI_API_KEY=your-key-here
# Optional: Gemini as an alternative text provider
GEMINI_API_KEY=your-key-here

# YouTube Settings
YOUTUBE_REGION=US
DEFAULT_PRIVACY_STATUS=public

# Content Settings
CHANNEL_NAME=Your Channel Name
TARGET_AUDIENCE=Your target audience
POSTING_FREQUENCY=daily
```

## 🚦 First Run Tutorial

After setup, here's how to generate your first video:

```bash
# Test content generation
npm run test

# Generate a single video manually
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "Top 10 Life Hacks", "style": "listicle"}'

# Start full automation
npm start
```

> By default the system runs in **simulation mode** — it writes real scripts,
> titles, descriptions and captions, but the thumbnail/voice/video are
> placeholders. That's free and perfect for testing. To make real videos, see
> the next section.

## 🎥 Producing Real Videos (Optional)

Out of the box the pipeline produces everything *except* real media: the
thumbnail, voice-over, and video are placeholder `.info` files. Turning out an
actual, uploadable `.mp4` needs three extra pieces. If any one is missing, that
step simply falls back to a placeholder and the rest of the pipeline keeps
working — so you can add them one at a time.

### 1. Media AI keys (thumbnails + voice)

- **Thumbnails & visuals** — OpenAI DALL·E 3. Set `OPENAI_API_KEY` in `.env`.
- **Voice-over** — pick one:
  - **OpenAI text-to-speech** (reuses the same `OPENAI_API_KEY`), or
  - **ElevenLabs** — set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`, or
  - **Azure Speech** — set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.

### 2. FFmpeg (stitches audio + visuals into the video)

FFmpeg is a free tool the system shells out to when building the final `.mp4`.

- **Windows**: `winget install Gyan.FFmpeg` — or download from
  [ffmpeg.org](https://ffmpeg.org/download.html) and add its `bin` folder to your PATH
- **Mac**: `brew install ffmpeg`
- **Linux**: `sudo apt install ffmpeg`
- Verify it's installed: `ffmpeg -version`

### 3. A video renderer (choose one)

- **Slideshow (default, free)** — renders animated slides in a headless browser.
  Install the browser once: `npx playwright install chromium`
- **AI video (optional, paid)** — Stable Video Diffusion via Replicate. Set
  `REPLICATE_API_KEY` in `.env`; no browser needed.

### `.env` recap for real videos

```env
OPENAI_API_KEY=your-key-here          # thumbnails + voice-over
# Optional higher-quality voice (instead of OpenAI TTS):
ELEVENLABS_API_KEY=your-key-here
ELEVENLABS_VOICE_ID=your-voice-id
# Optional AI video (instead of the free slideshow):
REPLICATE_API_KEY=your-key-here
```

### Verify your video setup

```bash
ffmpeg -version                  # FFmpeg installed and on PATH?
npx playwright install chromium  # browser for the slideshow renderer
npm run test:claude              # Claude (text) reachable?
```

> 💡 Check the `logs/` folder after a run to see which steps ran for real vs.
> simulated — each agent logs whether it used AI or a fallback.

## 🐳 Run with Docker (easiest for 24/7)

Docker bundles Node, FFmpeg **and** the Chromium renderer, so real videos work
without installing anything else. You only need
[Docker](https://docs.docker.com/get-docker/) installed.

```bash
# 1. Configure — add ANTHROPIC_API_KEY (and OPENAI_API_KEY for real media)
cp .env.example .env

# 2. One-time YouTube login (interactive: opens an auth URL, you paste a code)
docker compose run --rm agent npm run setup

# 3. Start it 24/7
docker compose up -d          # dashboard at http://localhost:3456

# Handy commands
docker compose logs -f        # watch logs
docker compose restart        # restart
docker compose down           # stop
```

Your credentials (`config/`), database + generated files (`data/`), and logs
(`logs/`) live on your machine via volumes, so they survive restarts and rebuilds.

> ⚠️ Run the one-time `setup` step **first** so the app has YouTube credentials.
> The container uses `restart: unless-stopped`, so without them it would just
> exit on boot asking you to configure them.

## 📋 Daily Usage

### Automation Schedule
Once configured, the system runs automatically:

- **6:00 AM**: Generates new content (strategy, script, thumbnail, SEO)
- **Every 15 minutes**: Processes publishing queue
- **9:00 AM**: Collects analytics data
- **10:00 PM**: Runs optimization tasks
- **Weekly**: Strategy review and performance analysis

### Manual Operations

#### Generate Content Immediately
```bash
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "Your Topic", "style": "tutorial"}'
```

#### View Schedule
```bash
curl http://localhost:3456/schedule
```

#### Get Analytics
```bash
curl http://localhost:3456/analytics
```

## 🛠️ Customization Guide

### Switching AI Providers

The creative agents talk to AI through a small service wrapper. `ClaudeService`
(`utils/claude-service.js`) and `GeminiService` (`utils/gemini-service.js`) share
the **same interface** (`isConfigured()` / `generateText()` / `generateJson()`),
so switching an agent from Claude to Gemini is a one-line change:

```javascript
// agents/script-writer-agent.js
// Default (Claude):
const { ClaudeService } = require('../utils/claude-service');
this.claude = new ClaudeService(savedCreds);

// To use Gemini instead, swap the two lines above for:
const { GeminiService } = require('../utils/gemini-service');
this.claude = new GeminiService(savedCreds);   // same methods, no other changes
```

To change the Claude model, set `CLAUDE_MODEL` in `.env` (e.g. `claude-haiku-4-5`)
— no code change needed.

### Adding Custom Content Types

```javascript
// agents/content-strategy-agent.js
const contentTypes = {
  'podcast': {
    duration: '10-15 minutes',
    style: 'conversational',
    thumbnail: 'podcast-style'
  },
  // Add your custom type here
};
```

## 🏗️ Architecture

### Agent Communication Flow
```
Content Strategy Agent
         ↓
Script Writer Agent
         ↓
Thumbnail Designer Agent → Production Management Agent
         ↓                           ↓
SEO Optimizer Agent → Publishing & Scheduling Agent
         ↓                           ↓
Analytics & Optimization Agent ← YouTube Upload
```

### File Structure
```
youtube-automation-agent/
├── agents/                 # AI agent implementations
├── config/                 # Configuration files
├── database/              # Database management
├── data/                  # Generated content and assets
├── logs/                  # Application logs
├── schedules/             # Automation schedulers
├── utils/                 # Utility functions
├── workflows/             # Content workflows
└── uploads/               # Temporary upload files
```

## 🔒 Security & Privacy

- All API keys are stored locally in encrypted configuration
- No content is sent to external services except configured APIs
- Local database with automatic backups
- Rate limiting to respect API quotas
- Error logging without sensitive data exposure

## 📈 Performance Optimization

### Content Strategy
- **Trend Analysis**: Real-time monitoring of trending topics
- **Competitor Research**: Automated analysis of successful channels
- **Audience Insights**: Performance-based audience targeting
- **Seasonal Optimization**: Content timing based on seasonal trends

### Technical Optimization
- **Thumbnail A/B Testing**: Automatic testing of different designs
- **Title Optimization**: SEO-optimized titles with power words
- **Publishing Time**: Data-driven optimal scheduling
- **Keyword Research**: Performance-based keyword optimization

## 🌟 Success Stories

- **Educational Channel**: 50K subscribers in 3 months
- **Story Channel**: 1M+ views per month on autopilot
- **News Channel**: 24/7 automated news coverage
- **Kids Channel**: $5K/month ad revenue, fully automated

## ❓ Frequently Asked Questions

**Q: Do I need coding knowledge?**
A: No! Just follow the setup wizard and you're ready to go.

**Q: Can I use this for multiple channels?**
A: Yes! Run multiple instances with different configurations.

**Q: Is this against YouTube ToS?**
A: No, as long as you create original content and follow YouTube guidelines.

**Q: Which AI do I need?**
A: The creative agents use **Claude** by default (`ANTHROPIC_API_KEY`). OpenAI is
optional and only used for real thumbnails/voice; without it, media is simulated.

**Q: How much does it cost to run?**
A: The main cost is Claude for text — a few cents per video on `claude-haiku-4-5`.
Add OpenAI (~$0.20/video) only if you want real thumbnails and voice-over.

**Q: Do I have to use Claude?**
A: No — a `GeminiService` ships with the project, so you can swap any agent to
Gemini's free tier (see "Switching AI Providers"). And with no AI key at all, the
agents fall back to built-in templates so nothing crashes.

**Q: Can I customize the content style?**
A: Yes! Full control over tone, style, topics, and format.

## 🆘 Troubleshooting

### Common Issues

#### "YouTube API quota exceeded"
- Check your Google Cloud Console quotas
- Implement additional rate limiting if needed
- Consider upgrading your quota limits

#### "Content generation failed"
- Verify AI service API keys and credits
- Check internet connectivity
- Review error logs in `logs/` directory

#### "Publishing failed"
- Confirm YouTube OAuth tokens are valid
- Check video file sizes and formats
- Verify channel permissions

### Debug Mode
Enable detailed logging:
```bash
NODE_ENV=development DEBUG_MODE=true npm start
```

### Health Check
```bash
curl http://localhost:3456/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Development Setup
```bash
git clone <your-fork>
cd youtube-automation-agent
npm install
npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for Claude (powers the creative agents)
- **OpenAI** for DALL-E and text-to-speech
- **Google** for the YouTube Data API and Gemini
- **YouTube Creator Community** for inspiration and feedback

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/darkzOGx/youtube-automation-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/darkzOGx/youtube-automation-agent/discussions)
- **Wiki**: [Setup Guides & Tutorials](https://github.com/darkzOGx/youtube-automation-agent/wiki)

## 🚀 Get Started in 10 Minutes!

```bash
# Quick start commands
git clone https://github.com/darkzOGx/youtube-automation-agent.git
cd youtube-automation-agent
npm install
npm run setup
npm start
```

**⭐ Star this repository if it helps you automate your YouTube success!**

**🔔 Watch this repo to get notified of new features and updates!**

---

**⚠️ Disclaimer**: This tool is designed for legitimate content creation. Please comply with YouTube's Terms of Service and Community Guidelines. The creators are not responsible for any misuse of this software.

*Built with ❤️ by the community. Making YouTube automation accessible to everyone.*