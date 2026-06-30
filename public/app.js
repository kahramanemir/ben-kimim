const socket = io();

// Kalıcı oyuncu kimliği (yenileme/kopma sonrası aynı slota döner).
let playerId = localStorage.getItem('benkimim_pid');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  localStorage.setItem('benkimim_pid', playerId);
}
// Oda kodu localStorage'da tutulur: sekme/tarayıcı kapatılsa bile aynı odaya
// geri dönülebilir. QR/link ile gelen ziyaretçiler için blok aşağıda bu değeri
// sıfırlar, böylece eski odaya otomatik atılmaz.
let myCode = localStorage.getItem('benkimim_code') || null;
let myName = localStorage.getItem('benkimim_name') || '';
let isHost = false;
let currentHostId = null;
let wakeLock = null;
let countdownTimer = null;
let revealTimer = null;
let myWord = '';
let playingPlayers = [];
let guessedAt = {};

// Kelimenin alında herkese açık göründüğü süre (sonra "Ben Kimim?" gelir).
const REVEAL_SECONDS = 10;

const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  writing: document.getElementById('screen-writing'),
  countdown: document.getElementById('screen-countdown'),
  playing: document.getElementById('screen-playing'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  if (name !== 'playing') releaseWakeLock();
}

// ---- Wake lock (ekran uyumasın) ----
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    /* desteklenmiyorsa sessiz geç */
  }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// ---- Ana sayfa ----
const nicknameInput = document.getElementById('nickname');
const codeInput = document.getElementById('join-code');
nicknameInput.value = myName;

// QR/link ile gelen ziyaretçi: oda kodunu ön-doldur, eski kayıtlı odaya otomatik dönme.
const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().trim();
if (urlRoom) {
  codeInput.value = urlRoom;
  myCode = null;
  localStorage.removeItem('benkimim_code');
  history.replaceState({}, '', location.pathname);
  nicknameInput.focus();
}

document.getElementById('btn-create').addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return alert('Bir takma ad gir');
  myName = nickname;
  localStorage.setItem('benkimim_name', myName);
  socket.emit('create_room', { nickname, playerId }, (res) => {
    if (!res || !res.ok) return alert((res && res.error) || 'Hata');
    myCode = res.code;
    localStorage.setItem('benkimim_code', myCode);
  });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  if (!nickname) return alert('Bir takma ad gir');
  if (!code) return alert('Oda kodu gir');
  myName = nickname;
  localStorage.setItem('benkimim_name', myName);
  socket.emit('join_room', { code, nickname, playerId }, (res) => {
    if (!res || !res.ok) return alert((res && res.error) || 'Hata');
    myCode = res.code;
    localStorage.setItem('benkimim_code', myCode);
  });
});

// ---- Lobi ----
function renderQR(code) {
  const el = document.getElementById('lobby-qr');
  el.innerHTML = '';
  if (!code || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'M');
  qr.addData(location.origin + '/?room=' + code);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}

function renderLobby(data) {
  document.getElementById('lobby-code').textContent = myCode || '';
  renderQR(myCode);
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  data.players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'player' + (p.connected ? '' : ' offline');
    const nameSpan = document.createElement('span');
    nameSpan.textContent =
      p.name + (p.id === data.hostId ? ' 👑' : '') + (p.connected ? '' : ' (bağlı değil)');
    li.appendChild(nameSpan);
    if (isHost) {
      const ctrl = document.createElement('span');
      ctrl.className = 'reorder';
      const up = document.createElement('button');
      up.textContent = '▲';
      up.disabled = idx === 0;
      up.onclick = () => socket.emit('reorder_player', { playerId: p.id, direction: 'up' });
      const down = document.createElement('button');
      down.textContent = '▼';
      down.disabled = idx === data.players.length - 1;
      down.onclick = () => socket.emit('reorder_player', { playerId: p.id, direction: 'down' });
      ctrl.appendChild(up);
      ctrl.appendChild(down);
      li.appendChild(ctrl);
      if (p.id !== playerId) {
        const kick = document.createElement('button');
        kick.className = 'kick';
        kick.textContent = '✕';
        kick.onclick = () => {
          if (confirm(p.name + ' oyuncusunu atmak istiyor musun?')) {
            socket.emit('kick_player', { playerId: p.id });
          }
        };
        li.appendChild(kick);
      }
    }
    list.appendChild(li);
  });
  const startBtn = document.getElementById('btn-start');
  const shuffleBtn = document.getElementById('btn-shuffle');
  const note = document.getElementById('lobby-note');
  if (isHost) {
    startBtn.style.display = '';
    startBtn.disabled = data.players.length < 3;
    shuffleBtn.style.display = '';
    shuffleBtn.disabled = data.players.length < 2;
    note.textContent =
      data.players.length < 3 ? 'Başlamak için en az 3 kişi gerekli' : 'Sırayı ayarla, hazırsan başlat';
  } else {
    startBtn.style.display = 'none';
    shuffleBtn.style.display = 'none';
    note.textContent = 'Host başlatınca oyun başlayacak';
  }
}

