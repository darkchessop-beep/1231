/**
 * Sails of Fortune — Multiplayer Client Networking
 * 
 * Connects to WebSocket server, syncs player positions, cannonballs, and combat.
 * This script is loaded AFTER the game code and hooks into the game state.
 */

// === Multiplayer State ===
const mp = {
  ws: null,
  myId: null,
  myName: 'Pirate' + Math.floor(Math.random() * 1000),
  connected: false,
  players: new Map(),      // id → { name, ship, mesh, sailRaised, anchorDown }
  lastSendTime: 0,
  sendInterval: 50,        // send position every 50ms (20/sec)
  serverUrl: null,
};

// === Connect to server ===
function connectToServer(url) {
  mp.serverUrl = url || `ws://${window.location.host}`;
  console.log('Connecting to', mp.serverUrl);

  try {
    mp.ws = new WebSocket(mp.serverUrl);
  } catch (e) {
    console.error('WebSocket connection failed:', e);
    showToast('Multiplayer: connection failed');
    return;
  }

  mp.ws.onopen = () => {
    mp.connected = true;
    console.log('Connected to server');
    showToast('🟢 Connected to server');
    // Send join message
    mp.ws.send(JSON.stringify({ type: 'join', name: mp.myName }));
    updateConnectionUI();
  };

  mp.ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    handleMessage(msg);
  };

  mp.ws.onclose = () => {
    mp.connected = false;
    console.log('Disconnected from server');
    showToast('🔴 Disconnected from server');
    updateConnectionUI();
    // Try to reconnect after 3 seconds
    setTimeout(() => {
      if (!mp.connected) connectToServer(mp.serverUrl);
    }, 3000);
  };

  mp.ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

// === Handle incoming messages ===
function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      mp.myId = msg.id;
      console.log(`My ID: ${mp.myId}`);
      // Add existing players
      for (const p of msg.players) {
        addRemotePlayer(p.id, p.name, p.ship);
      }
      updatePlayerListUI();
      break;

    case 'playerJoined':
      addRemotePlayer(msg.id, msg.name, null);
      showToast(`${msg.name} joined the game`);
      updatePlayerListUI();
      break;

    case 'playerLeft':
      removeRemotePlayer(msg.id);
      showToast('A player left the game');
      updatePlayerListUI();
      break;

    case 'position':
      updateRemotePlayer(msg.id, msg.ship, msg.sailRaised, msg.anchorDown);
      break;

    case 'fire':
      // Other player fired cannons — spawn their cannonballs in our world
      handleRemoteFire(msg.id, msg.cannonballs);
      break;

    case 'hit':
      // Someone hit someone — apply damage if we're the target
      if (msg.targetId === mp.myId && state.combat) {
        damagePlayer(msg.damage);
        // Find source player for feedback
        const source = mp.players.get(msg.id);
        if (source) {
          showToast(`💥 Hit by ${source.name}! -${msg.damage} HP`);
        }
      }
      break;

    case 'sink':
      if (msg.targetId === mp.myId && state.combat) {
        // We were sunk by another player
        // damagePlayer already handles sinking
      }
      break;

    case 'enemyUpdate':
      // Host synced enemy position — update our enemy
      if (state.combat && state.combat.enemyShips.length > 0) {
        const enemy = state.combat.enemyShips[0];
        if (enemy && msg.enemy) {
          enemy.position.x = msg.enemy.x;
          enemy.position.z = msg.enemy.z;
          enemy.heading = msg.enemy.heading;
          if (msg.enemy.hp !== undefined) enemy.hp = msg.enemy.hp;
          if (msg.enemy.alive !== undefined) enemy.alive = msg.enemy.alive;
        }
      }
      break;

    case 'chat':
      showChatMessage(msg.name, msg.text);
      break;
  }
}

