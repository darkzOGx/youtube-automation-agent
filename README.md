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

## 💡 How It Works - No Claude Required!

**You do NOT need Claude to use this system!** The YouTube Automation Agent is designed to work with multiple AI providers, giving you flexibility and cost control.

### 🤖 AI Provider Options

1. **OpenAI (Recommended)**
   - GPT-4 for intelligent content generation
   - DALL-E 3 for stunning thumbnails
   - Whisper for speech processing
   - **Cost**: ~$0.10-0.30 per video
   - **Best for**: Professional creators wanting highest quality

2. **Google Gemini (Budget-Friendly)**
   - Free tier: 60 requests/minute
   - Can generate multiple videos daily at no cost
   - **Cost**: FREE for most users
   - **Best for**: Beginners and hobby creators

3. **Custom AI Integration**
   - Support for Anthropic Claude (if you prefer)
   - Local models via Ollama
   - Any OpenAI-compatible API

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
| **OpenAI** | ❌ None | ~$0.20/video |
| **Google Gemini** | ✅ 60 req/min | $0.00035/1k chars |
| **Hosting** | ✅ Local PC | $5-20/month VPS |
| **Total Monthly** | **$0** | **$6-50** |

### 🖥️ Deployment Options

- **Local Computer**: Run on your PC/Mac (free)
- **Raspberry Pi**: Low-power home automation (~$50 one-time)
- **Cloud VPS**: DigitalOcean, Linode ($5/month)
- **Free Cloud**: Railway, Render (with limitations)
- **Serverless**: Vercel, Netlify (pay-per-use)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ ([Download here](https://nodejs.org/))
- Google Account (for YouTube API)
- AI Provider Account (choose one):
  - OpenAI account ([Sign up](https://platform.openai.com/signup)) OR
  - Google AI Studio account ([Sign up - FREE](https://makersuite.google.com/))
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

#### Option 2A: OpenAI API (Recommended for Quality)
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Click "API Keys" in sidebar
3. Click "Create new secret key"
4. Copy key to `.env` file as `OPENAI_API_KEY`
5. Add $5-10 credits to get started

**Pricing**: ~$0.01 per 1K tokens (approx 750 words)

#### Option 2B: Google Gemini API (FREE Alternative)
1. Visit [Google AI Studio](https://makersuite.google.com/)
2. Click "Get API Key"
3. Create API key for new or existing project
4. Copy key to `.env` file as `GEMINI_API_KEY`

**Pricing**: FREE for 60 requests/minute, perfect for most users!

### Environment Variables

```env
# Core Settings
NODE_ENV=production
PORT=3456
LOG_LEVEL=info

# AI Provider (choose one)
OPENAI_API_KEY=your-key-here
# OR
GEMINI_API_KEY=your-key-here

# YouTube Settings
YOUTUBE_REGION=US
DEFAULT_PRIVACY_STATUS=public

# Content Settings
CHANNEL_NAME=Your Channel Name
TARGET_AUDIENCE=Your target audience
POSTING_FREQUENCY=daily
```

## 🎙️ Text-to-Speech (TTS) Configuration

The system supports **4 TTS providers** with automatic fallback. Choose the one that best fits your needs:

| Provider | Quality | Cost | Setup | Best For |
|----------|---------|------|-------|----------|
| **Edge TTS** (Default) | ⭐⭐⭐ Good | Free | Zero config | Getting started quickly |
| **OpenAI TTS** | ⭐⭐⭐⭐ Great | ~$0.04/video | API Key only | Best value for quality |
| **ElevenLabs** | ⭐⭐⭐⭐⭐ Best | Freemium | API Key + Voice ID | Premium voice cloning |
| **Local API** | ⭐⭐⭐⭐⭐ Custom | Free (GPU req.) | Python + GPU | Open-source enthusiasts |

### Option 1: Edge TTS (Default — No Setup Needed)
Works out of the box. Uses Microsoft's free neural voices for Indonesian.
```env
TTS_PROVIDER=edge_tts
TTS_VOICE=id-ID-GadisNeural
```

### Option 2: OpenAI TTS (Recommended)
Warm, natural voices at very low cost (~$0.04 per video). Uses your existing OpenAI API key.
```env
TTS_PROVIDER=openai
TTS_VOICE=nova
```
Available voices: `nova` (warm), `shimmer` (soft), `alloy` (neutral), `fable` (storytelling), `echo` (clear), `onyx` (deep).

### Option 3: ElevenLabs (Premium Quality)
Best for voice cloning — clone any storytelling voice from a short audio sample.
```env
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-key-here
ELEVENLABS_VOICE_ID=your-voice-id
```

### Option 4: Local/Custom API Server (Advanced)
Run open-source TTS models (F5-TTS, XTTS v2, CosyVoice) locally on your GPU for unlimited free generation.
```env
TTS_PROVIDER=local
LOCAL_TTS_URL=http://localhost:8000
```

#### 🔌 SSH Reverse Port Forwarding (Remote GPU Setup)
If your app runs on a VPS/server but you want to use your local PC's GPU for TTS:

```
┌─────────────────────┐      SSH Reverse Tunnel       ┌──────────────────────┐
│   Ubuntu VPS        │ ←── ssh -R 8000:...:8000 ───  │   Windows PC (GPU)   │
│   (YouTube Agent)   │                                │   (F5-TTS Server)    │
│                     │                                │                      │
│  Agent sends text   │ ──→ localhost:8000/tts ──→     │  GPU processes audio │
│  to localhost:8000  │ ←── returns MP3 audio ←──      │  and returns MP3     │
└─────────────────────┘                                └──────────────────────┘
```

**SSH command (run from your Windows PC):**
```bash
ssh -R 8000:localhost:8000 user@your-vps-ip
```

> **⚠️ Troubleshooting Local TTS on Windows:** If you encounter `ERROR: Failed to build installable wheels for some pyproject.toml based projects (coqui-tts)` when installing XTTS or F5-TTS, it is because **Python 3.12 is not supported**. 
> **Solution:** Use [Miniconda](https://docs.conda.io/en/latest/miniconda.html) to create a Python 3.10 environment (`conda create -n tts_env python=3.10 -y`) OR use Docker Desktop (`docker run -it -p 8000:8000 --gpus=all daswer123/xtts-api-server:latest`).

> **💡 Tip:** You can also configure TTS directly from the web dashboard at `http://localhost:3456` — no need to edit `.env` manually!

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

To use Claude instead of OpenAI:

```javascript
// utils/ai-service.js
class ClaudeAIService {
  async generateContent(prompt) {
    return await anthropic.complete({
      model: 'claude-3-sonnet',
      prompt: prompt,
      max_tokens: 1000
    });
  }
}
```

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

**Q: How much does it cost to run?**
A: Can be completely FREE with Gemini, or ~$10-50/month with OpenAI.

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

## 🖥️ 24/7 Server Deployment (PM2)

To deploy this YouTube Automation Agent 24/7 on a remote Linux VPS or server (so that content continues to generate daily even when your personal computer is turned off), you can run it under **PM2 (Node Production Process Manager)**.

### PM2 Quick Start

1. **Install PM2 globally**:
   ```bash
   npm install -g pm2
   ```

2. **Start the agent**:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. **Configure PM2 Auto-Start on System Boot**:
   To ensure the agent launches automatically if your server reboots or goes offline:
   ```bash
   pm2 startup
   ```
   *(Copy and run the system command generated by PM2 in your terminal).*

4. **Save current running processes**:
   ```bash
   pm2 save
   ```

5. **Monitor logs & status**:
   ```bash
   pm2 status
   pm2 logs youtube-automation
   ```

## 🗺️ Roadmap & Bug Tracker

The project is being developed in 5 distinct phases. We use this roadmap to track our progress, planned features, and active bugs.

### Phase 1: Core Systems & MVP (✅ Completed)
- ✅ Setup project structure and configuration.
- ✅ Implement basic AI agents (Script, Strategy, Video).
- ✅ Integrate YouTube API (upload).
- ✅ Basic Web Dashboard.

### Phase 2: Enhanced Storytelling & Voice (✅ Completed)
- ✅ Support for 'Story' video format.
- ✅ Implement Free Google TTS (Edge TTS) integration.
- ✅ Proper Indonesian narrative script generation.

### Phase 3: Visual Generation & Editing (✅ Completed)
- ✅ Integrate Google Gemini / Imagen for AI image generation.
- ✅ Dynamic FFmpeg slideshow generation with zoom/pan effects.
- ✅ Auto-generation of thumbnails.

### Phase 4: Community & Shorts (✅ Completed)
- ✅ YouTube Shorts automatic extraction from main video.
- ✅ Automated Community Posts via YouTube API.
- ✅ Automatic Top-Level Pinned Comments on published videos.
- ✅ Smart Publishing Schedule Optimization.

### Phase 5: Self-Learning & Analytics Loop (✅ Completed)
- ✅ Analytics Agent to fetch past video performance.
- ✅ Auto-adjust titles, keywords, and topics based on top performers.
- ✅ Auto-Fallback API mechanism for high availability against Quota limits.

### Phase 6: UI Enhancements & Stability (🚧 In Progress)
- ✅ Multi-provider TTS Engine (Edge TTS, OpenAI, ElevenLabs, Local API).
- ✅ Dashboard TTS Settings Panel with live voice testing.
- ⏳ Sort Content Pipeline & History by `estimated_publish_time` and `created_date`.
- ⏳ Address FFmpeg transition artifacts and refine video rendering.
- ⏳ Implement retry mechanism for Edge TTS timeouts.

### 🐛 Active Bug Tracker (Known Issues)
Please see the dedicated [ISSUES.md](ISSUES.md) file for the full list of active bugs, feature requests, and recently resolved issues.

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

- **OpenAI** for GPT models
- **Google** for YouTube Data API and Gemini
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