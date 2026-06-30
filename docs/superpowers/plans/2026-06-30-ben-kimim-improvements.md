# Ben Kimim — İyileştirmeler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut "Ben Kimim" oyununa reconnect dayanıklılığı, host kick, QR ile katılma, kategori önerisi, geri sayım ses/titreşim ve tur sonu "Bilenler" listesi eklemek; yazma fazı kilitlenmelerini gidermek.

**Architecture:** Saf zincir mantığı `src/rooms.js`'te (durumsuz, unit-test'li). `server.js` Socket.IO olaylarını yönlendirir ve `rooms.js`'i kullanır. İstemci `public/` altında tek `app.js`. QR istemcide vendored `qrcode.js` ile üretilir (CDN yok).

**Tech Stack:** Node >=18, Express, Socket.IO, `node:test` (yerleşik), istemci tarafı vanilla JS, `qrcode-generator` (vendored UMD).

## Global Constraints

- Node sürümü: `>=18` (package.json engines korunur).
- Test komutu: `npm test` → `node --test`. **Mevcut 16 test her zaman yeşil kalmalı.**
- Arayüz metinleri Türkçe (mevcut üslupla tutarlı).
- Harici CDN/servis YOK; QR kütüphanesi `public/vendor/` altına vendored edilir.
- Bellekte oda durumu korunur; veritabanı eklenmez.
- "Yazmayanları atla / zorla başlat" ÖZELLİĞİ EKLENMEZ.
- Birikimli puan EKLENMEZ; skor sadece tur içi "Bilenler" listesi.

---

### Task 1: Saf room yardımcıları (rooms.js)

**Files:**
- Modify: `src/rooms.js`
- Test: `test/rooms.test.js`

**Interfaces:**
- Produces:
  - `removePlayer(players, playerId) -> Player[]` — yeni dizi, verilen id'siz.
  - `resetGuesses(players) -> Player[]` — her elemanın `guessedAt: null` olduğu yeni dizi.
  - `guessesPayload(players) -> {id, name, guessedAt}[]` — yayın için sade liste.

- [ ] **Step 1: Yeni testleri yaz** — `test/rooms.test.js` sonuna ekle:

```js
const { removePlayer, resetGuesses, guessesPayload } = require('../src/rooms');

test('removePlayer: verilen id listeden çıkarılır, yeni dizi döner', () => {
  const p = mk(['A', 'B', 'C']);
  const r = removePlayer(p, 'B');
  assert.deepStrictEqual(r.map((x) => x.id), ['A', 'C']);
  assert.deepStrictEqual(p.map((x) => x.id), ['A', 'B', 'C']); // orijinal değişmez
});

test('removePlayer: bilinmeyen id için aynı içerikli yeni dizi', () => {
  const p = mk(['A', 'B']);
  assert.deepStrictEqual(removePlayer(p, 'Z').map((x) => x.id), ['A', 'B']);
});

test('resetGuesses: tüm guessedAt null olur, yeni dizi döner', () => {
  const p = mk(['A', 'B']);
  p[0].guessedAt = 123;
  const r = resetGuesses(p);
  assert.ok(r.every((x) => x.guessedAt === null));
  assert.strictEqual(p[0].guessedAt, 123); // orijinal değişmez
});

test('guessesPayload: id, name, guessedAt döner (yoksa null)', () => {
  const p = mk(['A', 'B']);
  p[0].guessedAt = 5;
  assert.deepStrictEqual(guessesPayload(p), [
    { id: 'A', name: 'A', guessedAt: 5 },
    { id: 'B', name: 'B', guessedAt: null },
  ]);
});
```

Not: dosyanın başındaki tek `require('../src/rooms')` satırına bu üç ismi eklemek yerine
ikinci bir require eklemek de çalışır; isteğe göre tek require'a birleştir.

- [ ] **Step 2: Testlerin başarısız olduğunu gör**

Run: `node --test test/rooms.test.js`
Expected: FAIL — `removePlayer is not a function` benzeri.

- [ ] **Step 3: Yardımcıları ekle** — `src/rooms.js`'te `resetWrittenNames`'ten hemen sonra:

