# Bug Tracker & Issues

This document tracks known issues, bugs, and feature requests for the YouTube Automation Agent.

## Active Bugs (Pending)

### 1. Edge TTS Timeout on Long Scripts
**Status**: Pending
**Priority**: Medium
**Description**: When generating scripts longer than 15 minutes, the `edge-tts` command occasionally times out or truncates the audio file.
**Possible Fix**: Split the script into chunks of 1000 characters and process each chunk individually, then concatenate them with FFmpeg.

### 2. FFmpeg Transition Artifacts
**Status**: Pending
**Priority**: Low
**Description**: During the slideshow generation in Phase 3, some zoom/pan (`zoompan`) effects cause minor pixelation artifacts at the edges of the image on lower-end systems.
**Possible Fix**: Increase the output bitrate and force `scale` with `lanczos` algorithm in the FFmpeg complex filter.

## Resolved Bugs (Fixed)

### 1. `videoGenerator is undefined`
**Status**: ✅ Fixed
**Resolution**: Incorrect agent reference in `production-management-agent.js` during the Shorts generation step. Replaced `this.agents.videoGenerator` with `this.aiVideoGenerator`.

### 2. Repetitive Fallback Script Generation
**Status**: ✅ Fixed
**Resolution**: The static fallback template for the 'story' format lacked specific variations for `setup`, `conflict`, `journey`, etc., causing it to output the exact same sentence multiple times. Fixed by mapping each section to an array of random strings.

## Feature Requests
- [ ] Support for external custom background music folders.
- [ ] Multi-language support (English, Spanish) for script generation.
- [ ] Integration with Instagram/TikTok for cross-posting shorts.