// === Remote player management ===
function addRemotePlayer(id, name, ship) {
  if (id === mp.myId) return;
  if (mp.players.has(id)) return;

  // Clone the player's ship model for this remote player
  let mesh = null;
  if (state.shipModel) {
    mesh = state.shipModel.clone();
    // Tint with a random color to distinguish
    const colors = [0x4488ff, 0x88ff44, 0xff8844, 0xff44ff, 0x44ffff, 0xffff44];
    const color = colors[parseInt(id.replace('p', '')) % colors.length];
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.color.setHex(color);
      }
    });
    mesh.userData.baseScale = state.shipModel.scale.x;
    state.scene.add(mesh);
  }

  mp.players.set(id, { name, ship, mesh, sailRaised: 0.5, anchorDown: false });
}

function removeRemotePlayer(id) {
  const player = mp.players.get(id);
  if (player && player.mesh) {
    state.scene.remove(player.mesh);
  }
  mp.players.delete(id);
}

function updateRemotePlayer(id, ship, sailRaised, anchorDown) {
  const player = mp.players.get(id);
  if (!player || !ship) return;

  player.ship = ship;
  player.sailRaised = sailRaised;
  player.anchorDown = anchorDown;

  if (player.mesh) {
    player.mesh.position.set(ship.x, ship.y, ship.z);
    player.mesh.rotation.set(ship.pitch || 0, ship.heading, ship.roll || 0, 'YXZ');
    // Apply same scale as our ship
    const baseScale = player.mesh.userData.baseScale || 1.0;
    player.mesh.scale.setScalar(baseScale * (state.admin.shipScale || 1.0));
    player.mesh.rotation.y = ship.heading + Math.PI;  // match our 180° flip
  }
}

// === Send our position to server ===
function sendPosition() {
  if (!mp.connected || !mp.ws || mp.ws.readyState !== 1) return;

  const now = performance.now();
  if (now - mp.lastSendTime < mp.sendInterval) return;
  mp.lastSendTime = now;

  const s = state.shipState;
  mp.ws.send(JSON.stringify({
    type: 'position',
    ship: {
      x: s.position.x,
      y: s.position.y,
      z: s.position.z,
      heading: s.heading,
      pitch: s.pitch,
      roll: s.roll,
    },
    sailRaised: s.sailRaised,
    anchorDown: s.anchorDown,
  }));
}

// === Send cannon fire to server ===
function sendFire(cannonballs) {
  if (!mp.connected || !mp.ws || mp.ws.readyState !== 1) return;
  // Send cannonball data (position + velocity) so other clients can spawn them
  const ballData = cannonballs.map(b => ({
    x: b.position.x, y: b.position.y, z: b.position.z,
    vx: b.userData.velocity.x, vy: b.userData.velocity.y, vz: b.userData.velocity.z,
    damage: b.userData.damage,
  }));
  mp.ws.send(JSON.stringify({ type: 'fire', cannonballs: ballData }));
}

// === Handle remote cannon fire ===
function handleRemoteFire(sourceId, cannonballs) {
  if (!state.combat) return;
  // Spawn cannonballs from remote player
  for (const bd of cannonballs) {
    const ball = state.combat.cannonballPool.find(b => !b.userData.active);
    if (!ball) break;
    ball.position.set(bd.x, bd.y, bd.z);
    ball.visible = true;
    ball.userData.active = true;
    ball.userData.age = 0;
    ball.userData.damage = bd.damage;
    ball.userData.firedBy = sourceId;  // mark as fired by remote player
    ball.userData.velocity.set(bd.vx, bd.vy, bd.vz);
    state.combat.cannonballs.push(ball);
  }
  // Play cannon sound
  playCannonSound();
}

// === Send hit event ===
function sendHit(targetId, damage) {
  if (!mp.connected || !mp.ws || mp.ws.readyState !== 1) return;
  mp.ws.send(JSON.stringify({ type: 'hit', targetId, damage }));
}

