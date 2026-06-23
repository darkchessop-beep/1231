/**
 * Sails of Fortune — Multiplayer Relay Server
 * 
 * Simple WebSocket relay: passes messages between connected players.
 * Each client runs its own physics; server just broadcasts.
 * 
 * Message types:
 *   Client → Server:
 *     { type: 'join', name: 'PirateName' }
 *     { type: 'position', ship: {x,y,z,heading,pitch,roll}, sailRaised, anchorDown }
 *     { type: 'fire', cannonballs: [{x,y,z,vx,vy,vz,damage}] }
 *     { type: 'hit', targetId: 'playerId', damage: 25 }
 *     { type: 'sink', targetId: 'playerId' }
 *     { type: 'enemyUpdate', enemy: {id,x,z,heading,hp,alive} }
 *     { type: 'chat', text: 'message' }
 * 
 *   Server → Client:
 *     { type: 'welcome', id: 'yourId', players: [...] }
 *     { type: 'playerJoined', id: 'playerId', name: 'PirateName' }
 *     { type: 'playerLeft', id: 'playerId' }
 *     { type: 'position', id: 'playerId', ship: {...} }
 *     { type: 'fire', id: 'playerId', cannonballs: [...] }
 *     { type: 'hit', id: 'sourceId', targetId: 'targetId', damage: 25 }
 *     { type: 'sink', id: 'sourceId', targetId: 'targetId' }
 *     { type: 'enemyUpdate', id: 'sourceId', enemy: {...} }
 *     { type: 'chat', id: 'playerId', name: 'PirateName', text: 'message' }
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// --- HTTP server: serve static files from /public ---
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  
  const ext = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.glb': 'model/gltf-binary',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// --- WebSocket server ---
const wss = new WebSocketServer({ server });

const players = new Map();  // id → { ws, name, ship }

let nextId = 1;

function broadcast(message, excludeId = null) {
  const data = JSON.stringify(message);
  for (const [id, player] of players) {
    if (id !== excludeId && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  }
}

function sendTo(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  const id = 'p' + nextId++;
  console.log(`Player ${id} connected`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'join': {
        players.set(id, { ws, name: msg.name || 'Pirate', ship: null });
        // Send welcome with current player list
        const playerList = [];
        for (const [pid, p] of players) {
          if (pid !== id) {
            playerList.push({ id: pid, name: p.name, ship: p.ship });
          }
        }
        sendTo(ws, { type: 'welcome', id, players: playerList });
        // Tell others about new player
        broadcast({ type: 'playerJoined', id, name: msg.name || 'Pirate' }, id);
        console.log(`Player ${id} joined as "${msg.name}"`);
        break;
      }

      case 'position': {
        const player = players.get(id);
        if (player) {
          player.ship = msg.ship;
          // Relay to all other players
          broadcast({ type: 'position', id, ship: msg.ship, sailRaised: msg.sailRaised, anchorDown: msg.anchorDown }, id);
        }
        break;
      }

      case 'fire': {
        // Relay cannonballs to all other players
        broadcast({ type: 'fire', id, cannonballs: msg.cannonballs }, id);
        break;
      }

      case 'hit': {
        // Relay hit event to all players (target client will apply damage)
        broadcast({ type: 'hit', id, targetId: msg.targetId, damage: msg.damage }, id);
        break;
      }

      case 'sink': {
        broadcast({ type: 'sink', id, targetId: msg.targetId }, id);
        break;
      }

      case 'enemyUpdate': {
        // Only the first connected player is the "host" for enemies
        // Host sends enemy updates, others receive
        const hostId = 'p1';
        if (id === hostId) {
          broadcast({ type: 'enemyUpdate', id, enemy: msg.enemy }, id);
        }
        break;
      }

      case 'chat': {
        const player = players.get(id);
        const name = player ? player.name : 'Unknown';
        broadcast({ type: 'chat', id, name, text: msg.text });
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type: 'playerLeft', id });
    console.log(`Player ${id} disconnected`);
  });
});

server.listen(PORT, () => {
  console.log(`⛵ Sails of Fortune server running on port ${PORT}`);
  console.log(`   Open http://localhost:${PORT} to play`);
});
