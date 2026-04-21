
const state = {
  callsign: 'ПРИЗРАК_01',
  hp: 100,
  ammo: 30,
  reserve: 120,
  currentTargetIndex: 1,
  currentScreen: 'menu',
  countdownTimer: null,
  matchTimer: null,
  matchSeconds: 180,
  cameraStream: null,
  audioContext: null,
  firingInterval: null,
  isFiring: false,
  teamScores: { red: 18, blue: 12, redTotal: 31, blueTotal: 21 },
  players: [
    { name: 'ПРИЗРАК_01', role: 'Хост', team: 'A', score: '7 / 2' },
    { name: 'ТЕНЬ', role: 'Разведчик', team: 'A', score: '4 / 3' },
    { name: 'ХАНТЕР', role: 'Штурмовик', team: 'B', score: '5 / 5' },
    { name: 'ВАЙПЕР', role: 'Снайпер', team: 'B', score: '3 / 4' }
  ],
  targets: [
    { id: 1, name: 'ТЕНЬ', type: 'ally', hp: 100, x: 18, y: 42, scale: 0.82 },
    { id: 2, name: 'ХАНТЕР', type: 'enemy', hp: 100, x: 58, y: 31, scale: 1.02 },
    { id: 3, name: 'ВАЙПЕР', type: 'enemy', hp: 100, x: 74, y: 48, scale: 0.88 }
  ],
  feed: [
    'СИСТЕМА: матч инициализирован',
    'AR: обнаружено 3 цели',
    'СЕТЬ: синхронизация лобби OK'
  ]
};

const ids = id => document.getElementById(id);
const screens = {
  menu: ids('screen'),
  lobby: ids('lobbyScreen'),
  countdown: ids('countdownScreen'),
  battle: ids('battleScreen'),
  results: ids('resultsScreen')
};

function setClock() {
  const now = new Date();
  ids('clock').textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
setClock();
setInterval(setClock, 30000);

function ensureAudioContext() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) state.audioContext = new AudioContextClass();
  }
  if (state.audioContext && state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
}

function playShotSound() {
  ensureAudioContext();
  const ctx = state.audioContext; if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  noise.buffer = noiseBuffer;
  osc.type = 'square';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  noiseGain.gain.setValueAtTime(0.2, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.connect(gain).connect(ctx.destination);
  noise.connect(noiseGain).connect(ctx.destination);
  osc.start(now); noise.start(now); osc.stop(now + 0.09); noise.stop(now + 0.09);
}

function playReloadSound() {
  ensureAudioContext();
  const ctx = state.audioContext; if (!ctx) return;
  const now = ctx.currentTime;
  [420, 520].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + idx * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.09 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + idx * 0.09); osc.stop(now + idx * 0.09 + 0.1);
  });
}

function playHitSound() {
  ensureAudioContext();
  const ctx = state.audioContext; if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(980, now);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.08);
}

function updateOrientationUI() {
  const landscape = window.innerWidth > window.innerHeight;
  document.body.classList.toggle('landscape-ui', landscape);
  const badge = ids('orientationBadge');
  if (badge) badge.textContent = landscape ? 'ГОРИЗОНТ' : 'ПОРТРЕТ';
}

async function requestFullscreenLandscape() {
  const root = document.documentElement;
  try { if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen(); } catch (e) {}
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
  updateOrientationUI();
}

function switchScreen(name) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  state.currentScreen = name;
  document.body.classList.toggle('battle-active', name === 'battle');
  if (name !== 'battle') stopContinuousFire();
}

function renderPlayers() {
  const container = ids('playersList');
  container.innerHTML = '';
  state.players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <div class="player-left">
        <div class="avatar team-${player.team.toLowerCase()}">${index + 1}</div>
        <div>
          <div><strong>${player.name}</strong></div>
          <div class="role">${player.role} · Команда ${player.team}</div>
        </div>
      </div>
      <div class="chip">${player.score}</div>
    `;
    container.appendChild(row);
  });
}

function renderTargets() {
  const layer = ids('targetLayer');
  layer.innerHTML = '';
  state.targets.forEach((target, index) => {
    const item = document.createElement('button');
    item.className = `target ${target.type} ${index === state.currentTargetIndex ? 'selected' : ''} ${target.hitPulse ? 'hit-pulse' : ''}`;
    item.style.left = `${target.x}%`;
    item.style.top = `${target.y}%`;
    item.style.transform = `translate(-50%, -50%) scale(${target.scale})`;
    item.innerHTML = `
      <div class="outline"></div>
      <div class="tag">
        ${target.name}
        <div class="hpbar"><span style="width:${target.hp}%; background:${target.type === 'enemy' ? 'var(--red)' : 'var(--green)'}"></span></div>
      </div>
      <div class="silhouette"></div>
    `;
    item.addEventListener('click', () => { state.currentTargetIndex = index; updateCombatView(); });
    layer.appendChild(item);
  });
}

function renderFeed() {
  const feed = ids('feedItems');
  feed.innerHTML = '';
  state.feed.slice(-4).reverse().forEach(text => {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.textContent = text;
    feed.appendChild(div);
  });
}

function pushFeed(message) {
  state.feed.push(message);
  renderFeed();
}

function showToast(text, type = 'neutral') {
  const toast = ids('battleToast');
  toast.textContent = text;
  toast.className = `battle-toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 850);
}