// === Check if our cannonballs hit any remote player ===
function checkRemotePlayerHits() {
  if (!mp.connected || mp.players.size === 0) return;
  for (const ball of state.combat.cannonballs) {
    if (!ball.userData.active) continue;
    if (ball.userData.firedBy !== 'player') continue;  // only our balls

    for (const [id, player] of mp.players) {
      if (!player.ship) continue;
      const dx = ball.position.x - player.ship.x;
      const dy = ball.position.y - player.ship.y - 2;
      const dz = ball.position.z - player.ship.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const hitRadius = 4 * (state.admin.shipScale || 1.0);
      if (dist < hitRadius) {
        // Hit! Send to server
        sendHit(id, ball.userData.damage);
        ball.userData.active = false;
        ball.visible = false;
        playHitSound();
        showToast(`💥 Hit ${player.name}!`);
        break;
      }
    }
  }
}

// === Host: send enemy updates ===
function sendEnemyUpdate() {
  if (!mp.connected || mp.myId !== 'p1') return;  // only host
  if (!state.combat || state.combat.enemyShips.length === 0) return;
  const now = performance.now();
  if (now - (mp.lastEnemySend || 0) < 100) return;  // 10/sec
  mp.lastEnemySend = now;

  const enemy = state.combat.enemyShips[0];
  if (enemy) {
    mp.ws.send(JSON.stringify({
      type: 'enemyUpdate',
      enemy: {
        id: 0,
        x: enemy.position.x,
        z: enemy.position.z,
        heading: enemy.heading,
        hp: enemy.hp,
        alive: enemy.alive,
      },
    }));
  }
}

// === Chat ===
function sendChat(text) {
  if (!mp.connected || !mp.ws || mp.ws.readyState !== 1) return;
  mp.ws.send(JSON.stringify({ type: 'chat', text }));
}

function showChatMessage(name, text) {
  const chatLog = document.getElementById('chatLog');
  if (!chatLog) return;
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  entry.innerHTML = `<span class="chat-name">${name}:</span> ${text}`;
  chatLog.appendChild(entry);
  chatLog.scrollTop = chatLog.scrollHeight;
  // Keep only last 20 messages
  while (chatLog.children.length > 20) {
    chatLog.removeChild(chatLog.firstChild);
  }
}

// === UI: Connection status + player list ===
function updateConnectionUI() {
  const el = document.getElementById('mpStatus');
  if (el) {
    el.textContent = mp.connected ? '🟢 Online' : '🔴 Offline';
    el.style.color = mp.connected ? '#8fbf8f' : '#bf4f4f';
  }
}

function updatePlayerListUI() {
  const el = document.getElementById('mpPlayers');
  if (!el) return;
  let html = `<div style="color:#d4af37;margin-bottom:4px;">Players (${mp.players.size + 1})</div>`;
  html += `<div style="color:#8fbf8f;">★ ${mp.myName} (you)</div>`;
  for (const [id, p] of mp.players) {
    html += `<div style="color:#f0e6d2;">• ${p.name}</div>`;
  }
  el.innerHTML = html;
}

// === Initialize multiplayer (called after game loads) ===
function initMultiplayer() {
  // Auto-connect to the server that served this page
  const wsUrl = `ws://${window.location.host}`;
  connectToServer(wsUrl);

  // Set up name input
  const nameInput = document.getElementById('mpNameInput');
  if (nameInput) {
    nameInput.value = mp.myName;
    nameInput.addEventListener('change', () => {
      mp.myName = nameInput.value || 'Pirate';
      if (mp.connected) {
        mp.ws.send(JSON.stringify({ type: 'join', name: mp.myName }));
      }
    });
  }

  // Chat input
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        sendChat(chatInput.value.trim());
        chatInput.value = '';
      }
    });
  }
}

// === Hook into game loop (called from animate) ===
function updateMultiplayer() {
  if (!mp.connected) return;

  // Send our position
  sendPosition();

  // Check if our cannonballs hit remote players
  if (state.combat) {
    checkRemotePlayerHits();
    sendEnemyUpdate();
  }
}

// Auto-initialize when game is ready
// Wait for the game's animate loop to start, then init multiplayer
const mpInitInterval = setInterval(() => {
  if (state.loaded) {
    clearInterval(mpInitInterval);
    initMultiplayer();
    // Hook into the animate loop
    const originalAnimate = animate;
    animate = function() {
      originalAnimate();
      updateMultiplayer();
    };
  }
}, 500);
