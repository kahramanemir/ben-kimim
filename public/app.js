const socket = io();

// Kalıcı oyuncu kimliği (yenileme/kopma sonrası aynı slota döner).
let playerId = localStorage.getItem('benkimim_pid');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  localStorage.setItem('benkimim_pid', playerId);
}
// Oda kodu sessionStorage'da tutulur: aynı sekmede yenileme/kopma sonrası
// odaya geri dönülür, ama site yeni sekmede ya da sonradan açıldığında eski
// odaya otomatik atmaz (ana sayfaya gelir).
let myCode = sessionStorage.getItem('benkimim_code') || null;
let myName = localStorage.getItem('benkimim_name') || '';
let isHost = false;
let wakeLock = null;
let countdownTimer = null;
let revealTimer = null;
let myWord = '';

// Oyuncu kim olduğunu görmeden önce beklemesi gereken süre.
const REVEAL_SECONDS = 15;

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

document.getElementById('btn-create').addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) return alert('Bir takma ad gir');
  myName = nickname;
  localStorage.setItem('benkimim_name', myName);
  socket.emit('create_room', { nickname, playerId }, (res) => {
    if (!res || !res.ok) return alert((res && res.error) || 'Hata');
    myCode = res.code;
    sessionStorage.setItem('benkimim_code', myCode);
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
    sessionStorage.setItem('benkimim_code', myCode);
  });
});

// ---- Lobi ----
function renderLobby(data) {
  document.getElementById('lobby-code').textContent = myCode || '';
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
    }
    list.appendChild(li);
  });
  const startBtn = document.getElementById('btn-start');
  const note = document.getElementById('lobby-note');
  if (isHost) {
    startBtn.style.display = '';
    startBtn.disabled = data.players.length < 3;
    note.textContent =
      data.players.length < 3 ? 'Başlamak için en az 3 kişi gerekli' : 'Sırayı ayarla, hazırsan başlat';
  } else {
    startBtn.style.display = 'none';
    note.textContent = 'Host başlatınca oyun başlayacak';
  }
}

document.getElementById('btn-start').addEventListener('click', () => socket.emit('start_writing'));

// Odadan bilinçli çıkış: sunucudan ayrıl, kayıtlı kodu temizle, ana sayfaya dön.
function leaveRoom() {
  socket.emit('leave_room');
  myCode = null;
  sessionStorage.removeItem('benkimim_code');
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

// ---- İsim yazma ----
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

// ---- Kim olduğunu öğrenme akışı ----
// Oyun başlayınca kelime gizli kalır: önce 15 sn sayaç, sonra "Ben Kimim?" butonu çıkar.
function startReveal(word) {
  myWord = word || '';
  const waitEl = document.getElementById('reveal-wait');
  const timerEl = document.getElementById('reveal-timer');
  const revealBtn = document.getElementById('btn-reveal');
  const wordEl = document.getElementById('the-word');

  // Başlangıç durumuna sıfırla.
  if (revealTimer) clearInterval(revealTimer);
  wordEl.style.display = 'none';
  wordEl.textContent = '';
  revealBtn.style.display = 'none';
  waitEl.style.display = '';

  let n = REVEAL_SECONDS;
  timerEl.textContent = n;
  revealTimer = setInterval(() => {
    n -= 1;
    timerEl.textContent = n;
    if (n <= 0) {
      clearInterval(revealTimer);
      revealTimer = null;
      waitEl.style.display = 'none';
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

// ---- Socket olayları ----
socket.on('connect', () => {
  if (myCode && myName) {
    socket.emit('join_room', { code: myCode, nickname: myName, playerId }, (res) => {
      if (!res || !res.ok) {
        sessionStorage.removeItem('benkimim_code');
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
  if (data.state === 'lobby') {
    renderLobby(data);
    showScreen('lobby');
  } else if (data.state === 'writing') {
    showScreen('writing');
  } else if (data.state === 'playing') {
    document.getElementById('host-controls').style.display = isHost ? '' : 'none';
    showScreen('playing');
  }
});

socket.on('writing_started', (data) => {
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
  showScreen('countdown');
  let n = data.seconds;
  const el = document.getElementById('countdown-number');
  el.textContent = n;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n -= 1;
    el.textContent = n > 0 ? n : '👀';
    if (n <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
});

socket.on('game_started', (data) => {
  document.getElementById('host-controls').style.display = isHost ? '' : 'none';
  showScreen('playing');
  startReveal(data.yourWord);
  requestWakeLock();
});
