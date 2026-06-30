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

function indexOfPlayer(players, playerId) {
  return players.findIndex((p) => p.id === playerId);
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

// Oyuncu sırasını rastgele karıştırır (Fisher-Yates). YENİ dizi döner.
function shufflePlayers(players) {
  const next = players.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function resetWrittenNames(players) {
  return players.map((p) => ({ ...p, writtenName: null }));
}

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

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  generateCode,
  indexOfPlayer,
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  shufflePlayers,
  resetWrittenNames,
  removePlayer,
  resetGuesses,
  guessesPayload,
};