```js
// Verilen id'li oyuncuyu çıkarır. YENİ dizi döner.
function removePlayer(players, playerId) {
  return players.filter((p) => p.id !== playerId);
}

// Tur içi "bildim" işaretlerini temizler. YENİ dizi döner.
function resetGuesses(players) {
  return players.map((p) => ({ ...p, guessedAt: null }));
}

// "Bilenler" yayını için sade liste.
function guessesPayload(players) {
  return players.map((p) => ({ id: p.id, name: p.name, guessedAt: p.guessedAt ?? null }));
}
```

`module.exports` bloğuna ekle: `removePlayer, resetGuesses, guessesPayload,`

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `node --test test/rooms.test.js`
Expected: PASS (yeni 4 test dahil).

- [ ] **Step 5: Commit**

```bash
git add src/rooms.js test/rooms.test.js
git commit -m "feat: removePlayer/resetGuesses/guessesPayload saf yardımcıları"
```

---

### Task 2: Sunucu — oyuncu çıkarma, kick ve faz kurtarma

**Files:**
- Modify: `server.js`
- Test: `test/integration.test.js`

**Interfaces:**
- Consumes (Task 1): `removePlayer`, `resetGuesses`.
- Produces (sunucu olayları):
  - İstemci→sunucu: `kick_player { playerId }`.
  - Sunucu→istemci: `kicked` (atılan sokete).
  - `sendPhaseState` artık `countdown` durumunda `countdown_started { seconds }` yollar.
  - `afterPlayerRemoved(room, wasHost)` iç yardımcı — çıkarma sonrası zincir/host/faz toparlama.

- [ ] **Step 1: Entegrasyon testlerini yaz** — önce `startServer`'ı parametrik yap. `test/integration.test.js`'te imzayı değiştir:

```js
function startServer(countdown = '1') {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), COUNTDOWN_SECONDS: countdown },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
    child.stdout.on('data', (d) => {
      if (d.toString().includes('çalışıyor')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', reject);
  });
}
```

Dosyanın sonuna üç test ekle:

```js
test('host kick: atılan oyuncu listeden düşer ve kicked alır', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => { c1.close(); c2.close(); c3.close(); server.kill(); });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await sees3;

  const kicked = once(c3, 'kicked');
  const sees2 = waitForPlayers(c1, 2);
  c1.emit('kick_player', { playerId: 'p3' });
  await kicked;
  const after = await sees2;
  assert.deepStrictEqual(after.players.map((p) => p.id), ['p1', 'p2']);
});

test('yazma fazında oyuncu ayrılınca kalan herkes yazmışsa geri sayım başlar', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => { c1.close(); c2.close(); c3.close(); server.kill(); });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await sees3;

  const w1 = once(c1, 'writing_started');
  c1.emit('start_writing');
  await w1;

  // p1 ve p2 yazar; c1 "2 gönderdi" ilerlemesini görene kadar bekle (deterministik)
  const prog = new Promise((resolve) => {
    const h = (d) => { if (d.submitted === 2) { c1.off('writing_progress', h); resolve(); } };
    c1.on('writing_progress', h);
  });
  c1.emit('submit_name', { name: 'W1' });
  c2.emit('submit_name', { name: 'W2' });
  await prog;

  // p3 yazmadan ayrılır -> kalan p1,p2 yazmış -> geri sayım -> game_started
  const g1 = once(c1, 'game_started');
  c3.emit('leave_room');
  const word1 = await g1;
  assert.strictEqual(word1.yourWord, 'W2'); // 2 kişilik halkada p1'in öncesi p2
});

test('geri sayım sırasında yeniden bağlanan oyuncu countdown_started alır', async (t) => {
  const server = await startServer('5');
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  let c2b;
  t.after(() => { c1.close(); c3.close(); if (c2b) c2b.close(); server.kill(); });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await sees3;

  const cd1 = once(c1, 'countdown_started');
  c1.emit('start_writing');
  await once(c1, 'writing_started');
  c1.emit('submit_name', { name: 'W1' });
  c2.emit('submit_name', { name: 'W2' });
  c3.emit('submit_name', { name: 'W3' });
  await cd1; // geri sayım başladı (5s)

  // c2 kopar, p2 "bağlı değil" görününce yeniden bağlan
  const p2Off = new Promise((resolve) => {
    const h = (d) => {
      const p2 = d.players.find((x) => x.id === 'p2');
      if (p2 && !p2.connected) { c1.off('room_update', h); resolve(); }
    };
    c1.on('room_update', h);
  });
  c2.close();
  await p2Off;

  c2b = connect();
  const cd2 = once(c2b, 'countdown_started');
  await emitAck(c2b, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  const data = await cd2;
  assert.strictEqual(data.seconds, 5);
});
```

