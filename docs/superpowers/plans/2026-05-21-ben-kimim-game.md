# Ben Kimim Oyunu — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aynı odadaki 3-10 kişinin kendi telefonlarından oynadığı, herkesin bir sonrakine isim yazdığı, geri sayım sonrası her telefonun o kişinin ismini gösterdiği gerçek zamanlı "Ben Kimim" web oyununu yazmak ve Render'a deploy edilebilir hale getirmek.

**Architecture:** Tek Node.js süreci. Express statik dosyaları servis eder, Socket.IO telefonları gerçek zamanlı senkronlar. Oda durumu sunucu belleğinde (Map), veritabanı yok. Zincir mantığı saf fonksiyonlar olarak ayrılır ve birim testlenir; sunucu/istemci bu fonksiyonları kullanır.

**Tech Stack:** Node.js (>=18), Express, Socket.IO, sade HTML/CSS/JS frontend, `node:test` birim testleri.

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `package.json` | Bağımlılıklar, `start`/`test` script'leri |
| `src/rooms.js` | Saf zincir/oyuncu mantığı (IO yok, state yok) |
| `src/roomStore.js` | Bellekteki oda koleksiyonu (oluştur/bul/sil) |
| `server.js` | Express statik servis + Socket.IO olay işleyicileri |
| `public/index.html` | Tek sayfa; tüm ekranlar burada, JS ile değişir |
| `public/style.css` | Mobil öncelikli stil |
| `public/app.js` | Socket istemcisi + ekran durum makinesi |
| `test/rooms.test.js` | `src/rooms.js` birim testleri |
| `test/roomStore.test.js` | `src/roomStore.js` birim testleri |
| `README.md` | Render deploy adımları |

**Not (oyuncu = ayrı tarayıcı):** Kalıcı oyuncu kimliği `localStorage`'da tutulur. Manuel testte her "oyuncu" ayrı bir tarayıcı penceresi/gizli pencere olmalıdır (aynı pencerede aynı `playerId` paylaşılır).

---

### Task 1: Proje iskeleti

**Files:**
- Create: `package.json`

- [ ] **Step 1: package.json oluştur**

```json
{
  "name": "ben-kimim",
  "version": "1.0.0",
  "private": true,
  "description": "Çok oyunculu Ben Kimim (alna koy) mobil oyunu",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  }
}
```

- [ ] **Step 2: Bağımlılıkları kur**

Run: `npm install`
Expected: `node_modules/` oluşur, hata yok. `package-lock.json` yazılır.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: scaffold project with express and socket.io"
```

---

### Task 2: Zincir çekirdek mantığı (TDD)

`targetOf` (kime yazılacak), `wordFor` (oyunda görülen kelime), `allNamesSubmitted`.

**Files:**
- Create: `test/rooms.test.js`
- Create: `src/rooms.js`

- [ ] **Step 1: Başarısız testleri yaz**

`test/rooms.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  targetOf,
  wordFor,
  allNamesSubmitted,
} = require('../src/rooms');

function mk(ids) {
  return ids.map((id) => ({ id, name: id, writtenName: null, connected: true }));
}

test('targetOf: bir sonraki oyuncuyu döner, son -> ilk (halka)', () => {
  const p = mk(['A', 'B', 'C']);
  assert.strictEqual(targetOf(p, 'A').id, 'B');
  assert.strictEqual(targetOf(p, 'B').id, 'C');
  assert.strictEqual(targetOf(p, 'C').id, 'A');
});

test('targetOf: bilinmeyen id veya tek oyuncu için null', () => {
  assert.strictEqual(targetOf(mk(['A', 'B']), 'Z'), null);
  assert.strictEqual(targetOf(mk(['A']), 'A'), null);
});

test('wordFor: önceki oyuncunun yazdığı isim', () => {
  const p = mk(['A', 'B', 'C']);
  p[0].writtenName = 'wa'; // A, B icin yazar
  p[1].writtenName = 'wb'; // B, C icin yazar
  p[2].writtenName = 'wc'; // C, A icin yazar
  assert.strictEqual(wordFor(p, 'B'), 'wa'); // B'nin oncesi A
  assert.strictEqual(wordFor(p, 'C'), 'wb'); // C'nin oncesi B
  assert.strictEqual(wordFor(p, 'A'), 'wc'); // A'nin oncesi C (halka)
});

