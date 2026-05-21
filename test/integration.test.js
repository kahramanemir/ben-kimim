const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io: ioc } = require('socket.io-client');

const PORT = 41234;
const URL = `http://localhost:${PORT}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(PORT), COUNTDOWN_SECONDS: '1' },
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

function connect() {
  return ioc(URL, { forceNew: true, transports: ['websocket'] });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitForPlayers(socket, n) {
  return new Promise((resolve) => {
    const handler = (data) => {
      if (data.players && data.players.length === n) {
        socket.off('room_update', handler);
        resolve(data);
      }
    };
    socket.on('room_update', handler);
  });
}

test('uçtan uca: 3 oyuncu, zincir hedefleri ve kelimeleri doğru', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => {
    c1.close();
    c2.close();
    c3.close();
    server.kill();
  });

  // c1 odayı kurar
  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  assert.ok(created.ok, 'oda kurulmalı');
  const code = created.code;
  assert.strictEqual(code.length, 5);

  // c1, 3 oyuncuyu görene kadar bekleyecek (dinleyiciyi join'lerden ÖNCE kur)
  const c1Sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  const r3 = await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  assert.ok(r3.ok, '3. oyuncu katılmalı');
  const lobby = await c1Sees3;
  assert.strictEqual(lobby.players.length, 3);

  // start_writing: her oyuncuya hedefi gelir
  const w1 = once(c1, 'writing_started');
  const w2 = once(c2, 'writing_started');
  const w3 = once(c3, 'writing_started');
  c1.emit('start_writing');
  const [t1, t2, t3] = await Promise.all([w1, w2, w3]);
  // Sıra p1,p2,p3 -> hedefler: p1->Ali, p2->Veli, p3->Emir (halka)
  assert.strictEqual(t1.yourTarget, 'Ali');
  assert.strictEqual(t2.yourTarget, 'Veli');
  assert.strictEqual(t3.yourTarget, 'Emir');

  // herkes isim yazar; game_started ile kendi kelimesini alır
  const g1 = once(c1, 'game_started');
  const g2 = once(c2, 'game_started');
  const g3 = once(c3, 'game_started');
  c1.emit('submit_name', { name: 'W1' }); // p1 -> p2 icin
  c2.emit('submit_name', { name: 'W2' }); // p2 -> p3 icin
  c3.emit('submit_name', { name: 'W3' }); // p3 -> p1 icin
  const [word1, word2, word3] = await Promise.all([g1, g2, g3]);
  // Bir oyuncunun gordugu kelime = ONCEKI oyuncunun yazdigi
  assert.strictEqual(word2.yourWord, 'W1', 'p2, p1in yazdigini gormeli');
  assert.strictEqual(word3.yourWord, 'W2', 'p3, p2nin yazdigini gormeli');
  assert.strictEqual(word1.yourWord, 'W3', 'p1, p3un yazdigini gormeli (halka)');
});

test('reorder_player: host sıra değiştirince zincir değişir', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => {
    c1.close();
    c2.close();
    c3.close();
    server.kill();
  });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const c1Sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await c1Sees3;

  // p3'ü yukarı taşı: sıra p1, p3, p2 olur
  const reordered = waitForPlayers(c1, 3);
  // not: waitForPlayers herhangi 3-oyunculu room_update'i çözer; reorder de 3 oyuncu yayınlar
  c1.emit('reorder_player', { playerId: 'p3', direction: 'up' });
  const after = await reordered;
  assert.deepStrictEqual(
    after.players.map((p) => p.id),
    ['p1', 'p3', 'p2']
  );

  // başlat: yeni sıraya göre hedefler -> p1->Veli, p3->Ali, p2->Emir
  const w1 = once(c1, 'writing_started');
  const w2 = once(c2, 'writing_started');
  const w3 = once(c3, 'writing_started');
  c1.emit('start_writing');
  const [t1, t2, t3] = await Promise.all([w1, w2, w3]);
  assert.strictEqual(t1.yourTarget, 'Veli'); // p1 sonrası p3=Veli
  assert.strictEqual(t3.yourTarget, 'Ali'); // p3 sonrası p2=Ali
  assert.strictEqual(t2.yourTarget, 'Emir'); // p2 sonrası p1=Emir (halka)
});

test('lobide host ayrılınca host devredilir', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  t.after(() => {
    c2.close();
    c3.close();
    server.kill();
  });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const c2Sees3 = waitForPlayers(c2, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await c2Sees3;

  // host (c1=p1) ayrılır -> lobide silinir, host kalan en erken oyuncuya (p2) geçer
  const hostMoved = new Promise((resolve) => {
    const h = (d) => {
      if (d.players.length === 2) {
        c2.off('room_update', h);
        resolve(d);
      }
    };
    c2.on('room_update', h);
  });
  c1.close();
  const after = await hostMoved;
  assert.strictEqual(after.hostId, 'p2');
  assert.deepStrictEqual(
    after.players.map((p) => p.id),
    ['p2', 'p3']
  );
});

test('yazma sırasında kopan oyuncu yeniden bağlanınca fazını geri alır', async (t) => {
  const server = await startServer();
  const c1 = connect();
  const c2 = connect();
  const c3 = connect();
  let c2b;
  t.after(() => {
    c1.close();
    c3.close();
    if (c2b) c2b.close();
    server.kill();
  });

  const created = await emitAck(c1, 'create_room', { nickname: 'Emir', playerId: 'p1' });
  const code = created.code;
  const c1Sees3 = waitForPlayers(c1, 3);
  await emitAck(c2, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  await emitAck(c3, 'join_room', { code, nickname: 'Veli', playerId: 'p3' });
  await c1Sees3;

  const w2 = once(c2, 'writing_started');
  c1.emit('start_writing');
  await w2; // c2 yazma fazında

  // c2 kopar; c1, p2'yi "bağlı değil" görene kadar bekle (yarış önleme)
  const p2Off = new Promise((resolve) => {
    const h = (d) => {
      const p2 = d.players.find((x) => x.id === 'p2');
      if (p2 && !p2.connected) {
        c1.off('room_update', h);
        resolve();
      }
    };
    c1.on('room_update', h);
  });
  c2.close();
  await p2Off;

  // aynı playerId ile yeniden bağlan -> slot korunur, faz verisi tekrar gelir
  c2b = connect();
  const w2b = once(c2b, 'writing_started');
  const res = await emitAck(c2b, 'join_room', { code, nickname: 'Ali', playerId: 'p2' });
  assert.ok(res.ok);
  const reTarget = await w2b;
  assert.strictEqual(reTarget.yourTarget, 'Veli'); // p2'nin hedefi hâlâ Veli
});