function updateScoreboard() {
  ids('redScore').textContent = state.teamScores.red;
  ids('blueScore').textContent = state.teamScores.blue;
  ids('redTotal').textContent = state.teamScores.redTotal;
  ids('blueTotal').textContent = state.teamScores.blueTotal;
}

function updateCombatView() {
  renderTargets();
  renderFeed();
  updateScoreboard();
  ids('hpValue').textContent = state.hp;
  ids('ammoValue').textContent = `${state.ammo}/${state.reserve}`;

  const target = state.targets[state.currentTargetIndex];
  const crosshair = ids('crosshair');
  const lockRing = ids('lockRing');
  const lockText = ids('lockText');
  crosshair.className = 'crosshair';

  if (!target) {
    crosshair.classList.add('neutral');
    lockRing.style.setProperty('--progress', 0);
    lockText.textContent = 'ПОИСК ЦЕЛИ';
    return;
  }

  if (target.type === 'ally') {
    crosshair.classList.add('ally-lock');
    lockRing.style.setProperty('--progress', 100);
    lockText.textContent = `СОЮЗНИК: ${target.name}`;
  } else {
    crosshair.classList.add(target.hp < 100 ? 'enemy-lock' : 'loading');
    lockRing.style.setProperty('--progress', target.hp < 100 ? 100 : 72);
    lockText.textContent = target.hp < 100 ? `ЦЕЛЬ ЗАХВАЧЕНА: ${target.name}` : `ЗАХВАТ ЦЕЛИ: ${target.name}`;
  }
}

function renderResults() {
  const list = ids('resultsList');
  const data = [
    { place: '1', name: state.callsign, meta: 'Команда Синих · MVP', score: '7 / 2' },
    { place: '2', name: 'ТЕНЬ', meta: 'Команда Синих · Разведчик', score: '4 / 3' },
    { place: '3', name: 'ХАНТЕР', meta: 'Команда Красных · Штурмовик', score: '5 / 5' },
    { place: '4', name: 'ВАЙПЕР', meta: 'Команда Красных · Снайпер', score: '3 / 4' }
  ];
  list.innerHTML = data.map(item => `
    <div class="result-row">
      <div class="place">#${item.place}</div>
      <div>
        <div><strong>${item.name}</strong></div>
        <div class="meta">${item.meta}</div>
      </div>
      <div class="chip">${item.score}</div>
    </div>
  `).join('');
}

async function requestCamera() {
  const video = ids('cameraFeed');
  const fallback = ids('cameraFallback');
  const fallbackText = ids('fallbackText');
  fallback.classList.add('hidden');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    fallbackText.textContent = 'Этот браузер не поддерживает открытие камеры через getUserMedia.';
    fallback.classList.remove('hidden');
    return false;
  }

  try {
    if (state.cameraStream) { state.cameraStream.getTracks().forEach(track => track.stop()); state.cameraStream = null; }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    return true;
  } catch (error) {
    let message = 'Не удалось открыть камеру. Разреши доступ в браузере и перезапусти демо.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      message = 'Камера в большинстве браузеров открывается только по HTTPS. Для показа загрузи проект на GitHub Pages.';
    } else if (error && error.name === 'NotAllowedError') {
      message = 'Доступ к камере отклонён. Разреши камеру для сайта в настройках браузера.';
    } else if (error && error.name === 'NotFoundError') {
      message = 'Камера на устройстве не найдена.';
    }
    fallbackText.textContent = message;
    fallback.classList.remove('hidden');
    return false;
  }
}

function stopCamera() {
  if (state.cameraStream) { state.cameraStream.getTracks().forEach(track => track.stop()); state.cameraStream = null; }
  const video = ids('cameraFeed');
  video.pause(); video.srcObject = null;
}