test('allNamesSubmitted: hepsi dolu mu', () => {
  const p = mk(['A', 'B', 'C']);
  assert.strictEqual(allNamesSubmitted(p), false);
  p.forEach((x) => (x.writtenName = 'x'));
  assert.strictEqual(allNamesSubmitted(p), true);
  p[1].writtenName = ''; // bos isim sayilmaz
  assert.strictEqual(allNamesSubmitted(p), false);
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/rooms'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/rooms.js`:

```js
function indexOfPlayer(players, playerId) {
  return players.findIndex((p) => p.id === playerId);
}

// playerId'nin isim YAZACAĞI kişi (halkada bir sonraki).
function targetOf(players, playerId) {
  const i = indexOfPlayer(players, playerId);
  if (i === -1 || players.length < 2) return null;
  return players[(i + 1) % players.length];
}

// playerId'nin telefonunda GÖRÜNEN kelime = bir ÖNCEKİ oyuncunun yazdığı isim.
function wordFor(players, playerId) {
  const i = indexOfPlayer(players, playerId);
  if (i === -1 || players.length < 2) return null;
  const prev = players[(i - 1 + players.length) % players.length];
  return prev.writtenName;
}

function allNamesSubmitted(players) {
  return (
    players.length >= 2 &&
    players.every((p) => p.writtenName != null && p.writtenName !== '')
  );
}

module.exports = { indexOfPlayer, targetOf, wordFor, allNamesSubmitted };
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test`
Expected: PASS — 4 test geçer.

- [ ] **Step 5: Commit**

```bash
git add src/rooms.js test/rooms.test.js
git commit -m "feat: add chain core logic (targetOf, wordFor, allNamesSubmitted)"
```

---

### Task 3: Zincir yardımcıları (TDD)

`reorderPlayer`, `resetWrittenNames`, `generateCode`.

**Files:**
- Modify: `test/rooms.test.js`
- Modify: `src/rooms.js`

- [ ] **Step 1: Başarısız testleri ekle**

`test/rooms.test.js` dosyasının require satırını şu şekilde güncelle:

```js
const {
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  resetWrittenNames,
  generateCode,
  CODE_LENGTH,
  CODE_ALPHABET,
} = require('../src/rooms');
```

Dosyanın sonuna ekle:

```js
test('reorderPlayer: yukarı/aşağı taşır, yeni dizi döner', () => {
  const p = mk(['A', 'B', 'C']);
  const up = reorderPlayer(p, 'B', 'up');
  assert.deepStrictEqual(up.map((x) => x.id), ['B', 'A', 'C']);
  const down = reorderPlayer(p, 'B', 'down');
  assert.deepStrictEqual(down.map((x) => x.id), ['A', 'C', 'B']);
  assert.deepStrictEqual(p.map((x) => x.id), ['A', 'B', 'C']); // orijinal değişmez
});

test('reorderPlayer: sınırlarda değişiklik yok', () => {
  const p = mk(['A', 'B', 'C']);
  assert.deepStrictEqual(reorderPlayer(p, 'A', 'up').map((x) => x.id), ['A', 'B', 'C']);
  assert.deepStrictEqual(reorderPlayer(p, 'C', 'down').map((x) => x.id), ['A', 'B', 'C']);
});

test('resetWrittenNames: tüm yazılan isimleri temizler', () => {
  const p = mk(['A', 'B']);
  p.forEach((x) => (x.writtenName = 'x'));
  const r = resetWrittenNames(p);
  assert.ok(r.every((x) => x.writtenName === null));
  assert.ok(p.every((x) => x.writtenName === 'x')); // orijinal değişmez
});

test('generateCode: doğru uzunluk ve sadece izinli karakterler', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateCode();
    assert.strictEqual(code.length, CODE_LENGTH);
    assert.ok([...code].every((ch) => CODE_ALPHABET.includes(ch)));
  }
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `reorderPlayer is not a function` (veya benzeri).

- [ ] **Step 3: Implementasyonu ekle**

`src/rooms.js` dosyasının başına ekle:

```js
// Karışması kolay karakterler (I, O, 0, 1) çıkarıldı.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// Oyuncuyu listede yukarı/aşağı taşır. YENİ dizi döner.
function reorderPlayer(players, playerId, direction) {
  const i = players.findIndex((p) => p.id === playerId);
  if (i === -1) return players;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= players.length) return players;
  const next = players.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function resetWrittenNames(players) {
  return players.map((p) => ({ ...p, writtenName: null }));
}
```

`src/rooms.js` sonundaki `module.exports` satırını şununla değiştir:

```js
module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateCode,
  indexOfPlayer,
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  resetWrittenNames,
};
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test`
Expected: PASS — tüm testler (8) geçer.

- [ ] **Step 5: Commit**

```bash
git add src/rooms.js test/rooms.test.js
git commit -m "feat: add reorder, reset and code generation helpers"
```

---

### Task 4: Oda deposu (TDD)

**Files:**
- Create: `test/roomStore.test.js`
- Create: `src/roomStore.js`

- [ ] **Step 1: Başarısız testleri yaz**

`test/roomStore.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { createStore } = require('../src/roomStore');
const { CODE_LENGTH } = require('../src/rooms');

test('createRoom: kod üretir, host ilk oyuncu olur, durum lobby', () => {
  const store = createStore();
  const room = store.createRoom({ id: 'h1', name: 'Emir', socketId: 's1' });
  assert.strictEqual(room.code.length, CODE_LENGTH);
  assert.strictEqual(room.state, 'lobby');
  assert.strictEqual(room.hostId, 'h1');
  assert.strictEqual(room.players.length, 1);
  assert.strictEqual(room.players[0].id, 'h1');
  assert.strictEqual(room.players[0].connected, true);
  assert.strictEqual(room.players[0].writtenName, null);
});

test('getRoom / deleteRoom', () => {
  const store = createStore();
  const room = store.createRoom({ id: 'h1', name: 'Emir' });
  assert.strictEqual(store.getRoom(room.code), room);
  assert.strictEqual(store.getRoom('YOKKK'), null);
  store.deleteRoom(room.code);
  assert.strictEqual(store.getRoom(room.code), null);
});

test('createRoom: benzersiz kodlar (çakışma olmaz)', () => {
  const store = createStore();
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    codes.add(store.createRoom({ id: 'h' + i, name: 'p' }).code);
  }
  assert.strictEqual(codes.size, 200);
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/roomStore'`.

- [ ] **Step 3: Implementasyonu yaz**

`src/roomStore.js`:

```js
const { generateCode } = require('./rooms');

function createStore() {
  const rooms = new Map();

  function uniqueCode() {
    let code;
    do {
      code = generateCode();
    } while (rooms.has(code));
    return code;
  }

  function createRoom(host) {
    const code = uniqueCode();
    const room = {
      code,
      hostId: host.id,
      state: 'lobby',
      players: [
        {
          id: host.id,
          name: host.name,
          writtenName: null,
          connected: true,
          socketId: host.socketId || null,
        },
      ],
      createdAt: Date.now(),
    };
    rooms.set(code, room);
    return room;
  }

  function getRoom(code) {
    return rooms.get(code) || null;
  }

  function deleteRoom(code) {
    rooms.delete(code);
  }

  return { createRoom, getRoom, deleteRoom };
}

module.exports = { createStore };
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `npm test`
Expected: PASS — tüm testler geçer.

- [ ] **Step 5: Commit**

```bash
git add src/roomStore.js test/roomStore.test.js
git commit -m "feat: add in-memory room store"
```

---

### Task 5: Sunucu (Express + Socket.IO + tüm olaylar)

**Files:**
- Create: `server.js`

- [ ] **Step 1: server.js dosyasını tam olarak yaz**

`server.js`:

```js
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createStore } = require('./src/roomStore');
const {
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  resetWrittenNames,
} = require('./src/rooms');

const PORT = process.env.PORT || 3000;
const COUNTDOWN_SECONDS = 5;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);
const store = createStore();

