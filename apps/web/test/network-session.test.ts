import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHuntSession, HOUSE, type CommandResponse, type HuntCommand, type RoomView } from '../../../packages/game-core/src/index.ts';
import { NetworkHuntSession } from '../src/network-session.ts';
import { RoomClient } from '../src/room-api.ts';

test('walking predicts through an 800 ms reply, stays bounded, and sends queued taps immediately', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 1000000 });
  const authority = new LocalHuntSession('Alan', 'latency', Date.now, true);
  const view = { revision: 1, serverNow: Date.now(), cursor: 0, me: { id: 'alan', name: 'Alan' }, father: authority.getSnapshot().father,
    room: { id: 'latency', status: 'open' }, attempt: { id: 'attempt', ack: 0, snapshot: authority.getSnapshot() } } as RoomView;
  const client = new RoomClient('latency'); client.accept(view);
  const requests: { commands: HuntCommand[]; resolve: (response: CommandResponse) => void }[] = [];
  client.commands = async (_id, _controller, commands) => new Promise(resolve => requests.push({ commands: structuredClone(commands), resolve }));
  const session = new NetworkHuntSession(client, { view, controller: 'fixture' });
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const reply = (index: number) => {
    const request = requests[index];
    for (const command of request.commands) if (command.kind === 'move') authority.move(command.direction, command.deltaMs);
    request.resolve({ view: { ...view, serverNow: Date.now(), attempt: { id: 'attempt', ack: request.commands.at(-1)!.seq, snapshot: authority.getSnapshot() } }, results: [] });
  };
  try {
    for (let frame = 0; frame < 20; frame++) { t.mock.timers.tick(40); session.move({ x: 1, y: 0 }, 40); }
    assert.equal(requests.length, 1, 'Only one command request can be in flight');
    assert.ok(Math.abs(session.getSnapshot().player.position.x - HOUSE.spawn.x - 168) < .01, 'Mobile latency must not slow local walking');
    void session.hint();
    reply(0); await settle();
    assert.ok(Math.abs(session.getSnapshot().player.position.x - HOUSE.spawn.x - 168) < .01, 'Acknowledgement replays unconfirmed movement without jumping backwards');
    assert.equal(requests.length, 2, 'An action behind movement is sent without waiting another batch interval');
    assert.equal(requests[1].commands.at(-1)!.kind, 'hint');
    for (let frame = 0; frame < 100; frame++) { t.mock.timers.tick(40); session.move({ x: 1, y: 0 }, 40); }
    assert.ok(session.getSnapshot().player.position.x - authority.getSnapshot().player.position.x <= 210.01, 'A stalled connection cannot build an unbounded prediction backlog');
  } finally { session.dispose(); for (let i = 1; i < requests.length; i++) reply(i); await settle(); }
});
