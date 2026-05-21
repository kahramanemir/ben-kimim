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
const COUNTDOWN_SECONDS = Number(process.env.COUNTDOWN_SECONDS) || 5;
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