// Oda durumunu (socketId hariç) odadaki herkese yayınla.
function broadcastRoom(room) {
  io.to(room.code).emit('room_update', {
    state: room.state,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
    })),
  });
}

function progressOf(room) {
  const submitted = room.players.filter(
    (p) => p.writtenName != null && p.writtenName !== ''
  ).length;
  return { submitted, total: room.players.length };
}

// Yazma fazını başlat: isimleri temizle, herkese hedefini gönder.
function beginWriting(room) {
  room.players = resetWrittenNames(room.players);
  room.state = 'writing';
  broadcastRoom(room);
  for (const p of room.players) {
    const t = targetOf(room.players, p.id);
    if (p.socketId) {
      io.to(p.socketId).emit('writing_started', { yourTarget: t ? t.name : null });
    }
  }
  io.to(room.code).emit('writing_progress', progressOf(room));
}

function startCountdown(room) {
  room.state = 'countdown';
  io.to(room.code).emit('countdown_started', { seconds: COUNTDOWN_SECONDS });
  setTimeout(() => {
    const r = store.getRoom(room.code);
    if (!r || r.state !== 'countdown') return;
    r.state = 'playing';
    for (const p of r.players) {
      if (p.socketId) {
        io.to(p.socketId).emit('game_started', { yourWord: wordFor(r.players, p.id) });
      }
    }
    broadcastRoom(r);
  }, COUNTDOWN_SECONDS * 1000);
}

