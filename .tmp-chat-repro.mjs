(async () => {
  const base = 'http://localhost:3671';
  const matchmake = 'http://localhost:3571';
  const username = 'acc_chat_debug';
  const password = 'secret123';

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(url + ' -> ' + res.status + ' ' + JSON.stringify(json));
    return json;
  }

  let token;
  try {
    const reg = await post(base + '/auth/register', { username, password, characterName: 'ChatDebugA' });
    token = reg.token;
    console.log('registered');
  } catch (e) {
    const login = await post(base + '/auth/login', { username, password });
    token = login.token;
    console.log('logged in');
  }

  const charsRes = await fetch(base + '/characters?token=' + encodeURIComponent(token));
  const charsJson = await charsRes.json();
  const characterId = charsJson.characters[0].id;

  const seat = await post(matchmake + '/matchmake/joinOrCreate/world', { authToken: token, characterId });

  const { Client } = await import('colyseus.js');
  const client = new Client(matchmake);
  const room = await client.consumeSeatReservation({
    room: {
      name: seat.name,
      roomId: seat.roomId,
      clients: seat.clients,
      maxClients: seat.maxClients,
      processId: seat.processId,
      publicAddress: seat.publicAddress
    },
    sessionId: seat.sessionId,
    protocol: seat.protocol
  });

  room.onMessage('chat:message', (m) => {
    console.log('chat message', m);
  });
  room.onError((code, msg) => {
    console.log('room error', code, msg);
  });
  room.onLeave((code) => {
    console.log('room leave', code);
  });

  room.send('chat:send', { text: 'hola test' });

  setTimeout(async () => {
    await room.leave();
    process.exit(0);
  }, 1200);
})();
