import { prisma } from '../db';
import { TRACKER_MUTATE_ATTEMPTS } from './tracker.const';
import { TrackerDoc, validateTrackerDoc } from './tracker-doc.model';

/**
 * Tracker document storage (fork): one row per account. Saves are optimistic:
 * a save names the version it was based on and loses cleanly to a newer one.
 * Raw SQL throughout so the PGlite specs run the shipped statements.
 */

export class TrackerToolError extends Error {}
export class TrackerBusyError extends Error {
  constructor() {
    super('The tracker changed while saving.');
  }
}

export interface LoadedTrackerDoc {
  version: number;
  doc: TrackerDoc | null;
}

export type SaveTrackerResult =
  | { status: 'saved'; version: number }
  | { status: 'conflict'; version: number; doc: TrackerDoc | null };

export const loadTrackerDoc = async (userId: number): Promise<LoadedTrackerDoc> => {
  const rows = await prisma.$queryRaw<Array<{ version: number; data: string }>>`
    SELECT version, data FROM tracker_documents WHERE user_id = ${userId}`;
  const row = rows[0];
  return row
    ? { version: Number(row.version), doc: JSON.parse(row.data) as TrackerDoc }
    : { version: 0, doc: null };
};

export const saveTrackerDoc = async (
  userId: number,
  doc: TrackerDoc,
  baseVersion: number,
  now: number = Date.now(),
): Promise<SaveTrackerResult> => {
  const data = JSON.stringify(doc);
  const written =
    baseVersion === 0
      ? await prisma.$executeRaw`
          INSERT INTO tracker_documents (user_id, version, data, updated_at)
          VALUES (${userId}, 1, ${data}, ${BigInt(now)})
          ON CONFLICT (user_id) DO NOTHING`
      : await prisma.$executeRaw`
          UPDATE tracker_documents
          SET data = ${data}, version = version + 1, updated_at = ${BigInt(now)}
          WHERE user_id = ${userId} AND version = ${baseVersion}`;
  if (written > 0) return { status: 'saved', version: baseVersion + 1 };
  const current = await loadTrackerDoc(userId);
  return { status: 'conflict', ...current };
};

/**
 * Reads, changes and saves the document, retrying on a lost race. `fn` works on
 * a private copy (a missing document starts empty) and may throw
 * TrackerToolError, which propagates. The result must still validate.
 */
export const mutateTrackerDoc = async <R>(
  userId: number,
  fn: (doc: TrackerDoc) => R | Promise<R>,
  now: number = Date.now(),
): Promise<{ version: number; result: R }> => {
  for (let attempt = 0; attempt < TRACKER_MUTATE_ATTEMPTS; attempt++) {
    const loaded = await loadTrackerDoc(userId);
    const doc: TrackerDoc = structuredClone(loaded.doc ?? { goals: [], tasks: [] });
    const result = await fn(doc);
    const checked = validateTrackerDoc(doc);
    if (!checked.ok) {
      throw new TrackerToolError(
        checked.reason === 'too_large'
          ? 'The tracker is full; delete something first.'
          : 'The tracker document would become invalid.',
      );
    }
    const saved = await saveTrackerDoc(userId, checked.doc, loaded.version, now);
    if (saved.status === 'saved') return { version: saved.version, result };
  }
  throw new TrackerBusyError();
};
