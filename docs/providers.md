# AI providers

YouTube Automation Agent runs on your own API keys. One text provider is enough to start. Narration, images, and AI video are optional layers on top. Pick providers in `npm run walkthrough`, or set their keys in `.env` ([`.env.example`](../.env.example) documents every setting).

## Text

Pick one in the walkthrough, or set its key in `.env`. The SDK base URL is configured for you. The first model listed for each provider is its default; override any text model with `AI_MODEL` (or `GEMINI_MODEL` / `OPENAI_MODEL`).

| Provider | Default & selectable models | Key | Env var |
| --- | --- | --- | --- |
| **Google Gemini** | `gemini-4-hydrogen` (default, free tier), `gemini-4-neon` (paid), `gemini-4-carbon` (paid), `gemini-3.8-flash`, `gemini-3.5-flash-lite` | [AI Studio](https://aistudio.google.com/apikey) | `GEMINI_API_KEY` |
| **OpenAI** | `gpt-6.2-sol` (default), `gpt-6.2-astra`, `gpt-6.1-terra`, `gpt-6-luna` | [platform.openai.com](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` |
| **OpenRouter** | `openai/gpt-6.2-sol` (default) plus 400+ models; curated defaults verified against OpenRouter's live catalog (`anthropic/claude-fable-5.2`, `anthropic/claude-sonnet-5.5`, `google/gemini-4-hydrogen`, `moonshotai/kimi-k3.1-pro`, `z-ai/glm-5.3`, `deepseek/deepseek-v4.1-flash`, `minimax/minimax-m3.1-flash`) | [openrouter.ai](https://openrouter.ai/keys) | `OPENROUTER_API_KEY` |
| **Atlas Cloud** | `qwen/qwen3.5-flash` (default), `deepseek-ai/deepseek-v4-pro` (OpenAI-compatible gateway) | [console.atlascloud.ai](https://www.atlascloud.ai/console/api-keys) | `ATLASCLOUD_API_KEY` |
| **Kimi (Moonshot AI)** | `kimi-k3.1-pro` (default), `kimi-k3.1-pro-highspeed`, `kimi-k3` | [platform.kimi.ai](https://platform.kimi.ai) | `MOONSHOT_API_KEY` |
| **MiMo (Xiaomi)** | `mimo-v2.6-pro` (default), `mimo-v2.6-flash`, `mimo-v2.6-pro-ultraspeed` | [mimo.mi.com](https://mimo.mi.com) | `MIMO_API_KEY` |
| **GLM (Zhipu AI)** | `glm-5.3` (default), `glm-5.3-flash`, `glm-5.3-prime` | [z.ai](https://z.ai) | `GLM_API_KEY` |
| **DeepSeek** | `deepseek-flash` (default, DeepSeek-V4.1-Flash), `deepseek-v4-pro` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `DEEPSEEK_API_KEY` |
| **MiniMax** | `MiniMax-M3.1-Flash` (default), `MiniMax-M3` | [platform.minimax.io](https://platform.minimax.io/user-center/basic-information/interface-key) | `MINIMAX_TEXT_API_KEY` |

Anthropic Claude is available through OpenRouter (`anthropic/claude-fable-5.2`, `anthropic/claude-sonnet-5.5`, `anthropic/claude-opus-5.5`). OpenRouter, Atlas Cloud, Kimi, MiMo, GLM, DeepSeek, and MiniMax cover scripts only. Add a Gemini or OpenAI key for images and narration, or ElevenLabs for narration.

> **MiniMax keys:** Text generation uses `MINIMAX_TEXT_API_KEY`; video generation uses `MINIMAX_API_KEY`. They are separate on purpose so existing Gemini users with a MiniMax H3 video key aren't silently switched to MiniMax text.

## Narration and images

- **Narration** uses the first configured provider in this order:
  1. **ElevenLabs** — `eleven_v4` by default (override with `ELEVENLABS_TTS_MODEL`, e.g., `eleven_v4_turbo` or `eleven_v3`; requires `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`).
  2. **OpenAI** — `gpt-4o-mini-tts` (note: OpenAI has scheduled legacy HTTP TTS models for retirement in January 2027; prefer ElevenLabs or Gemini for new setups).
  3. **Gemini** — `gemini-3.8-flash-tts` by default (override with `GEMINI_TTS_MODEL`, e.g., `gemini-3.8-flash-lite-tts`, and `GEMINI_TTS_VOICE`).
  A video without working narration can't be approved.
- **Images** use OpenAI (`gpt-image-2.6-flare` by default; override with `OPENAI_IMAGE_MODEL=gpt-image-2.6-sunburst` for higher consistency) and Gemini (`gemini-3.1-flash-image` / Nano Banana 2, which needs billing enabled; override with `GEMINI_IMAGE_MODEL`, e.g., `gemini-3.1-pro-image` or `gemini-3.1-flash-lite-image`), each falling back to the other. With neither, slides use gradient backgrounds and thumbnails come from the built-in designer.

## Video

Local slideshow rendering is the default, so you never pay for video unless you choose a provider in **Channel setup** and set a paid-seconds cap. If a provider fails, the video falls back to the local slideshow.

| Provider | Default model | Best fit | Clip limits | Env var | Model override |
| --- | --- | --- | --- | --- | --- |
| ByteDance | `bytedance/seedance-2.5` through Replicate | Cinematic long scenes and large reference sets | 4–30 seconds | `REPLICATE_API_TOKEN` | `SEEDANCE_MODEL` |
| MiniMax | `MiniMax-H3` | Multimodal references, native stereo audio, optional 2K | 4–15 seconds | `MINIMAX_API_KEY` | `MINIMAX_VIDEO_MODEL` |
| Google | `gemini-omni-1.2-flash` | Fast generation, native audio, and conversational editing | 3–15 seconds | `GEMINI_API_KEY` | `GEMINI_VIDEO_MODEL` |
| Kuaishou | `kling-v4-0` | Long storyboards, multi-keyframe, and character/voice consistency | 3–30 seconds | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` | `KLING_VIDEO_MODEL` |
| Alibaba | `wan3.0-video` | Unified text, image, reference video, and continuation | 2–30 seconds | `DASHSCOPE_API_KEY` | `WAN_VIDEO_MODEL` |

Long videos use hybrid assembly: generated clips for the hook and key sections, with the rest of the timeline filled locally. See [AI video generation](features.md#ai-video-generation).

## Environment variables

`npm run walkthrough` writes your configuration for you. To edit it by hand, copy [`.env.example`](../.env.example) to `.env`. The essentials:

```env
# One text provider (see the table above)
GEMINI_API_KEY=...
# Optional text model override
# GEMINI_MODEL=gemini-4-hydrogen

# Optional: narration, images, and AI video
# ELEVENLABS_API_KEY=...
# ELEVENLABS_VOICE_ID=...
# ELEVENLABS_TTS_MODEL=eleven_v4
# OPENAI_API_KEY=sk-...
# OPENAI_IMAGE_MODEL=gpt-image-2.6-flare
# VIDEO_PROVIDER=slideshow   # auto, seedance, minimax_h3, google_omni, kling, wan
# VIDEO_MAX_GENERATED_SECONDS=60

# App
PORT=3456
# HOST=127.0.0.1             # default: this machine only
# API_KEY=some-long-random-string
CHANNEL_NAME=Your Channel Name
DEFAULT_PRIVACY_STATUS=private
```

The dashboard listens on `127.0.0.1` by default. If you set `HOST=0.0.0.0` to reach it from other devices, also set `API_KEY`, which every request that changes something must then send in the `x-api-key` header.

## Adding a provider

See [Extending](../CONTRIBUTING.md#extending) in the contributing guide for how to add a text or video provider.

## Acknowledgments

- [Google](https://ai.google.dev/): Gemini 4 Hydrogen, Gemini 4 Neon, Gemini 4 Carbon, Gemini 3.8 Flash, Gemini 3.1 Flash Image, Gemini 3.8 Flash TTS, Gemini Omni 1.2 Flash, and the YouTube Data and Analytics APIs
- [OpenAI](https://openai.com/): GPT-6.2 Sol, GPT-6.2 Astra, GPT Image 2.6, gpt-4o-mini-tts
- [Anthropic](https://www.anthropic.com/): Claude Fable 5.2, Claude Sonnet 5.5, and Claude Opus 5.5 (via OpenRouter)
- [OpenRouter](https://openrouter.ai/): unified multi-model API
- [Moonshot AI](https://www.moonshot.ai/): Kimi K3.1 Pro
- [Xiaomi](https://mimo.mi.com/): MiMo V2.6 Pro
- [Zhipu AI](https://z.ai/): GLM-5.3
- [DeepSeek](https://www.deepseek.com/): DeepSeek V4.1 Flash and V4 Pro
- [MiniMax](https://www.minimax.io/): MiniMax M3.1 Flash text and H3 video
- [ElevenLabs](https://elevenlabs.io/): Eleven v4 TTS
- [Replicate](https://replicate.com/): Seedance 2.5 hosting
- [Kuaishou Kling](https://kling.ai/): Kling 4.0
- [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/): Wan 3.0
