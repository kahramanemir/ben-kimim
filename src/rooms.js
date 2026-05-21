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
