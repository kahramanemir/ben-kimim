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