// Tekrar bağlanan oyuncuya faza özel veriyi tek sokete gönder.
function sendPhaseState(sock, room, playerId) {
  if (room.state === 'writing') {
    const t = targetOf(room.players, playerId);
    sock.emit('writing_started', { yourTarget: t ? t.name : null });
    sock.emit('writing_progress', progressOf(room));
  } else if (room.state === 'playing') {
    sock.emit('game_started', { yourWord: wordFor(room.players, playerId) });
  }
}

io.on('connection', (socket) => {
  let myCode = null;
  let myPlayerId = null;

  socket.on('create_room', ({ nickname, playerId }, cb) => {
    if (!nickname || !playerId) return cb && cb({ ok: false, error: 'Eksik bilgi' });
    const room = store.createRoom({ id: playerId, name: nickname, socketId: socket.id });
    myCode = room.code;
    myPlayerId = playerId;
    socket.join(room.code);
    if (cb) cb({ ok: true, code: room.code, playerId });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ code, nickname, playerId }, cb) => {
    code = (code || '').toUpperCase().trim();
    if (!playerId) return cb && cb({ ok: false, error: 'Eksik bilgi' });
    const room = store.getRoom(code);
    if (!room) return cb && cb({ ok: false, error: 'Oda bulunamadı' });

    let player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = true;
      player.socketId = socket.id;
      if (nickname) player.name = nickname;
    } else {
      if (room.state !== 'lobby') {
        return cb && cb({ ok: false, error: 'Oyun başladı, şimdi katılamazsın' });
      }
      player = {
        id: playerId,
        name: nickname || 'Oyuncu',
        writtenName: null,
        connected: true,
        socketId: socket.id,
      };
      room.players.push(player);
    }
    myCode = code;
    myPlayerId = playerId;
    socket.join(code);
    if (cb) cb({ ok: true, code, playerId });
    broadcastRoom(room);
    sendPhaseState(socket, room, playerId);
  });

  socket.on('reorder_player', ({ playerId, direction }) => {
    const room = store.getRoom(myCode);
    if (!room || room.hostId !== myPlayerId || room.state !== 'lobby') return;
    room.players = reorderPlayer(room.players, playerId, direction);
    broadcastRoom(room);
  });

  socket.on('start_writing', () => {
    const room = store.getRoom(myCode);
    if (!room || room.hostId !== myPlayerId) return;
    if (room.players.length < 3) return;
    beginWriting(room);
  });

  socket.on('submit_name', ({ name }) => {
    const room = store.getRoom(myCode);
    if (!room || room.state !== 'writing') return;
    const me = room.players.find((p) => p.id === myPlayerId);
    if (!me) return;
    me.writtenName = (name || '').trim();
    io.to(room.code).emit('writing_progress', progressOf(room));
    if (allNamesSubmitted(room.players)) startCountdown(room);
  });

  socket.on('play_again', () => {
    const room = store.getRoom(myCode);
    if (!room || room.hostId !== myPlayerId) return;
    beginWriting(room);
  });

  socket.on('return_to_lobby', () => {
    const room = store.getRoom(myCode);
    if (!room || room.hostId !== myPlayerId) return;
    room.players = resetWrittenNames(room.players);
    room.state = 'lobby';
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = store.getRoom(myCode);
    if (!room) return;
    const wasHost = room.hostId === myPlayerId;
    const me = room.players.find((p) => p.id === myPlayerId);
    if (me) {
      me.connected = false;
      me.socketId = null;
    }
    // Lobide ayrılan oyuncuyu tamamen çıkar (zincir sıradan türetildiği için otomatik düzelir).
    if (room.state === 'lobby') {
      room.players = room.players.filter((p) => p.id !== myPlayerId);
    }
    // Host ayrıldıysa en erken katılmış bağlı oyuncuya devret.
    if (wasHost) {
      const next = room.players.find((p) => p.connected);
      if (next) room.hostId = next.id;
    }
    // Tüm oyuncular kopmuşsa odayı bir süre sonra temizle.
    if (room.players.length === 0 || room.players.every((p) => !p.connected)) {
      setTimeout(() => {
        const r = store.getRoom(room.code);
        if (r && (r.players.length === 0 || r.players.every((p) => !p.connected))) {
          store.deleteRoom(r.code);
        }
      }, EMPTY_ROOM_TTL_MS);
    }
    if (room.players.length > 0) broadcastRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Ben Kimim http://localhost:${PORT} adresinde çalışıyor`);
});
```

- [ ] **Step 2: Sunucunun açıldığını doğrula (smoke test)**

Run: `npm start`
Expected: Konsolda `Ben Kimim http://localhost:3000 adresinde çalışıyor` yazar, çökme yok.
Sonra `Ctrl+C` ile durdur.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add socket.io server with full game lifecycle"
```

---

### Task 6: Frontend — HTML ve CSS

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

- [ ] **Step 1: public/index.html yaz**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Ben Kimim</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <!-- ANA SAYFA -->
  <section id="screen-home" class="screen active">
    <h1>Ben Kimim</h1>
    <input id="nickname" type="text" maxlength="20" placeholder="Takma adın" />
    <button id="btn-create" class="primary">Oda Kur</button>
    <div class="divider">veya</div>
    <input id="join-code" type="text" maxlength="5" placeholder="Oda kodu" autocapitalize="characters" />
    <button id="btn-join">Odaya Katıl</button>
  </section>

  <!-- LOBİ -->
  <section id="screen-lobby" class="screen">
    <h2>Oda Kodu</h2>
    <div id="lobby-code" class="code"></div>
    <ul id="player-list"></ul>
    <p id="lobby-note" class="note"></p>
    <button id="btn-start" class="primary">Başlat</button>
  </section>

  <!-- İSİM YAZMA -->
  <section id="screen-writing" class="screen">
    <div id="writing-form-wrap">
      <p class="label">Şu kişiye bir isim yaz:</p>
      <div id="writing-target" class="target"></div>
      <form id="name-form">
        <input id="name-input" type="text" maxlength="40" placeholder="Örn: Cüneyt Arkın" />
        <button type="submit" class="primary">Gönder</button>
      </form>
    </div>
    <div id="writing-wait" style="display:none">
      <p class="label">Diğerleri yazıyor…</p>
      <div id="writing-count" class="code"></div>
    </div>
  </section>

  <!-- GERİ SAYIM -->
  <section id="screen-countdown" class="screen dark">
    <div id="countdown-number" class="countdown"></div>
    <p class="label light">Telefonu alnına koy!</p>
  </section>

  <!-- OYUN -->
  <section id="screen-playing" class="screen">
    <div id="the-word" class="word"></div>
    <div id="host-controls" class="controls" style="display:none">
      <button id="btn-again" class="primary">Tekrar Oyna</button>
      <button id="btn-lobby">Lobiye Dön</button>
    </div>
  </section>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: public/style.css yaz**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f5f7;
  color: #1a1a2e;
  -webkit-tap-highlight-color: transparent;
}
.screen {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  gap: 16px;
  text-align: center;
}
.screen.active { display: flex; }
.screen.dark { background: #15151f; color: #fff; }

h1 { font-size: 2.4rem; margin-bottom: 12px; }
h2 { font-size: 1.2rem; color: #555; }

input {
  width: 100%;
  max-width: 360px;
  font-size: 1.2rem;
  padding: 14px 16px;
  border: 2px solid #ccd;
  border-radius: 12px;
  text-align: center;
}
button {
  width: 100%;
  max-width: 360px;
  font-size: 1.2rem;
  padding: 14px 16px;
  border: none;
  border-radius: 12px;
  background: #e3e3ef;
  color: #1a1a2e;
  cursor: pointer;
}
button.primary { background: #4f46e5; color: #fff; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.divider { color: #999; font-size: 0.95rem; }

.code {
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: 6px;
  color: #4f46e5;
}
.note { color: #666; font-size: 0.95rem; }
.label { font-size: 1.1rem; color: #444; }
.label.light { color: #ddd; }
.target { font-size: 2rem; font-weight: 700; color: #4f46e5; }

#player-list {
  list-style: none;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.player {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 1.1rem;
}
.player.offline { opacity: 0.5; }
.reorder { display: flex; gap: 6px; }
.reorder button {
  width: 40px;
  padding: 6px;
  font-size: 1rem;
}

.countdown {
  font-size: 7rem;
  font-weight: 900;
  color: #fff;
}

/* Oyun ekranı: telefonu alna koyunca büyük ve okunaklı */
#screen-playing { background: #fff; justify-content: center; }
.word {
  font-size: 14vw;
  line-height: 1.1;
  font-weight: 900;
  color: #111;
  padding: 0 16px;
  word-break: break-word;
}
.controls { margin-top: 32px; display: flex; flex-direction: column; gap: 12px; width: 100%; align-items: center; }

@media (min-width: 600px) {
  .word { font-size: 5rem; }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: add frontend markup and mobile-first styles"
```

