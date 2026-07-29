# 🏗️ Architecture Overview (Beginner-Friendly)

This document explains how the **YouTube Automation Agent** is put together,
using simple diagrams. GitHub renders the `mermaid` diagrams below automatically.

---

## 1. The Big Picture

```mermaid
flowchart TD
    User([👤 You]) -->|opens browser| Dashboard[🖥️ Dashboard<br/>localhost:3456]
    Dashboard --> Server[🧠 index.js<br/>Express Web Server]

    Clock[⏰ Scheduler<br/>node-cron] -->|runs on a timer| Server

    Server --> Agents[🤖 The 7 Agents]
    Server --> DB[(🗄️ SQLite Database<br/>data/*.db)]

    Agents -->|need keys| Creds[🔑 Credential Manager<br/>config/credentials.json + .env]

    Agents -->|talk to the internet| External[☁️ External Services]
    External --> YT[📺 YouTube Data API]
    External --> OAI[🤖 OpenAI / DALL-E / TTS]
    External --> Rep[🎬 Replicate video]
    External --> EL[🎙️ ElevenLabs / Azure voice]
```

**In plain English:** A small web server (`index.js`) starts up, loads your API
keys, wakes up 7 "agents" (just JavaScript classes), and a timer (cron) tells
them when to do their jobs. Everything they make is stored in a local database
and in the `data/` folder.

---

## 2. How One Video Gets Made (Step by Step)

This is the **content pipeline** — it runs every day at 6:00 AM automatically,
or whenever you click "generate".

```mermaid
flowchart LR
    A[1 Strategy Agent<br/>pick a topic] --> B[2 Script Writer<br/>write the words]
    B --> C[3 Thumbnail Designer<br/>make the image]
    C --> D[4 SEO Optimizer<br/>title, tags, description]
    D --> E[5 Production Manager<br/>voice + visuals + video file]
    E --> F[6 Publishing Agent<br/>upload + schedule]
    F --> G[7 Analytics Agent<br/>check views later]
    G -.->|learnings feed back| A
```

| # | Agent | What it actually does |
|---|-------|----------------------|
| 1 | **Content Strategy** | Calls the YouTube API for trending videos, picks a topic using simple scoring rules |
| 2 | **Script Writer** | Fills in **text templates** (hook → intro → body → call-to-action) |
| 3 | **Thumbnail Designer** | Asks DALL-E for an image (or makes a placeholder) |
| 4 | **SEO Optimizer** | Generates title, description, and tags with keyword rules |
| 5 | **Production Manager** | Turns the script into **voice (TTS)**, **images**, and a **video file** (or simulates them) |
| 6 | **Publishing & Scheduling** | Uploads the video to YouTube at the best time |
| 7 | **Analytics & Optimization** | Reads view counts back from YouTube to improve future choices |

---

## 3. Where the "AI" Really Lives

> ⚠️ **Important for beginners:** Most agents use **rules and templates**, not a
> large language model. The only place that calls real AI services is
> `utils/ai-video-generator.js` (images, voice, video). If you don't provide API
> keys, that file falls back to **"simulation" mode** and writes small `.info`
> placeholder files instead of real media — which is exactly what you see in the
> `data/` folder right now.

```mermaid
flowchart TD
    Prod[5 Production Manager] --> AIGEN[utils/ai-video-generator.js]
    AIGEN -->|key present?| Choice{Got API keys?}
    Choice -->|Yes| Real[Real media:<br/>DALL-E image, TTS voice, Replicate video]
    Choice -->|No| Sim[Simulation:<br/>writes a .info placeholder file]
```

---

## 4. Folder Map

```
youtube-automation-agent/
├── index.js              ⭐ Start here — web server + wiring
├── setup.js              🧙 Setup wizard (asks for keys)
├── agents/               🤖 The 7 agents (the "brains")
├── utils/
│   ├── ai-video-generator.js   🎬 The ONLY real AI media calls
│   ├── credential-manager.js   🔑 Loads/saves your keys
│   └── logger.js
├── schedules/
│   └── daily-automation.js     ⏰ The cron timer
├── database/db.js        🗄️ SQLite read/write
├── dashboard/index.html  🖥️ The web page you open
├── config/               🔑 credentials.json + tokens.json (you create these)
├── data/                 📦 Generated scripts, audio, captions (placeholders today)
└── .env                  🔑 Secret keys (you create this)
```