- [ ] **Step 2: Testlerin başarısız olduğunu gör**

Run: `node --test test/integration.test.js`
Expected: FAIL — `kicked` gelmez / countdown reconnect zaman aşımı.

- [ ] **Step 3: Sunucuyu güncelle** — `server.js` importuna ekle (`./src/rooms`'ten): `removePlayer`, `resetGuesses`, `guessesPayload`. Yani:

```js
const {
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  shufflePlayers,
  resetWrittenNames,
  removePlayer,
  resetGuesses,
  guessesPayload,
} = require('./rooms');
```

(Not: mevcut require yolu `./src/rooms` — bu satır `const { ... } = require('./src/rooms');` biçiminde; sadece isimleri ekle, yolu değiştirme.)

`progressOf` fonksiyonundan sonra `afterPlayerRemoved` ekle:

```js
// Bir oyuncu (leave/kick) çıkarıldıktan SONRA odayı toparla.
// room.players çağırandan ÖNCE filtrelenmiş olmalı.
function afterPlayerRemoved(room, wasHost) {
  if (wasHost) {
    const next = room.players.find((p) => p.connected);
    if (next) room.hostId = next.id;
  }
  if (room.players.length === 0) {
    store.deleteRoom(room.code);
    return;
  }
  if (room.state === 'writing') {
    // Zincir değişti. 2 altına düştüyse lobiye dön; herkes yazdıysa geri sayım.
    if (room.players.length < 2) {
      room.players = resetWrittenNames(room.players);
      room.state = 'lobby';
      broadcastRoom(room);
      return;
    }
    if (allNamesSubmitted(room.players)) {
      broadcastRoom(room);
      startCountdown(room);
      return;
    }
    broadcastRoom(room);
    io.to(room.code).emit('writing_progress', progressOf(room));
    return;
  }
  broadcastRoom(room);
}
```

`sendPhaseState`'e countdown dalı ekle:

```js
function sendPhaseState(sock, room, playerId) {
  if (room.state === 'writing') {
    const t = targetOf(room.players, playerId);
    sock.emit('writing_started', { yourTarget: t ? t.name : null });
    sock.emit('writing_progress', progressOf(room));
  } else if (room.state === 'countdown') {
    sock.emit('countdown_started', { seconds: COUNTDOWN_SECONDS });
  } else if (room.state === 'playing') {
    sock.emit('game_started', { yourWord: wordFor(room.players, playerId) });
  }
}
```

`leave_room` handler'ını `afterPlayerRemoved` kullanacak şekilde sadeleştir:

```js
socket.on('leave_room', () => {
  const room = store.getRoom(myCode);
  if (!room) return;
  const wasHost = room.hostId === myPlayerId;
  room.players = removePlayer(room.players, myPlayerId);
  socket.leave(room.code);
  afterPlayerRemoved(room, wasHost);
  myCode = null;
  myPlayerId = null;
});
```

`leave_room`'dan sonra `kick_player` handler'ı ekle:

```js
socket.on('kick_player', ({ playerId }) => {
  const room = store.getRoom(myCode);
  if (!room || room.hostId !== myPlayerId) return;
  if (!playerId || playerId === myPlayerId) return;
  const target = room.players.find((p) => p.id === playerId);
  if (!target) return;
  const targetSocketId = target.socketId;
  room.players = removePlayer(room.players, playerId);
  afterPlayerRemoved(room, false); // host kendini atamaz, devir gerekmez
  if (targetSocketId) {
    const ts = io.sockets.sockets.get(targetSocketId);
    if (ts) ts.leave(room.code);
    io.to(targetSocketId).emit('kicked');
  }
});
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `node --test test/integration.test.js`
Expected: PASS (eski + 3 yeni test).

- [ ] **Step 5: Tüm testleri çalıştır**

Run: `npm test`
Expected: PASS — toplam test sayısı artmış, fail 0.

- [ ] **Step 6: Commit**

```bash
git add server.js test/integration.test.js
git commit -m "feat: host kick, yazma fazı çıkış kurtarma ve countdown reconnect"
```

---

### Task 3: Sunucu — guessed/guesses ve guessedAt alanı

**Files:**
- Modify: `server.js`, `src/roomStore.js`
- Test: `test/integration.test.js`

**Interfaces:**
- Consumes (Task 1): `guessesPayload`, `resetGuesses`.
- Produces:
  - Player nesnesi yeni alan: `guessedAt: number | null` (varsayılan null).
  - İstemci→sunucu: `guessed`.
  - Sunucu→istemci: `guesses { players: {id,name,guessedAt}[] }`.

- [ ] **Step 1: Testi yaz** — `test/integration.test.js` sonuna:

```js
test('guessed: bilen oyuncu guesses yayınında işaretlenir', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => { c1.close(); c2.close(); c3.close(); server.kill(); });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await sees3;

  const g1 = once(c1, 'game_started');
  c1.emit('start_writing');
  await once(c1, 'writing_started');
  c1.emit('submit_name', { name: 'W1' });
  c2.emit('submit_name', { name: 'W2' });
  c3.emit('submit_name', { name: 'W3' });
  await g1;

  const guesses1 = once(c1, 'guesses');
  c2.emit('guessed');
  const gdata = await guesses1;
  const p2 = gdata.players.find((p) => p.id === 'p2');
  const p1 = gdata.players.find((p) => p.id === 'p1');
  assert.ok(p2.guessedAt != null, 'p2 bildi işaretlenmeli');
  assert.strictEqual(p1.guessedAt, null, 'p1 henüz bilmedi');
});
```

- [ ] **Step 2: Başarısız olduğunu gör**

Run: `node --test test/integration.test.js`
Expected: FAIL — `guesses` gelmez (zaman aşımı).

- [ ] **Step 3: guessedAt alanını ekle** — `src/roomStore.js`'te createRoom'daki host oyuncusuna `guessedAt: null` ekle:

```js
      players: [
        {
          id: host.id,
          name: host.name,
          writtenName: null,
          connected: true,
          socketId: host.socketId || null,
          guessedAt: null,
        },
      ],