---

### Task 7: Frontend — istemci JS (durum makinesi)

**Files:**
- Create: `public/app.js`

- [ ] **Step 1: public/app.js yaz**

```js
const socket = io();

// Kalıcı oyuncu kimliği (yenileme/kopma sonrası aynı slota döner).
let playerId = localStorage.getItem('benkimim_pid');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  localStorage.setItem('benkimim_pid', playerId);
}
let myCode = localStorage.getItem('benkimim_code') || null;
let myName = localStorage.getItem('benkimim_name') || '';
let isHost = false;
let wakeLock = null;
let countdownTimer = null;

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
  document.getElementById('the-word').textContent = data.yourWord || '';
  document.getElementById('host-controls').style.display = isHost ? '' : 'none';
  showScreen('playing');
  requestWakeLock();
});
```

- [ ] **Step 2: Commit**

```bash
git add public/app.js
git commit -m "feat: add client-side socket logic and screen state machine"
```

---

### Task 8: Uçtan uca manuel test (çok pencereli)

**Files:** yok (doğrulama görevi)

- [ ] **Step 1: Sunucuyu başlat**

Run: `npm start`
Expected: `http://localhost:3000` çalışıyor.

- [ ] **Step 2: 3 oyuncu ile tam akışı dene**

Aşağıdakileri sırayla yap. **Her oyuncu için ayrı bir gizli pencere (incognito) aç** — aksi halde aynı `playerId` paylaşılır.

