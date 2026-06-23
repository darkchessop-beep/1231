# Sails of Fortune — Multiplayer

## Quick Start (Local Testing)

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/ (LTS version)

2. **Open terminal/command prompt in the `multiplayer` folder**

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Start the server:**
   ```
   npm start
   ```

5. **Open in browser:**
   - Go to http://localhost:3000
   - Open a second tab (or different browser) to http://localhost:3000
   - You should see two ships sailing!

## Playing with a Friend (Online)

### Option A: Deploy to Render (free)

1. Create account at https://render.com
2. New → Web Service → Connect your repo or upload files
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Deploy — you'll get a URL like `https://your-app.onrender.com`
5. Share the URL with your friend!

### Option B: Deploy to Railway (free tier)

1. Create account at https://railway.app
2. New Project → Deploy from folder
3. Railway auto-detects Node.js
4. Share the generated URL with your friend!

### Option C: Use Glitch (easiest, no account needed)

1. Go to https://glitch.com
2. New Project → Import from GitHub (or upload files)
3. Server runs automatically
4. Share the Glitch URL

## How It Works

- **Server** (`server.js`): Simple WebSocket relay — passes messages between players
- **Client** (`public/index.html`): Full game with multiplayer networking
- **Networking** (`public/multiplayer.js`): Handles connection, position sync, combat sync

### What's Synced
- ✅ Player ship positions (20 updates/sec)
- ✅ Cannon fire (other players see your cannonballs)
- ✅ Hit detection (damage applied to target)
- ✅ Chat (press Enter to chat)
- ✅ Enemy ships (host = first player, syncs enemy to all)
- ✅ Player list (see who's online)

### Player Colors
Each player gets a unique ship color:
- Blue, Green, Orange, Purple, Cyan, Yellow

## Controls

| Key | Action |
|-----|--------|
| W/S | Sail up/down |
| A/D | Rudder (inverted) |
| Space | Anchor / Jump / Swim up |
| E | Step off ship / Board / Interact |
| F | Dig treasure |
| C | Toggle 1st/3rd person |
| V | Toggle compass mode |
| L-Click | Fire cannons |
| Enter | Chat (when chat box focused) |
| Mouse drag | Orbit camera |
| Wheel | Zoom |
