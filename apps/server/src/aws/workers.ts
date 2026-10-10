import { runtime } from './runtime.ts';
import { Rooms } from '../rooms.ts';
let imageState: ReturnType<typeof runtime> | undefined, commonState: ReturnType<typeof runtime> | undefined;
const getState = (images = false) => images ? imageState ??= runtime(true) : commonState ??= runtime();
export async function imageHandler(event: { Records: { messageId: string; body: string }[] }) {
  const failures: { itemIdentifier: string }[] = [], services = getState(true);
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      if (typeof message.jobId !== 'string' || !Number.isSafeInteger(message.revision)) throw new Error('Invalid work item');
      await services.jobs.process(message);
    } catch { failures.push({ itemIdentifier: record.messageId }); console.error(JSON.stringify({ event: 'image_worker_retry', messageId: record.messageId })); }
  }
  return { batchItemFailures: failures };
}
export async function dispatchHandler(event: { Records: { eventID: string; dynamodb?: { Keys?: { pk?: { S?: string } }; SequenceNumber?: string } }[] }) {
  const failures: { itemIdentifier: string }[] = [], services = getState();
  for (const record of event.Records) {
    try { await services.outbox.dispatch(record.dynamodb?.Keys?.pk?.S ?? ''); }
    catch { failures.push({ itemIdentifier: record.dynamodb?.SequenceNumber ?? record.eventID }); }
  }
  return { batchItemFailures: failures };
}
export async function cleanupHandler() {
  const services = getState();
  await services.outbox.recover();
  await services.jobs.cleanup();
  await new Rooms(services.rooms, services.assets, services.jobs).cleanup();
  console.info(JSON.stringify({ event: 'cleanup_completed' }));
}