1. Pencere A: takma ad "Emir" → "Oda Kur". → Lobi açılır, 5 haneli kod görünür, "Emir 👑" listede, "Başlat" pasif (1 kişi).
2. Pencere B: takma ad "Ali" + kodu gir → "Odaya Katıl". → A ve B'de liste 2 kişiye çıkar.
3. Pencere C: takma ad "Veli" + kod → katıl. → 3 kişi. A'da (host) "Başlat" aktif olur.
4. Pencere A'da bir oyuncunun ▲/▼ oklarıyla sırayı değiştir. → Üç pencerede de liste sırası anında güncellenir.
5. Pencere A'da "Başlat". → Üç pencere de "İsim Yazma"ya geçer; her birinde **farklı** bir hedef ismi görünür (zincirdeki bir sonraki kişi).
6. Her pencerede hedefe bir isim yaz, "Gönder". İlk gönderenlerde "Diğerleri yazıyor… n/3" sayacı artar.
7. Üçüncü isim gönderilince üç pencere de eşzamanlı geri sayım (5→1→👀) gösterir, sonra her pencere **kendi** kelimesini tam ekran gösterir.
8. Doğrula: A'nın gördüğü kelime = zincirde A'dan önceki oyuncunun yazdığı isim. (Sıraya göre kontrol et.)
9. Pencere A'da (host) "Tekrar Oyna". → Üç pencere yeniden "İsim Yazma"ya döner, yeni hedeflerle. Akış tekrar çalışır.
10. Pencere A'da (host) "Lobiye Dön". → Üç pencere lobiye döner.