document.getElementById('btn-start').addEventListener('click', () => socket.emit('start_writing'));
document.getElementById('btn-shuffle').addEventListener('click', () => socket.emit('shuffle_players'));

document.getElementById('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(myCode || '');
    const b = document.getElementById('btn-copy');
    const old = b.textContent;
    b.textContent = '✓ Kopyalandı';
    setTimeout(() => { b.textContent = old; }, 1500);
  } catch (e) { /* kopyalama desteklenmiyorsa sessiz geç */ }
});

const shareBtn = document.getElementById('btn-share');
if (navigator.share) {
  shareBtn.style.display = '';
  shareBtn.addEventListener('click', () => {
    navigator
      .share({ title: 'Ben Kimim', text: 'Odama katıl: ' + myCode, url: location.origin + '/?room=' + myCode })
      .catch(() => {});
  });
}

// Odadan bilinçli çıkış: sunucudan ayrıl, kayıtlı kodu temizle, ana sayfaya dön.
function leaveRoom() {
  socket.emit('leave_room');
  myCode = null;
  localStorage.removeItem('benkimim_code');
  if (countdownTimer) clearInterval(countdownTimer);
  if (revealTimer) clearInterval(revealTimer);
  releaseWakeLock();
  showScreen('home');
}

document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});
document.getElementById('btn-leave-playing').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});
document.getElementById('btn-leave-writing').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});
document.getElementById('btn-leave-countdown').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});

// ---- İsim yazma ----
// İstemci içi öneri havuzları (sunucu değişmez).
const NAME_POOLS = {
  'Ünlüler': ['Cüneyt Arkın', 'Kemal Sunal', 'Türkan Şoray', 'Barış Manço', 'Tarkan', 'Sezen Aksu', 'Adile Naşit', 'Cem Yılmaz'],
  'Çizgi film': ['Tom & Jerry', 'Külkedisi', 'Pikachu', 'Sünger Bob', 'Bugs Bunny', 'Şirinler', 'Heidi', 'Pink Panther'],
  'Futbolcu': ['Lionel Messi', 'Cristiano Ronaldo', 'Arda Güler', 'Hakan Şükür', 'Maradona', 'Zinedine Zidane', 'Ronaldinho', 'Mauro Icardi'],
  'Tarihi': ['Atatürk', 'Fatih Sultan Mehmet', 'Napolyon', 'Kleopatra', 'Albert Einstein', 'Nikola Tesla', 'Kanuni Sultan Süleyman', 'Mevlana'],
  'Hayvan': ['Aslan', 'Penguen', 'Zürafa', 'Kanguru', 'Yunus', 'Kaplumbağa', 'Şahin', 'Panda'],
};

document.getElementById('btn-suggest').addEventListener('click', () => {
  const cat = document.getElementById('category-select').value;
  const pool = NAME_POOLS[cat] || [];
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById('name-input').value = pick;
});

document.getElementById('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const val = document.getElementById('name-input').value.trim();
  if (!val) return;
  socket.emit('submit_name', { name: val });
  document.getElementById('writing-form-wrap').style.display = 'none';
  document.getElementById('writing-wait').style.display = '';
});

// ---- Oyun host kontrolleri ----
document.getElementById('btn-again').addEventListener('click', () => socket.emit('play_again'));
document.getElementById('btn-lobby').addEventListener('click', () => socket.emit('return_to_lobby'));

// ---- Ses + titreşim yardımcıları (best-effort, desteklenmiyorsa sessiz) ----
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}
function beep(freq, dur) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    o.start();
    o.stop(ctx.currentTime + dur);
    o.onended = () => ctx.close();
  } catch (e) {}
}

// ---- Oyun ekranı: Bilenler listesi ----
function renderPlaying() {
  const list = document.getElementById('guess-list');
  list.innerHTML = '';
  const guessed = playingPlayers
    .filter((p) => guessedAt[p.id] != null)
    .sort((a, b) => guessedAt[a.id] - guessedAt[b.id]);
  const pending = playingPlayers.filter((p) => guessedAt[p.id] == null);
  guessed.forEach((p, i) => list.appendChild(playerRow(p, i + 1 + '. ' + p.name + ' 🎉')));
  pending.forEach((p) => list.appendChild(playerRow(p, p.name + ' — tahmin ediyor')));
}

