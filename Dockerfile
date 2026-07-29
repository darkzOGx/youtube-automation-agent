# YouTube Automation Agent — container image
# Includes Node.js, FFmpeg (video/audio muxing) and a Chromium browser
# (the slideshow renderer), so it can produce real videos out of the box.

FROM node:20-bookworm-slim

# System packages:
#  - ffmpeg: stitches audio + visuals into the final .mp4
#  - python3/make/g++: build native npm modules (sqlite3, sharp) if a
#    prebuilt binary isn't available for the host architecture
#  - ca-certificates: HTTPS to the AI APIs
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      make \
      g++ \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies first so this layer is cached across code changes.
COPY package*.json ./
RUN npm install --omit=dev

# Install the Chromium browser Playwright uses for the slideshow renderer,
# together with the OS libraries it needs.
RUN npx playwright install --with-deps chromium

# Copy the application source.
COPY . .

# Runtime folders the app writes to (also bind-mounted via docker-compose so
# your credentials, database and generated files survive container restarts).
RUN mkdir -p config data logs uploads temp

ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

CMD ["node", "index.js"]
