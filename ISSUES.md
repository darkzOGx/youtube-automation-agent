# Bug Tracker & Issues

This document tracks known issues, bugs, and feature requests for the YouTube Automation Agent.

## Active Bugs (Pending)

### 1. Image Generation Prompt Inaccuracy
**Status**: Pending
**Priority**: Medium
**Description**: The generated AI images sometimes do not fully reflect the action in the narration (e.g., narration says "Mira is drawing a small bridge", but the generated image shows "Mira and her friend playing on a small bridge").
**Possible Fix**: Improve the prompt extraction algorithm in `extractScriptSegments` by using an LLM to parse the narration specifically into an English image prompt focused on the *main action* rather than just concatenating the raw narration text.

### 2. Edge TTS Timeout on Long Scripts
**Status**: Pending
**Priority**: Medium
**Description**: When generating scripts longer than 15 minutes, the `edge-tts` command occasionally times out or truncates the audio file.
**Possible Fix**: Split the script into chunks of 1000 characters and process each chunk individually, then concatenate them with FFmpeg.

### 3. FFmpeg Transition Artifacts
**Status**: Pending
**Priority**: Low
**Description**: During the slideshow generation in Phase 3, some zoom/pan (`zoompan`) effects cause minor pixelation artifacts at the edges of the image on lower-end systems.
**Possible Fix**: Increase the output bitrate and force `scale` with `lanczos` algorithm in the FFmpeg complex filter.

## Resolved Bugs (Fixed)

### 1. Narration and Slide Timing Not Synchronized
**Status**: ✅ Fixed (June 2, 2026)
**Resolution**: Implemented *Per-Segment Processing* in the FFmpeg generation pipeline. The script is now split per-sentence/paragraph, TTS is generated individually, and FFmpeg reads the exact duration of each audio segment to perfectly sync the slideshow rendering speed before concatenation.

### 2. Skip Thumbnail Error on Shorts
**Status**: ✅ Fixed (June 2, 2026)
**Resolution**: Fixed a `Cannot read properties of null (reading 'path')` error in `processThumbnail` when processing YouTube Shorts by adding correct null checks and properly returning a 'skipped' status instead of overriding it to 'completed'.

### 3. `videoGenerator is undefined`
**Status**: ✅ Fixed
**Resolution**: Incorrect agent reference in `production-management-agent.js` during the Shorts generation step. Replaced `this.agents.videoGenerator` with `this.aiVideoGenerator`.

### 4. Repetitive Fallback Script Generation
**Status**: ✅ Fixed
**Resolution**: The static fallback template for the 'story' format lacked specific variations for `setup`, `conflict`, `journey`, etc., causing it to output the exact same sentence multiple times. Fixed by mapping each section to an array of random strings.

### 5. Quota Exceeded on YouTube API (Fallback)
**Status**: ✅ Fixed
**Resolution**: The dashboard and background agents threw `403 Quota Exceeded` when fetching channels or uploading. Implemented an auto-fallback `switchToNextYouTubeAuth()` mechanism in `CredentialManager` with array-based credentials.

## Feature Requests
- [x] Sort Content Pipeline & History table by `estimated_publish_time` and `created_date`.
- [ ] Support for external custom background music folders.
- [ ] Multi-language support (English, Spanish) for script generation.
- [ ] Integration with Instagram/TikTok for cross-posting shorts.
