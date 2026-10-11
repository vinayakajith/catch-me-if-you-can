import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CharacterService, PlayerPortraitJob } from './contracts.ts';
import { SharedRooms } from './shared-rooms.ts';
import { JobError } from './errors.ts';

export async function portraitScope(shared: SharedRooms, roomId: unknown, owner: string): Promise<PlayerPortraitJob | undefined> {
  if (roomId === undefined) return;
  if (typeof roomId !== 'string') throw new JobError(400, 'Open your room to add a game face.');
  const room = await shared.get(roomId); shared.member(room, owner);
  if (room.expiresAt <= shared.clock() + 10000) throw new JobError(410, 'This room is closing. Use the preset for now.');
  return { roomId, expiresAt: room.expiresAt };
}
export function registerPortraits(app: FastifyInstance, shared: SharedRooms, jobs: CharacterService) {
  const owner = (cookie?: string) => createHash('sha256').update(cookie ?? '').digest('hex');
  async function status(id: string, who: string) {
    const room = await shared.get(id), p = shared.member(room, who);
    if (room.expiresAt <= shared.clock()) throw new JobError(410, 'This room has closed. Its game faces are no longer available.');
    if (!p.avatarJob) return { job: null };
    const job = await jobs.get(p.avatarJob, who);
    if (job.playerRoomId !== id) throw new JobError(404, 'Game face not found.');
    if (job.status === 'ready' && !p.avatar) await shared.publishAvatar(id, who, job.id);
    return { job: await jobs.view(job) };
  }
  app.get<{ Params: { id: string } }>('/api/rooms/:id/portrait', request => status(request.params.id, owner(request.cookies['fh-owner'])));
  app.post<{ Params: { id: string } }>('/api/rooms/:id/portrait', { bodyLimit: 1024 }, async request => {
    const who = owner(request.cookies['fh-owner']), id = request.params.id, data = request.body as { jobId?: unknown } | undefined;
    await portraitScope(shared, id, who);
    if (!data || data.jobId !== null && typeof data.jobId !== 'string') throw new JobError(400, 'Choose a portrait or a preset.');
    const job = data.jobId === null ? null : await jobs.get(data.jobId as string, who);
    if (job && job.playerRoomId !== id) throw new JobError(403, 'Player faces stay in their original room.');
    await shared.change(id, r => { const p = shared.member(r, who); p.avatarJob = job?.id; p.avatar = undefined; p.revision++; });
    return status(id, who);
  });
  app.get<{ Params: { id: string; player: string } }>('/api/rooms/:id/players/:player/face', async (request, reply) => {
    const room = await shared.get(request.params.id); shared.member(room, owner(request.cookies['fh-owner']));
    if (room.expiresAt <= shared.clock()) throw new JobError(410, 'This room has closed.');
    const member = room.players.find(p => p.id === request.params.player);
    if (!member?.shared?.avatarJob || !member.shared.avatar) throw new JobError(404, 'Face not found.');
    const job = await jobs.get(member.shared.avatarJob, member.owner);
    if (job.playerRoomId !== room.id) throw new JobError(404, 'Face not found.');
    const result = await jobs.asset(job.id, member.owner, 'laugh.png');
    if ('url' in result) return reply.redirect(result.url);
    return reply.type('image/png').send(result);
  });
}
