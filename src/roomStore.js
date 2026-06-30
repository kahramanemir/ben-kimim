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
          guessedAt: null,
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