function playerRow(p, label) {
  const li = document.createElement('li');
  li.className = 'player';
  const span = document.createElement('span');
  span.textContent = label + (p.id === currentHostId ? ' 👑' : '');
  li.appendChild(span);
  if (isHost && p.id !== playerId) {
    const kick = document.createElement('button');
    kick.className = 'kick';
    kick.textContent = '✕';
    kick.onclick = () => {
      if (confirm(p.name + ' oyuncusunu atmak istiyor musun?')) {
        socket.emit('kick_player', { playerId: p.id });
      }
    };
    li.appendChild(kick);
  }
  return li;
}

// ---- Kim olduğunu öğrenme akışı ----
// Oyun başlayınca kelime önce 10 sn açıkça görünür (telefon alında, karşıdakiler
// okur). Süre dolunca kelime gizlenir ve "Ben Kimim?" butonu çıkar.
function startReveal(word) {
  myWord = word || '';
  const timerEl = document.getElementById('reveal-timer');
  const revealBtn = document.getElementById('btn-reveal');
  const wordEl = document.getElementById('the-word');

  if (revealTimer) clearInterval(revealTimer);
  // Kelimeyi göster + kalan süre sayacını başlat.
  revealBtn.style.display = 'none';
  wordEl.textContent = myWord;
  wordEl.style.display = '';

  let n = REVEAL_SECONDS;
  timerEl.textContent = n + ' sn';
  timerEl.style.display = '';
  revealTimer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      timerEl.textContent = n + ' sn';
    } else {
      // Süre doldu: kelimeyi gizle, "Ben Kimim?" butonunu çıkar.
      clearInterval(revealTimer);
      revealTimer = null;
      timerEl.style.display = 'none';
      wordEl.style.display = 'none';
      revealBtn.style.display = '';
    }
  }, 1000);
}

document.getElementById('btn-reveal').addEventListener('click', () => {
  if (!confirm('Emin misin? Kim olduğunu göreceksin.')) return;
  document.getElementById('btn-reveal').style.display = 'none';
  const wordEl = document.getElementById('the-word');
  wordEl.textContent = myWord;
  wordEl.style.display = '';
});

document.getElementById('btn-guessed').addEventListener('click', () => {
  socket.emit('guessed');
});

// ---- Socket olayları ----
socket.on('connect', () => {
  if (myCode && myName) {
    socket.emit('join_room', { code: myCode, nickname: myName, playerId }, (res) => {
      if (!res || !res.ok) {
        localStorage.removeItem('benkimim_code');
        myCode = null;
        showScreen('home');
      }
    });
  } else {
    showScreen('home');
  }
});

socket.on('room_update', (data) => {
  isHost = data.hostId === playerId;
  currentHostId = data.hostId;
  if (data.state === 'lobby') {
    renderLobby(data);
    showScreen('lobby');
  } else if (data.state === 'writing') {
    showScreen('writing');
  } else if (data.state === 'playing') {
    document.getElementById('host-controls').style.display = isHost ? '' : 'none';
    playingPlayers = data.players.map((p) => ({ id: p.id, name: p.name }));
    renderPlaying();
    showScreen('playing');
  }
});

socket.on('kicked', () => {
  alert('Odadan atıldın');
  myCode = null;
  localStorage.removeItem('benkimim_code');
  if (countdownTimer) clearInterval(countdownTimer);
  if (revealTimer) clearInterval(revealTimer);
  releaseWakeLock();
  showScreen('home');
});

socket.on('writing_started', (data) => {
  guessedAt = {};
  document.getElementById('writing-target').textContent = data.yourTarget || '';
  document.getElementById('name-input').value = '';
  document.getElementById('writing-form-wrap').style.display = '';
  document.getElementById('writing-wait').style.display = 'none';
  showScreen('writing');
});

socket.on('writing_progress', (data) => {
  document.getElementById('writing-count').textContent = data.submitted + '/' + data.total;
});

socket.on('countdown_started', (data) => {
  buzz([120, 60, 120]);
  beep(880, 0.15);
  showScreen('countdown');
  let n = data.seconds;
  const el = document.getElementById('countdown-number');
  el.textContent = n;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n -= 1;
    el.textContent = n > 0 ? n : '👀';
    if (n <= 0) {
      buzz([300]);
      beep(1320, 0.25);
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
});

socket.on('game_started', (data) => {
  guessedAt = {};
  document.getElementById('host-controls').style.display = isHost ? '' : 'none';
  showScreen('playing');
  startReveal(data.yourWord);
  requestWakeLock();
});

socket.on('guesses', (data) => {
  guessedAt = {};
  data.players.forEach((p) => { guessedAt[p.id] = p.guessedAt; });
  playingPlayers = data.players.map((p) => ({ id: p.id, name: p.name }));
  renderPlaying();
});