function startCountdown() {
  switchScreen('countdown');
  const sequence = ['3', '2', '1', 'GO'];
  let index = 0;
  ids('countdownText').textContent = sequence[index];
  ids('countdownLabel').textContent = 'Подготовка к запуску матча';
  clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(async () => {
    index += 1;
    if (index < sequence.length) {
      ids('countdownText').textContent = sequence[index];
      if (sequence[index] === 'GO') ids('countdownLabel').textContent = 'Камера активна';
      return;
    }
    clearInterval(state.countdownTimer);
    switchScreen('battle');
    await requestFullscreenLandscape();
    updateCombatView();
    const started = await requestCamera();
    if (started) pushFeed('КАМЕРА: задняя камера подключена');
    startMatchTimer();
  }, 900);
}

function startMatchTimer() {
  clearInterval(state.matchTimer);
  state.matchSeconds = 180;
  updateTimer();
  state.matchTimer = setInterval(() => {
    state.matchSeconds -= 1;
    updateTimer();
    if (state.matchSeconds <= 0) {
      clearInterval(state.matchTimer);
      stopContinuousFire();
      switchScreen('results');
      renderResults();
    }
  }, 1000);
}

function updateTimer() {
  const minutes = String(Math.floor(state.matchSeconds / 60)).padStart(2, '0');
  const seconds = String(state.matchSeconds % 60).padStart(2, '0');
  ids('timerValue').textContent = `${minutes}:${seconds}`;
}

function triggerDamageEffect() {
  const overlay = ids('damageOverlay');
  overlay.classList.remove('active');
  overlay.offsetWidth;
  overlay.classList.add('active');
}

function showHitMarker() {
  const marker = ids('hitMarker');
  marker.classList.remove('active');
  marker.offsetWidth;
  marker.classList.add('active');
}

function pulseWeapon() {
  ids('weaponWrap').classList.remove('kick');
  ids('weaponWrap').offsetWidth;
  ids('weaponWrap').classList.add('kick');
}

function flashMuzzle() {
  const muzzle = ids('muzzleFlash');
  muzzle.classList.remove('active');
  muzzle.offsetWidth;
  muzzle.classList.add('active');
}

function spawnTracer(target) {
  const layer = ids('fxLayer');
  const tracer = document.createElement('div');
  tracer.className = 'tracer';
  const weaponRect = ids('weaponWrap')?.getBoundingClientRect();
  const startX = weaponRect ? weaponRect.right - Math.max(18, weaponRect.width * 0.06) : window.innerWidth - 108;
  const startY = weaponRect ? weaponRect.top + weaponRect.height * 0.38 : window.innerHeight - 118;
  const endX = (target.x / 100) * window.innerWidth;
  const endY = (target.y / 100) * window.innerHeight;
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  tracer.style.left = `${startX}px`;
  tracer.style.top = `${startY}px`;
  tracer.style.width = `${distance}px`;
  tracer.style.transform = `rotate(${angle}deg)`;
  layer.appendChild(tracer);
  setTimeout(() => tracer.remove(), 160);

  const impact = document.createElement('div');
  impact.className = 'impact';
  impact.style.left = `${endX}px`;
  impact.style.top = `${endY}px`;
  layer.appendChild(impact);
  setTimeout(() => impact.remove(), 220);
}

function reloadAmmo() {
  if (state.reserve <= 0 || state.ammo === 30) {
    showToast('Магазин уже полный', 'warn');
    return;
  }
  const needed = 30 - state.ammo;
  const taken = Math.min(needed, state.reserve);
  state.ammo += taken;
  state.reserve -= taken;
  playReloadSound();
  pushFeed('ОРУЖИЕ: выполнена перезарядка');
  showToast('Перезарядка', 'neutral');
  updateCombatView();
}

function applyTargetHit(target) {
  target.hitPulse = true;
  setTimeout(() => { target.hitPulse = false; updateCombatView(); }, 140);
  target.hp = Math.max(0, target.hp - 8);
  if (target.hp <= 0) {
    target.hp = 100;
    state.teamScores.blue += 1;
    state.teamScores.blueTotal += 1;
    pushFeed(`${state.callsign} устранил ${target.name}`);
    showToast(`Фраг: ${target.name}`, 'enemy');
  } else {
    pushFeed(`ПОПАДАНИЕ: ${target.name} → ${target.hp}%`);
    showToast(`Попадание по ${target.name}`, 'enemy');
  }
}