Expected: Tüm adımlar tarif edildiği gibi çalışır.

- [ ] **Step 3: Kopma/yeniden bağlanma ve host devri**

1. Oyun "İsim Yazma" veya "Oyun" fazındayken Pencere B'yi yenile (F5). → B aynı faza geri döner (hedefi/kelimesi tekrar görünür), A ve C'de B "(bağlı değil)" sonra tekrar bağlı görünür.
2. Lobideyken host (A) penceresini kapat. → B ve C'de host tacı 👑 kalan en erken oyuncuya geçer; yeni host "Başlat" görür.

Expected: Yeniden bağlanma slotu korur; host devri çalışır.

- [ ] **Step 4: Test bulgusu varsa düzelt**

Bir adım başarısız olursa: ilgili dosyada düzelt, `npm start` ile yeniden dene, sonra düzeltmeyi commit'le. Sorun yoksa bu adımı atla.

---

### Task 9: README ve Render deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md yaz**

```markdown
# Ben Kimim

Aynı odadaki 3-10 arkadaşın kendi telefonlarından oynadığı "Ben Kimim" (alna koy)
oyunu. Herkes sırayla bir sonrakine isim yazar; geri sayım sonrası her telefon o
kişiye yazılan ismi gösterir. Bilen telefonu alnından alır. "Tekrar Oyna" ile yeni tur.

## Lokal çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

Her oyuncu ayrı telefondan/cihazdan girer. Aynı bilgisayarda test için her oyuncuyu
ayrı bir gizli (incognito) pencerede aç.

## Test

```bash
npm test
```

## Render'a deploy

1. Bu projeyi bir GitHub reposuna push'la.
2. [render.com](https://render.com) → **New** → **Web Service** → GitHub reposunu bağla.
3. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (yeterli)
4. Deploy bitince verilen `https://...onrender.com` adresini arkadaşlarınla paylaş.

Notlar:
- Sunucu `PORT` ortam değişkenini otomatik kullanır (Render bunu sağlar).
- Ücretsiz katman boştayken uyur; ilk açılış ~30 sn sürebilir.
- Oda durumu bellektedir; sunucu yeniden başlarsa açık odalar kaybolur.
```

- [ ] **Step 2: Deploy yapılandırmasını doğrula**

Run: `node -e "const p=require('./package.json'); if(p.scripts.start!=='node server.js') throw new Error('start script yanlış'); console.log('start script OK')"`
Expected: `start script OK`

Run: `grep -n "process.env.PORT" server.js`
Expected: `PORT = process.env.PORT || 3000` satırı görünür.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with Render deploy instructions"
```

---

## Tamamlanma Kontrolü

- [ ] `npm test` tüm birim testleri geçer
- [ ] `npm start` ile lokalde 3 oyunculu tam akış çalışır (Task 8)
- [ ] Kopma/yeniden bağlanma ve host devri çalışır
- [ ] README'de Render adımları var, `start` script'i ve `PORT` doğru
- [ ] Tüm değişiklikler commit'lenmiş
