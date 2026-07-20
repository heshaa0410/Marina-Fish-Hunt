const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const sizeDisplay = document.getElementById('size');
const threatDisplay = document.getElementById('threat');
const overlay = document.getElementById('overlay');
const startOverlay = document.getElementById('startOverlay');
const finalScoreDisplay = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const startButton = document.getElementById('startButton');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

const state = {
  score: 0,
  lives: 10,
  started: false,
  gameOver: false,
  lastTime: 0,
  spawnFoodTimer: 0,
  spawnEnemyTimer: 0,
  audioReady: false,
  audioContext: null,
  ambientSource: null,
  ambientLfo: null,
};

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

const player = {
  x: 120,
  y: GAME_HEIGHT / 2,
  radius: 18,
  speed: 230,
  dirX: 1,
  dirY: 0,
};

const food = [];
const enemies = [];
const bubbles = [];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function initAudio() {
  if (state.audioReady) {
    if (state.audioContext && state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  state.audioContext = new AudioCtx();
  state.audioReady = true;
}

function startAmbientWater() {
  initAudio();
  if (!state.audioReady || !state.audioContext || state.ambientSource) return;

  const audioContext = state.audioContext;
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.25;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 680;
  filter.Q.value = 0.75;

  const gain = audioContext.createGain();
  gain.gain.value = 0.018;

  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 90;

  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);

  source.start();
  lfo.start();

  state.ambientSource = source;
  state.ambientLfo = lfo;
}

function playTone(freq, duration, type = 'triangle', gainValue = 0.05, startAt = 0) {
  if (!state.audioReady || !state.audioContext) return;

  const now = state.audioContext.currentTime + startAt;
  const oscillator = state.audioContext.createOscillator();
  const gainNode = state.audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now);

  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(state.audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playEatSound() {
  initAudio();
  if (!state.audioReady) return;

  playTone(520, 0.09, 'triangle', 0.08, 0);
  playTone(220, 0.12, 'square', 0.04, 0.03);
}

function playHitSound() {
  initAudio();
  if (!state.audioReady) return;

  playTone(220, 0.14, 'sawtooth', 0.06, 0);
  playTone(120, 0.2, 'square', 0.04, 0.05);
}

function resetGame() {
  state.score = 0;
  state.lives = 10;
  state.started = false;
  state.gameOver = false;
  state.spawnFoodTimer = 0;
  state.spawnEnemyTimer = 0;
  player.x = 120;
  player.y = GAME_HEIGHT / 2;
  player.radius = 18;
  player.dirX = 1;
  player.dirY = 0;
  food.length = 0;
  enemies.length = 0;
  bubbles.length = 0;
  overlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
  updateHud();
  for (let i = 0; i < 12; i += 1) spawnFood();
  for (let i = 0; i < 4; i += 1) spawnEnemy();
}

function startGame() {
  initAudio();
  startAmbientWater();
  state.started = true;
  state.gameOver = false;
  startOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
}

function updateHud() {
  scoreDisplay.textContent = state.score;
  livesDisplay.textContent = '♥'.repeat(state.lives) || '0';
  if (state.lives === 0) {
    livesDisplay.textContent = '💀';
  }

  if (player.radius < 24) {
    sizeDisplay.textContent = 'Small';
  } else if (player.radius < 36) {
    sizeDisplay.textContent = 'Growing';
  } else if (player.radius < 52) {
    sizeDisplay.textContent = 'Medium';
  } else {
    sizeDisplay.textContent = 'Big';
  }

  threatDisplay.textContent = 'Safe';
  threatDisplay.className = '';
}

function getRandomFishType() {
  const types = ['tang', 'wrasse', 'goby', 'parrot'];
  return types[Math.floor(Math.random() * types.length)];
}

function spawnFood() {
  const radius = 10 + Math.random() * 7;
  const kind = getRandomFishType();
  const angle = Math.random() * Math.PI * 2;

  food.push({
    x: Math.random() * (GAME_WIDTH - 80) + 40,
    y: Math.random() * (GAME_HEIGHT - 80) + 40,
    radius,
    kind,
    speed: 55 + Math.random() * 30,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    wobble: Math.random() * Math.PI * 2,
    bodyColor: kind === 'parrot' ? '#f7a13b' : kind === 'wrasse' ? '#5cc974' : kind === 'goby' ? '#c0e2ff' : '#f6c37d',
    accentColor: kind === 'parrot' ? '#1d5a6f' : '#a4572d',
  });
}

function spawnEnemy() {
  const radius = 28 + Math.random() * 19;
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (side === 0) {
    x = -radius;
    y = Math.random() * GAME_HEIGHT;
  } else if (side === 1) {
    x = GAME_WIDTH + radius;
    y = Math.random() * GAME_HEIGHT;
  } else if (side === 2) {
    x = Math.random() * GAME_WIDTH;
    y = -radius;
  } else {
    x = Math.random() * GAME_WIDTH;
    y = GAME_HEIGHT + radius;
  }

  const types = ['tuna', 'angelfish', 'barracuda', 'mackerel'];
  const kind = types[Math.floor(Math.random() * types.length)];
  const chaseRange = kind === 'barracuda' ? 240 : kind === 'tuna' ? 190 : kind === 'mackerel' ? 165 : 110;
  const patrolRadius = 120 + Math.random() * 100;
  const isPredator = kind === 'barracuda' || kind === 'tuna' || kind === 'mackerel';

  enemies.push({
    x,
    y,
    radius,
    kind,
    speed: 45 + Math.random() * 34,
    bodyColor: kind === 'tuna' ? '#c5d3e0' : kind === 'angelfish' ? '#f7b24f' : kind === 'barracuda' ? '#6f8fa8' : '#3f6889',
    accentColor: kind === 'angelfish' ? '#9a3b18' : '#1a3750',
    dirX: Math.random() * 2 - 1,
    dirY: Math.random() * 2 - 1,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolRadius,
    patrolCenterX: Math.random() * (GAME_WIDTH - 180) + 90,
    patrolCenterY: Math.random() * (GAME_HEIGHT - 180) + 90,
    chaseRange,
    isPredator,
    wandering: true,
  });
}

function createBubble(x, y) {
  bubbles.push({ x, y, r: 2 + Math.random() * 4, alpha: 0.5 + Math.random() * 0.4 });
}

function loseLife() {
  if (state.lives <= 0 || state.gameOver) return;

  state.lives -= 1;
  player.radius = Math.max(18, player.radius - 3);
  player.x = 120;
  player.y = GAME_HEIGHT / 2;
  player.dirX = 1;
  player.dirY = 0;
  playHitSound();
  updateHud();

  if (state.lives <= 0) {
    state.gameOver = true;
    finalScoreDisplay.textContent = `Final Score: ${state.score}`;
    overlay.classList.remove('hidden');
  }
}

function updateThreatMeter() {
  let nearestThreat = Infinity;

  for (const enemy of enemies) {
    if (!enemy.isPredator) continue;
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distance < nearestThreat) nearestThreat = distance;
  }

  if (nearestThreat < 120) {
    threatDisplay.textContent = 'Danger';
    threatDisplay.className = 'danger';
  } else if (nearestThreat < 220) {
    threatDisplay.textContent = 'Warning';
    threatDisplay.className = 'warning';
  } else {
    threatDisplay.textContent = 'Safe';
    threatDisplay.className = '';
  }
}

function update(dt) {
  if (!state.started) {
    for (const fish of food) {
      fish.wobble += dt * 1.3;
      fish.x += Math.sin(fish.wobble) * 0.7;
      fish.y += Math.cos(fish.wobble) * 0.5;
      fish.x = clamp(fish.x, fish.radius, GAME_WIDTH - fish.radius);
      fish.y = clamp(fish.y, fish.radius, GAME_HEIGHT - fish.radius);
    }

    for (const enemy of enemies) {
      enemy.x += Math.sin(performance.now() / 500 + enemy.radius) * 0.25;
      enemy.y += Math.cos(performance.now() / 700 + enemy.radius) * 0.25;
    }
    updateThreatMeter();
    return;
  }

  if (state.gameOver) return;

  const aimX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const aimY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const moveLength = Math.hypot(aimX, aimY) || 1;
  player.dirX = aimX / moveLength;
  player.dirY = aimY / moveLength;

  player.x += player.dirX * player.speed * dt;
  player.y += player.dirY * player.speed * dt;
  player.x = clamp(player.x, player.radius, GAME_WIDTH - player.radius);
  player.y = clamp(player.y, player.radius, GAME_HEIGHT - player.radius);

  state.spawnFoodTimer += dt;
  state.spawnEnemyTimer += dt;

  if (state.spawnFoodTimer > 1.2) {
    state.spawnFoodTimer = 0;
    spawnFood();
  }

  if (state.spawnEnemyTimer > 4.2) {
    state.spawnEnemyTimer = 0;
    spawnEnemy();
  }

  for (let i = food.length - 1; i >= 0; i -= 1) {
    const fish = food[i];
    fish.wobble += dt * 2.4;
    fish.x += fish.dirX * fish.speed * dt + Math.sin(fish.wobble) * 0.8;
    fish.y += fish.dirY * fish.speed * dt + Math.cos(fish.wobble) * 0.8;

    if (fish.x <= 10 || fish.x >= GAME_WIDTH - 10) fish.dirX *= -1;
    if (fish.y <= 20 || fish.y >= GAME_HEIGHT - 20) fish.dirY *= -1;

    fish.x = clamp(fish.x, fish.radius, GAME_WIDTH - fish.radius);
    fish.y = clamp(fish.y, fish.radius, GAME_HEIGHT - fish.radius);

    const distance = Math.hypot(player.x - fish.x, player.y - fish.y);
    if (distance < player.radius + fish.radius * 0.82) {
      state.score += 10;
      player.radius = Math.min(72, player.radius + 0.8);
      playEatSound();
      updateHud();
      food.splice(i, 1);
      for (let j = 0; j < 5; j += 1) createBubble(fish.x, fish.y);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const canHunt = enemy.isPredator && enemy.radius > player.radius + 4;

    enemy.patrolAngle += dt * (0.45 + enemy.speed * 0.01);
    const patrolX = enemy.patrolCenterX + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
    const patrolY = enemy.patrolCenterY + Math.sin(enemy.patrolAngle * 1.35) * enemy.patrolRadius * 0.55;

    const toPatrolX = patrolX - enemy.x;
    const toPatrolY = patrolY - enemy.y;
    const patrolLength = Math.hypot(toPatrolX, toPatrolY) || 1;

    if (canHunt && distance < enemy.chaseRange) {
      enemy.x += (dx / distance) * enemy.speed * 0.85 * dt;
      enemy.y += (dy / distance) * enemy.speed * 0.85 * dt;
      enemy.dirX = dx / distance;
      enemy.dirY = dy / distance;
    } else {
      enemy.x += (toPatrolX / patrolLength) * enemy.speed * 0.42 * dt;
      enemy.y += (toPatrolY / patrolLength) * enemy.speed * 0.42 * dt;
      enemy.dirX = toPatrolX / patrolLength;
      enemy.dirY = toPatrolY / patrolLength;
    }

    enemy.x = clamp(enemy.x, enemy.radius, GAME_WIDTH - enemy.radius);
    enemy.y = clamp(enemy.y, enemy.radius, GAME_HEIGHT - enemy.radius);

    if (distance < player.radius + enemy.radius - 4) {
      loseLife();
      enemy.x = Math.random() * GAME_WIDTH;
      enemy.y = Math.random() * GAME_HEIGHT;
      enemy.patrolCenterX = Math.random() * (GAME_WIDTH - 180) + 90;
      enemy.patrolCenterY = Math.random() * (GAME_HEIGHT - 180) + 90;
    }
  }

  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    bubbles[i].y -= 24 * dt;
    bubbles[i].alpha -= 0.3 * dt;
    if (bubbles[i].alpha <= 0) bubbles.splice(i, 1);
  }

  updateThreatMeter();
}

function drawClownfish(fish, isPlayer = false) {
  const scale = fish.radius;
  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.rotate(Math.atan2(fish.dirY || 0, fish.dirX || 1));

  const bodyGradient = ctx.createLinearGradient(-scale * 1.1, -scale, scale * 1.18, scale);
  bodyGradient.addColorStop(0, '#ffd38a');
  bodyGradient.addColorStop(0.42, '#f59c43');
  bodyGradient.addColorStop(0.74, '#ed6e30');
  bodyGradient.addColorStop(1, '#b73e19');

  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(scale * 1.16, 0);
  ctx.quadraticCurveTo(scale * 1.62, -scale * 0.68, scale * 0.84, -scale * 0.72);
  ctx.quadraticCurveTo(scale * 0.12, -scale * 0.92, -scale * 0.18, -scale * 0.88);
  ctx.quadraticCurveTo(-scale * 0.94, -scale * 0.58, -scale * 1.02, -scale * 0.14);
  ctx.quadraticCurveTo(-scale * 1.06, scale * 0.16, -scale * 0.78, scale * 0.72);
  ctx.quadraticCurveTo(scale * 0.2, scale * 0.96, scale * 0.84, scale * 0.72);
  ctx.quadraticCurveTo(scale * 1.6, scale * 0.72, scale * 1.16, 0);
  ctx.fill();

  ctx.fillStyle = '#f9f5eb';
  ctx.beginPath();
  ctx.moveTo(scale * 0.12, -scale * 0.02);
  ctx.lineTo(scale * 0.54, -scale * 0.5);
  ctx.lineTo(scale * 0.78, -scale * 0.04);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(scale * 0.18, -scale * 0.04, scale * 0.28, scale * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(scale * 0.76, -scale * 0.04, scale * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(scale * 0.8, -scale * 0.06, scale * 0.035, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f2b648';
  ctx.beginPath();
  ctx.moveTo(-scale * 1.08, 0);
  ctx.lineTo(-scale * 1.82, -scale * 0.78);
  ctx.lineTo(-scale * 1.74, 0);
  ctx.lineTo(-scale * 1.82, scale * 0.78);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffcf71';
  ctx.beginPath();
  ctx.moveTo(-scale * 0.28, -scale * 0.46);
  ctx.lineTo(scale * 0.04, -scale * 1.08);
  ctx.lineTo(scale * 0.38, -scale * 0.58);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#dd6f34';
  ctx.beginPath();
  ctx.moveTo(-scale * 0.28, scale * 0.46);
  ctx.lineTo(scale * 0.04, scale * 1.08);
  ctx.lineTo(scale * 0.38, scale * 0.58);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#101010';
  ctx.lineWidth = Math.max(1.2, scale * 0.05);
  ctx.beginPath();
  ctx.moveTo(scale * 0.18, -scale * 0.06);
  ctx.lineTo(scale * 0.52, -scale * 0.12);
  ctx.lineTo(scale * 0.68, scale * 0.02);
  ctx.moveTo(scale * 0.16, scale * 0.18);
  ctx.lineTo(scale * 0.48, scale * 0.08);
  ctx.stroke();

  ctx.strokeStyle = '#fefefe';
  ctx.lineWidth = Math.max(1.2, scale * 0.05);
  ctx.beginPath();
  ctx.moveTo(scale * 0.12, -scale * 0.14);
  ctx.quadraticCurveTo(scale * 0.4, -scale * 0.42, scale * 0.64, -scale * 0.2);
  ctx.moveTo(scale * 0.1, scale * 0.12);
  ctx.quadraticCurveTo(scale * 0.38, scale * 0.4, scale * 0.62, scale * 0.2);
  ctx.stroke();

  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1.1, scale * 0.03);
  ctx.beginPath();
  ctx.moveTo(scale * 0.16, -scale * 0.56);
  ctx.lineTo(scale * 0.44, -scale * 0.34);
  ctx.lineTo(scale * 0.68, -scale * 0.54);
  ctx.moveTo(scale * 0.16, scale * 0.56);
  ctx.lineTo(scale * 0.44, scale * 0.34);
  ctx.lineTo(scale * 0.68, scale * 0.54);
  ctx.stroke();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.15, scale * 0.04);
  ctx.beginPath();
  ctx.moveTo(scale * 0.1, -scale * 0.02);
  ctx.lineTo(scale * 0.54, -scale * 0.02);
  ctx.stroke();

  if (isPlayer) {
    ctx.strokeStyle = '#ffd178';
    ctx.lineWidth = Math.max(1.3, scale * 0.05);
    ctx.beginPath();
    ctx.moveTo(scale * 0.15, -scale * 0.62);
    ctx.lineTo(scale * 0.12, -scale * 0.9);
    ctx.moveTo(scale * 0.26, -scale * 0.62);
    ctx.lineTo(scale * 0.24, -scale * 0.95);
    ctx.stroke();
  }

  ctx.restore();
}

function drawRealFish(fish) {
  const scale = fish.radius;
  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.rotate(Math.atan2(fish.dirY || 0, fish.dirX || 1));

  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = 6;

  const bodyGradient = ctx.createLinearGradient(-scale * 1.02, -scale, scale * 1.22, scale);
  bodyGradient.addColorStop(0, fish.bodyColor);
  bodyGradient.addColorStop(0.55, fish.bodyColor);
  bodyGradient.addColorStop(1, '#3a556a');

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(scale * 1.06, 0);
  ctx.quadraticCurveTo(scale * 1.48, -scale * 0.72, scale * 0.84, -scale * 0.7);
  ctx.quadraticCurveTo(scale * 0.1, -scale * 0.92, -scale * 0.12, -scale * 0.86);
  ctx.quadraticCurveTo(-scale * 0.98, -scale * 0.62, -scale * 1.0, -scale * 0.16);
  ctx.quadraticCurveTo(-scale * 1.02, scale * 0.12, -scale * 0.8, scale * 0.72);
  ctx.quadraticCurveTo(scale * 0.78, scale * 0.88, scale * 1.06, 0);
  ctx.fill();

  ctx.fillStyle = fish.accentColor || '#1b4b61';
  ctx.beginPath();
  ctx.moveTo(-scale * 1.02, 0);
  ctx.lineTo(-scale * 1.72, -scale * 0.78);
  ctx.lineTo(-scale * 1.62, 0);
  ctx.lineTo(-scale * 1.72, scale * 0.78);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.ellipse(-scale * 0.24, -scale * 0.08, scale * 0.22, scale * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(scale * 0.68, -scale * 0.06, scale * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(scale * 0.72, -scale * 0.1, scale * 0.035, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#cde0eb';
  ctx.beginPath();
  ctx.moveTo(-scale * 0.12, -scale * 0.46);
  ctx.lineTo(scale * 0.24, -scale * 1.02);
  ctx.lineTo(scale * 0.42, -scale * 0.52);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(24, 51, 71, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-scale * 0.12, scale * 0.46);
  ctx.lineTo(scale * 0.24, scale * 1.02);
  ctx.lineTo(scale * 0.42, scale * 0.52);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.48)';
  ctx.lineWidth = Math.max(1, scale * 0.04);
  ctx.beginPath();
  ctx.moveTo(-scale * 0.12, -scale * 0.24);
  ctx.quadraticCurveTo(scale * 0.18, -scale * 0.42, scale * 0.58, -scale * 0.12);
  ctx.moveTo(-scale * 0.18, scale * 0.24);
  ctx.quadraticCurveTo(scale * 0.18, scale * 0.42, scale * 0.56, scale * 0.12);
  ctx.stroke();

  ctx.strokeStyle = '#102532';
  ctx.lineWidth = Math.max(1, scale * 0.05);
  ctx.beginPath();
  ctx.moveTo(scale * 0.2, -scale * 0.06);
  ctx.lineTo(scale * 0.62, -scale * 0.08);
  ctx.moveTo(scale * 0.28, scale * 0.14);
  ctx.lineTo(scale * 0.66, scale * 0.1);
  ctx.stroke();

  if (fish.kind === 'angelfish') {
    ctx.fillStyle = '#ef8d4f';
    ctx.beginPath();
    ctx.moveTo(-scale * 0.14, -scale * 0.48);
    ctx.lineTo(scale * 0.12, -scale * 1.12);
    ctx.lineTo(scale * 0.52, -scale * 0.64);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8f3d12';
    ctx.beginPath();
    ctx.moveTo(-scale * 0.14, scale * 0.48);
    ctx.lineTo(scale * 0.12, scale * 1.12);
    ctx.lineTo(scale * 0.52, scale * 0.64);
    ctx.closePath();
    ctx.fill();
  } else if (fish.kind === 'tuna') {
    ctx.fillStyle = '#6b8aa1';
    ctx.beginPath();
    ctx.moveTo(-scale * 0.48, -scale * 0.06);
    ctx.quadraticCurveTo(-scale * 0.92, -scale * 0.38, -scale * 1.08, -scale * 0.1);
    ctx.quadraticCurveTo(-scale * 0.96, scale * 0.02, -scale * 0.48, scale * 0.06);
    ctx.fill();
  } else if (fish.kind === 'wrasse') {
    ctx.strokeStyle = '#fefefe';
    ctx.lineWidth = Math.max(1, scale * 0.05);
    ctx.beginPath();
    ctx.moveTo(-scale * 0.1, -scale * 0.28);
    ctx.lineTo(scale * 0.12, -scale * 0.1);
    ctx.moveTo(-scale * 0.1, scale * 0.3);
    ctx.lineTo(scale * 0.12, scale * 0.1);
    ctx.stroke();
  } else if (fish.kind === 'goby' || fish.kind === 'parrot') {
    ctx.strokeStyle = '#26485a';
    ctx.lineWidth = Math.max(1, scale * 0.04);
    ctx.beginPath();
    ctx.moveTo(-scale * 0.08, -scale * 0.18);
    ctx.lineTo(scale * 0.18, -scale * 0.4);
    ctx.moveTo(-scale * 0.08, scale * 0.18);
    ctx.lineTo(scale * 0.18, scale * 0.4);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBackground() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const sea = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sea.addColorStop(0, '#9addff');
  sea.addColorStop(0.45, '#53b2e5');
  sea.addColorStop(1, '#0a5b8c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.ellipse(100 + i * 150, 90 + (i % 2) * 50, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(5, 77, 115, 0.35)';
  ctx.beginPath();
  ctx.ellipse(250, 540, 220, 38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 7; i += 1) {
    const x = 60 + i * 130;
    const y = 510 + (i % 2) * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 18, y - 24, x + 42, y);
    ctx.quadraticCurveTo(x + 24, y + 12, x, y);
    ctx.fill();
  }

  ctx.fillStyle = '#1f7a4f';
  ctx.beginPath();
  ctx.moveTo(80, GAME_HEIGHT - 12);
  ctx.lineTo(110, GAME_HEIGHT - 70);
  ctx.lineTo(140, GAME_HEIGHT - 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1e5d2f';
  ctx.beginPath();
  ctx.moveTo(760, GAME_HEIGHT - 10);
  ctx.lineTo(800, GAME_HEIGHT - 72);
  ctx.lineTo(840, GAME_HEIGHT - 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0d5b7d';
  ctx.fillRect(0, GAME_HEIGHT - 38, GAME_WIDTH, 38);
}

function draw() {
  drawBackground();

  for (const bubble of bubbles) {
    ctx.fillStyle = `rgba(255,255,255,${bubble.alpha})`;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const fish of food) {
    drawRealFish(fish);
  }

  for (const enemy of enemies) {
    drawRealFish(enemy);
  }

  drawClownfish(player, true);

  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

function mainLoop(timestamp) {
  const dt = Math.min((timestamp - state.lastTime) / 1000 || 0, 0.03);
  state.lastTime = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(mainLoop);
}

window.addEventListener('keydown', (event) => {
  initAudio();
  if (!state.started && (event.key === 'Enter' || event.key === ' ')) {
    startGame();
  }
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.up = true;
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') keys.down = true;
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = true;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = true;
});

window.addEventListener('keyup', (event) => {
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.up = false;
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') keys.down = false;
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.left = false;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.right = false;
});

canvas.addEventListener('pointerdown', initAudio);
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', () => {
  resetGame();
  startGame();
});
resetGame();
requestAnimationFrame(mainLoop);