function performSingleShot() {
  if (state.currentScreen !== 'battle') return;
  const target = state.targets[state.currentTargetIndex];
  if (state.ammo <= 0) {
    showToast('Патроны закончились', 'warn');
    stopContinuousFire();
    return;
  }
  state.ammo -= 1;
  playShotSound();
  flashMuzzle();
  pulseWeapon();
  ids('crosshair').classList.remove('firing');
  ids('crosshair').offsetWidth;
  ids('crosshair').classList.add('firing');
  if (state.isFiring) ids('weaponWrap').classList.add('auto-fire');

  if (!target) {
    pushFeed('ВЫСТРЕЛ: цель не найдена');
    updateCombatView();
    return;
  }

  spawnTracer(target);

  if (target.type === 'ally') {
    showToast(`Свой: ${target.name}`, 'ally');
    pushFeed(`БЛОК: ${target.name} — союзник`);
    updateCombatView();
    return;
  }

  showHitMarker();
  playHitSound();
  applyTargetHit(target);
  updateCombatView();
}

function startContinuousFire() {
  if (state.isFiring) return;
  state.isFiring = true;
  ids('fireBtn').classList.add('active-fire');
  ids('fireSideBtn').classList.add('active-fire');
  ids('weaponWrap').classList.add('auto-fire');
  showToast('Очередь открыта', 'neutral');
  performSingleShot();
  state.firingInterval = setInterval(performSingleShot, 120);
}

function stopContinuousFire() {
  state.isFiring = false;
  clearInterval(state.firingInterval);
  state.firingInterval = null;
  ids('fireBtn')?.classList.remove('active-fire');
  ids('fireSideBtn')?.classList.remove('active-fire');
  ids('weaponWrap')?.classList.remove('auto-fire');
}

function receiveDamage() {
  state.hp = Math.max(0, state.hp - 12);
  triggerDamageEffect();
  pushFeed(`ВХОДЯЩИЙ УРОН → HP ${state.hp}`);
  showToast('Ты получил урон', 'warn');
  updateCombatView();
  if (state.hp <= 0) {
    clearInterval(state.matchTimer);
    stopContinuousFire();
    setTimeout(() => { switchScreen('results'); renderResults(); }, 600);
  }
}

function bindHoldFire(button) {
  const start = (e) => { e.preventDefault(); ensureAudioContext(); startContinuousFire(); };
  const stop = (e) => { if (e) e.preventDefault(); stopContinuousFire(); };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointerleave', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('touchstart', start, { passive: false });
  button.addEventListener('touchend', stop, { passive: false });
  button.addEventListener('mousedown', start);
  button.addEventListener('mouseup', stop);
}

ids('hostBtn').addEventListener('click', () => {
  state.callsign = ids('callsignInput').value.trim() || 'ПРИЗРАК_01';
  state.players[0].name = state.callsign;
  renderPlayers();
  switchScreen('lobby');
});
ids('joinBtn').addEventListener('click', () => { ids('hostBtn').click(); });
ids('startMatchBtn').addEventListener('click', startCountdown);
ids('retryCameraBtn').addEventListener('click', requestCamera);
ids('prevTargetBtn').addEventListener('click', () => { state.currentTargetIndex = (state.currentTargetIndex - 1 + state.targets.length) % state.targets.length; updateCombatView(); });
ids('nextTargetBtn').addEventListener('click', () => { state.currentTargetIndex = (state.currentTargetIndex + 1) % state.targets.length; updateCombatView(); });
ids('damageBtn').addEventListener('click', receiveDamage);
ids('reloadBtn').addEventListener('click', reloadAmmo);
ids('fullscreenBtn').addEventListener('click', requestFullscreenLandscape);
ids('restartBtn').addEventListener('click', () => location.reload());
ids('backToMenuBtn').addEventListener('click', () => { stopCamera(); location.reload(); });
Array.from(document.querySelectorAll('[data-back="menu"]')).forEach(btn => btn.addEventListener('click', () => switchScreen('menu')));

bindHoldFire(ids('fireBtn'));
bindHoldFire(ids('fireSideBtn'));

document.addEventListener('visibilitychange', () => { if (document.hidden) stopContinuousFire(); });
window.addEventListener('pointerup', stopContinuousFire);
window.addEventListener('orientationchange', updateOrientationUI);
window.addEventListener('resize', updateOrientationUI);
updateOrientationUI();
renderPlayers();
updateCombatView();


// V6 patches
function updateHPVisual() {
  const hp = Math.max(0, state.hp);
  const max = 240;
  const fill = document.getElementById('hpBarFill');
  const label = document.getElementById('hpValue');
  if (fill) fill.style.width = `${(hp / max) * 100}%`;
  if (label) label.textContent = `${hp}/${max}`;
}
const oldUpdateCombatView = updateCombatView;
updateCombatView = function() {
  oldUpdateCombatView();
  updateHPVisual();
};
const oldReceiveDamage = receiveDamage;
receiveDamage = function() {
  oldReceiveDamage();
  updateHPVisual();
};
state.hp = 240;
document.getElementById('statusbar').style.display = 'block';
updateHPVisual();