```

`server.js`'te `join_room` içindeki yeni oyuncu nesnesine de ekle:

```js
      player = {
        id: playerId,
        name: nickname || 'Oyuncu',
        writtenName: null,
        connected: true,
        socketId: socket.id,
        guessedAt: null,
      };
```

- [ ] **Step 4: guessed handler + tur sıfırlama** — `server.js`'te `beginWriting`'in ilk satırını güncelle (hem yazılan isimleri hem bildim'leri sıfırla):

```js
function beginWriting(room) {
  room.players = resetGuesses(resetWrittenNames(room.players));
  room.state = 'writing';
  ...
```

`return_to_lobby` handler'ında da aynı sıfırlama:

```js
socket.on('return_to_lobby', () => {
  const room = store.getRoom(myCode);
  if (!room || room.hostId !== myPlayerId) return;
  room.players = resetGuesses(resetWrittenNames(room.players));
  room.state = 'lobby';
  broadcastRoom(room);
});
```

`play_again` handler'ından sonra `guessed` handler'ı ekle:

```js
socket.on('guessed', () => {
  const room = store.getRoom(myCode);
  if (!room || room.state !== 'playing') return;
  const me = room.players.find((p) => p.id === myPlayerId);
  if (!me) return;
  if (me.guessedAt == null) me.guessedAt = Date.now();
  io.to(room.code).emit('guesses', { players: guessesPayload(room.players) });
});
```

- [ ] **Step 5: Testlerin geçtiğini gör**

Run: `npm test`
Expected: PASS, fail 0.

- [ ] **Step 6: Commit**

```bash
git add server.js src/roomStore.js test/integration.test.js
git commit -m "feat: tur sonu bildim/guesses ve guessedAt alanı"
```

---

### Task 4: QR kütüphanesi + HTML iskelesi + CSS

**Files:**
- Create: `public/vendor/qrcode.js` (vendored)
- Modify: `package.json`, `public/index.html`, `public/style.css`

**Interfaces:**
- Produces (sonraki istemci görevleri için DOM id'leri):
  - Lobi: `#btn-copy`, `#btn-share`, `#lobby-qr`.
  - Yazma: `#category-select`, `#btn-suggest`, `#btn-leave-writing`.
  - Geri sayım: `#btn-leave-countdown`.
  - Oyun: `#btn-guessed`, `#guess-list`.
  - Global: `window.qrcode` (UMD).

- [ ] **Step 1: QR kütüphanesini vendor et**

```bash
npm install --save-dev qrcode-generator
mkdir -p public/vendor
node -e "require('fs').copyFileSync(require.resolve('qrcode-generator'), 'public/vendor/qrcode.js')"
node -e "const q=require('./public/vendor/qrcode.js'); const x=q(0,'M'); x.addData('TEST'); x.make(); console.log('qr ok', typeof x.createSvgTag)"
```

Expected: `qr ok function` yazısı. (UMD dosyası tarayıcıda `window.qrcode` global'ini kurar.)

- [ ] **Step 2: index.html — script ve ekran öğeleri** — `</body>` öncesindeki scriptleri güncelle:

```html
  <script src="/vendor/qrcode.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/app.js"></script>
```

Lobi bölümünü (`#screen-lobby`) şununla değiştir:

```html
  <section id="screen-lobby" class="screen">
    <h2>Oda Kodu</h2>
    <div id="lobby-code" class="code"></div>
    <div class="code-actions">
      <button id="btn-copy" class="ghost">📋 Kopyala</button>
      <button id="btn-share" class="ghost" style="display:none">Paylaş</button>
    </div>
    <div id="lobby-qr" class="qr"></div>
    <p class="note">QR'ı okutan arkadaşların doğrudan bu odaya gelir</p>
    <ul id="player-list"></ul>
    <p id="lobby-note" class="note"></p>
    <button id="btn-shuffle">Sırayı Karıştır 🔀</button>
    <button id="btn-start" class="primary">Başlat</button>
    <button id="btn-leave-lobby" class="ghost">Odadan Ayrıl</button>
  </section>
```

Yazma bölümünü (`#screen-writing`) şununla değiştir:

```html
  <section id="screen-writing" class="screen">
    <div id="writing-form-wrap">
      <p class="label">Şu kişiye bir isim yaz:</p>
      <div id="writing-target" class="target"></div>
      <div class="suggest-row">
        <select id="category-select">
          <option value="Ünlüler">Ünlüler</option>
          <option value="Çizgi film">Çizgi film</option>
          <option value="Futbolcu">Futbolcu</option>
          <option value="Tarihi">Tarihi</option>
          <option value="Hayvan">Hayvan</option>
        </select>
        <button type="button" id="btn-suggest" class="ghost">💡 Öner</button>
      </div>
      <form id="name-form">
        <input id="name-input" type="text" maxlength="40" placeholder="Örn: Cüneyt Arkın" />
        <button type="submit" class="primary">Gönder</button>
      </form>
    </div>
    <div id="writing-wait" style="display:none">
      <p class="label">Diğerleri yazıyor…</p>
      <div id="writing-count" class="code"></div>
    </div>
    <button id="btn-leave-writing" class="ghost">Odadan Ayrıl</button>
  </section>
```

Geri sayım bölümüne leave butonu ekle (`#screen-countdown`):

```html
  <section id="screen-countdown" class="screen dark">
    <div id="countdown-number" class="countdown"></div>
    <p class="label light">Telefonu alnına koy!</p>
    <button id="btn-leave-countdown" class="ghost">Odadan Ayrıl</button>
  </section>
```

Oyun bölümünü (`#screen-playing`) şununla değiştir:

```html
  <section id="screen-playing" class="screen">
    <div id="the-word" class="word" style="display:none"></div>
    <div id="reveal-timer" class="reveal-timer" style="display:none"></div>
    <button id="btn-reveal" class="primary" style="display:none">Ben Kimim?</button>
    <button id="btn-guessed" class="ghost">Bildim 🎉</button>
    <ul id="guess-list" class="guess-list"></ul>
    <div id="host-controls" class="controls" style="display:none">
      <button id="btn-again" class="primary">Tekrar Oyna</button>
      <button id="btn-lobby">Lobiye Dön</button>
    </div>
    <button id="btn-leave-playing" class="ghost">Odadan Ayrıl</button>
  </section>
```

- [ ] **Step 3: style.css — yeni öğeler için stil** — dosya sonuna ekle:

```css
.code-actions { display: flex; gap: 8px; justify-content: center; }
.code-actions button { width: auto; }
.qr { background: #fff; padding: 10px; border-radius: 12px; line-height: 0; }
.qr svg { width: 180px; height: 180px; display: block; }

.suggest-row { display: flex; gap: 8px; width: 100%; max-width: 360px; }
.suggest-row select {
  flex: 1;
  font-size: 1rem;
  padding: 10px;
  border: 2px solid #ccd;
  border-radius: 12px;
  background: #fff;
}
.suggest-row button { width: auto; white-space: nowrap; }

.kick {
  width: 36px;
  padding: 4px;
  font-size: 1rem;
  background: #fde2e2;
  color: #c0392b;
  margin-left: 8px;
}

.guess-list {
  list-style: none;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
```

- [ ] **Step 4: Manuel doğrulama**

Run: `npm start` → tarayıcıda `http://localhost:3000`
Expected: Sayfa hatasız açılır; konsolda hata yok; eski akış (oda kur, katıl) hâlâ çalışır. (Yeni butonlar henüz işlevsiz olabilir — sonraki görevlerde bağlanacak.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json public/vendor/qrcode.js public/index.html public/style.css
git commit -m "feat: QR vendor + yeni UI iskelesi ve stilleri"
```

---

### Task 5: İstemci — reconnect (localStorage) + QR/link ile katılma

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: yok (saf istemci davranışı).
- Produces: `?room=KOD` ile gelen ziyaretçide kod ön-doldurulur; aktif oda kodu `localStorage`'da saklanır (tarayıcı kapansa da geri dönüş).

- [ ] **Step 1: Oda kodunu localStorage'a taşı** — `app.js` başında `myCode` tanımını değiştir:

```js
let myCode = localStorage.getItem('benkimim_code') || null;
```

Aşağıdaki tüm `sessionStorage` kullanımlarını `localStorage` yap:
- `sessionStorage.setItem('benkimim_code', myCode)` (oda kurma callback'i) → `localStorage.setItem('benkimim_code', myCode)`
- `sessionStorage.setItem('benkimim_code', myCode)` (katılma callback'i) → `localStorage.setItem(...)`
- `sessionStorage.removeItem('benkimim_code')` (leaveRoom) → `localStorage.removeItem('benkimim_code')`
- `sessionStorage.removeItem('benkimim_code')` (connect başarısız dalı) → `localStorage.removeItem('benkimim_code')`

- [ ] **Step 2: ?room= parametresini işle** — `nicknameInput.value = myName;` satırından hemen sonra ekle:

```js
// QR/link ile gelen ziyaretçi: oda kodunu ön-doldur, eski kayıtlı odaya otomatik dönme.
const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().trim();
if (urlRoom) {
  codeInput.value = urlRoom;
  myCode = null;
  localStorage.removeItem('benkimim_code');
  history.replaceState({}, '', location.pathname);
  nicknameInput.focus();
}
```

- [ ] **Step 3: Manuel doğrulama — reconnect**

1. `npm start`, iki gizli pencere aç, oda kur + katıl, oyunu yazma fazına getir.
2. Bir oyuncunun penceresini tamamen kapat, aynı URL'yi tekrar aç.
   Expected: Otomatik aynı odaya, yazma ekranına döner (kod elle girilmeden).
3. Yeni bir gizli pencerede `http://localhost:3000/?room=<KOD>` aç.
   Expected: Ana sayfa açılır, kod alanı dolu, imleç takma adda; takma ad girip "Odaya Katıl" çalışır; adres çubuğunda `?room=` kalmaz.

- [ ] **Step 4: Tüm testler hâlâ yeşil mi**

Run: `npm test`
Expected: PASS (istemci değişikliği sunucu testlerini etkilemez).

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: localStorage ile dayanıklı reconnect ve QR/link ile katılma"
```

---

### Task 6: İstemci — lobi QR, kopyala/paylaş, host kick

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes (Task 2): `kick_player` olayı, `kicked` olayı. (Task 4): `#lobby-qr`, `#btn-copy`, `#btn-share`.
- Produces: `currentHostId` global'i (Task 9 oyun listesi de kullanır).

- [ ] **Step 1: Host id takibi + QR yardımcı** — `let isHost = false;` satırından sonra ekle:

```js
let currentHostId = null;
```

`renderLobby` fonksiyonundan önce QR yardımcı fonksiyonunu ekle:

```js
function renderQR(code) {
  const el = document.getElementById('lobby-qr');
  el.innerHTML = '';
  if (!code || typeof qrcode === 'undefined') return;
  const qr = qrcode(0, 'M');
  qr.addData(location.origin + '/?room=' + code);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}
```

- [ ] **Step 2: renderLobby içinde QR + kick** — `renderLobby`'de `document.getElementById('lobby-code').textContent = myCode || '';` satırından sonra ekle:

```js
  renderQR(myCode);
```

Aynı fonksiyonda, host kontrol bloğunda reorder butonlarından sonra (her oyuncu `li` için) host ise ve kendisi değilse kick butonu ekle. `if (isHost) { ... }` bloğunun içinde, `li.appendChild(ctrl);` satırından sonra:

```js
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
```

- [ ] **Step 3: Kopyala/Paylaş butonları** — `btn-shuffle` listener'ından sonra ekle:

```js
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
```

- [ ] **Step 4: currentHostId güncelle + kicked olayı** — `room_update` handler'ının ilk satırına ekle (`isHost = ...`'tan sonra):

```js
  currentHostId = data.hostId;
```

`socket.on('room_update', ...)`'tan sonra `kicked` dinleyicisini ekle:

```js
socket.on('kicked', () => {
  alert('Odadan atıldın');
  myCode = null;
  localStorage.removeItem('benkimim_code');
  if (countdownTimer) clearInterval(countdownTimer);
  if (revealTimer) clearInterval(revealTimer);
  releaseWakeLock();
  showScreen('home');
});
```

- [ ] **Step 5: Manuel doğrulama**

1. `npm start`, oda kur. Lobide QR görünür; telefonla okutunca `/?room=KOD` açar (ya da QR'ı bir okuyucuya verince doğru URL'i gösterir).
2. "📋 Kopyala" → "✓ Kopyalandı" yanıp söner; pano kodu içerir.
3. 2. oyuncu katıl; host olarak yanında "✕" görünür; bas → onayla → oyuncu odadan düşer ve onun ekranı ana sayfaya döner ("Odadan atıldın").

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat: lobi QR, kopyala/paylaş ve host kick"
```

---

### Task 7: İstemci — kategori önerisi + yazma/geri sayım ayrıl butonları

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes (Task 4): `#category-select`, `#btn-suggest`, `#btn-leave-writing`, `#btn-leave-countdown`.

- [ ] **Step 1: İsim havuzları + öner** — `name-form` submit listener'ından önce ekle:

```js
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
```

- [ ] **Step 2: Yazma ve geri sayım ayrıl butonları** — mevcut `btn-leave-playing` listener'ından sonra ekle:

```js
document.getElementById('btn-leave-writing').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});
document.getElementById('btn-leave-countdown').addEventListener('click', () => {
  if (confirm('Odadan ayrılmak istediğine emin misin?')) leaveRoom();
});
```

- [ ] **Step 3: Manuel doğrulama**

1. 3 oyuncuyla yazma fazına gel. Kategori seç → "💡 Öner" → input rastgele isimle dolar; düzenleyip ya da olduğu gibi "Gönder".
2. Yazma ekranında "Odadan Ayrıl" → onay → ana sayfa.
3. Geri sayım sırasında (gerekirse `COUNTDOWN_SECONDS=8 npm start`) "Odadan Ayrıl" görünür ve çalışır.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: kategori önerisi ve yazma/geri sayım ayrıl butonları"
```

---

### Task 8: İstemci — Bildim/Bilenler listesi + geri sayım ses/titreşim

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes (Task 3): `guessed`, `guesses` olayları. (Task 6): `currentHostId`. (Task 4): `#btn-guessed`, `#guess-list`.

- [ ] **Step 1: Durum + render** — üst kısımdaki `let myWord = '';` satırından sonra ekle:

```js
let playingPlayers = [];
let guessedAt = {};
```

`startReveal` fonksiyonundan önce ekle:

```js
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
```

- [ ] **Step 2: Bildim butonu + guesses olayı** — `btn-reveal` listener'ından sonra ekle:

```js
document.getElementById('btn-guessed').addEventListener('click', () => {
  socket.emit('guessed');
});
```

`game_started` handler'ından sonra ekle:

```js
socket.on('guesses', (data) => {
  guessedAt = {};
  data.players.forEach((p) => { guessedAt[p.id] = p.guessedAt; });
  playingPlayers = data.players.map((p) => ({ id: p.id, name: p.name }));
  renderPlaying();
});
```

- [ ] **Step 3: room_update ve game_started'da listeyi besle** — `room_update` handler'ında `data.state === 'playing'` dalında, `showScreen('playing');`'ten önce ekle:

```js
    playingPlayers = data.players.map((p) => ({ id: p.id, name: p.name }));
    renderPlaying();
```

`game_started` handler'ının başında (yeni tur) bildim'leri sıfırla — `requestWakeLock();`'tan önce zaten `startReveal` çağrılıyor; handler'ın ilk satırına ekle:

```js
  guessedAt = {};
```

`writing_started` handler'ının başına da ekle (yeni tur listesi temiz başlasın):

```js
  guessedAt = {};
```

- [ ] **Step 4: Geri sayım ses + titreşim** — `startReveal`'den önce ekle:

```js
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
```

`countdown_started` handler'ının başına ekle:

```js
  buzz([120, 60, 120]);
  beep(880, 0.15);
```

Aynı handler'daki interval içinde, `if (n <= 0)` bloğuna (clearInterval'dan önce) "başla" uyarısı ekle:

```js
    if (n <= 0) {
      buzz([300]);
      beep(1320, 0.25);
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
```

- [ ] **Step 5: Manuel doğrulama**

1. 3 oyuncuyla oyna. Geri sayımda telefon titrer + bip duyulur (destekleyen cihaz/tarayıcıda; masaüstünde ses).
2. Oyun ekranında "Bilenler" listesi tüm oyuncuları "tahmin ediyor" gösterir. Bir oyuncu "Bildim 🎉" → herkeste o oyuncu "1. <ad> 🎉" üste çıkar.
3. Host oyun ekranında oyuncuların yanında "✕" görür ve atabilir.
4. "Tekrar Oyna" → yeni turda liste sıfırlanır.

- [ ] **Step 6: Tüm testler**

Run: `npm test`
Expected: PASS, fail 0.

- [ ] **Step 7: Commit**

```bash
git add public/app.js
git commit -m "feat: tur sonu Bilenler listesi, Bildim butonu ve geri sayım ses/titreşim"
```

---

### Task 9: README güncelleme + final doğrulama

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README — yeni özellikleri yansıt** — "How to play" listesine QR ile katılmayı ekle ve özellikleri kısaca belirt. `## How to play` bölümünün altındaki 2. maddeyi şu ikisiyle değiştir:

```markdown
2. Friends join by entering the code + a nickname — or by scanning the lobby **QR code**, which opens the app with the room code pre-filled (just type a nickname and join).
```

`## How to play` bölümünün sonuna ekle:

```markdown

The host can reorder or **remove** players, suggest names by category while writing,
and everyone gets a vibrate/beep when the countdown starts. After a round, tap
**Bildim 🎉** when you guess yourself; the lobby shows who has guessed.
```

- [ ] **Step 2: Tam test + manuel duman testi**

Run: `npm test`
Expected: PASS, fail 0, toplam test sayısı 16 + 8 yeni = 24.

Run: `npm start` ve uçtan uca elle bir tur oyna (kur → QR ile katıl → yaz → öner → geri sayım → bildim → tekrar oyna → kick → ayrıl). Hata yok.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: yeni özellikleri README'ye ekle"
```

---

## Self-Review Notları

- **Spec kapsamı:** 1.1 reconnect→Task 5; 1.2 leave butonları→Task 4(HTML)+7(JS); 1.3 countdown phase-state→Task 2; 1.4 yazma kurtarma→Task 2; 2.1 QR→Task 4+5+6; 2.2 kopyala/paylaş→Task 6; 2.3 kick→Task 2(sunucu)+6/8(istemci); 2.4 kategori→Task 4+7; 2.5 ses/titreşim→Task 8; 2.6 bildim/skor→Task 3+4+8. Tümü kapsanıyor.
- **Tip tutarlılığı:** `guessedAt: number|null` her yerde aynı; `guessesPayload` çıktısı `{id,name,guessedAt}` istemci `guesses` handler'ıyla eşleşir; `currentHostId` Task 6'da tanımlanıp Task 8'de kullanılıyor; `playingPlayers`/`guessedAt` Task 8'de tanımlı.
- **Placeholder yok:** her adımda gerçek kod var.
```
