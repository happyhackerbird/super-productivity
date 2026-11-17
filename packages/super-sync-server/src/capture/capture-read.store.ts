import { prisma } from '../db';

/**
 * Task reading (fork): one row per account while reading is on. A row is one
 * enablement with its own id; devices publish only against that id, so a
 * device that missed a switch-off cannot bring the list back. Raw SQL
 * throughout so the PGlite specs run the shipped statements.
 */

export interface ReadAccess {
  enabled: boolean;
  enableId: string | null;
  publishedAt: number | null;
}

export type EnableReadAccessResult =
  | { status: 'enabled'; enableId: string; publishedAt: number | null }
  | { status: 'capture_disabled' };

interface AccessRow {
  enable_id: string;
  published_at: bigint | null;
}

const toNumber = (value: bigint | null): number | null =>
  value === null ? null : Number(value);

export const getReadAccess = async (userId: number): Promise<ReadAccess> => {
  const rows = await prisma.$queryRaw<AccessRow[]>`
    SELECT enable_id, published_at FROM capture_read_models WHERE user_id = ${userId}`;
  const row = rows[0];
  return row
    ? { enabled: true, enableId: row.enable_id, publishedAt: toNumber(row.published_at) }
    : { enabled: false, enableId: null, publishedAt: null };
};

/**
 * Needs live capture. An existing enablement keeps its id and its list, so a
 * second device switching on joins the first instead of resetting it.
 */
export const enableReadAccess = async (
  userId: number,
  now: number = Date.now(),
): Promise<EnableReadAccessResult> =>
  prisma.$transaction(async (tx) => {
    // The share lock makes a concurrent capture switch-off wait for this
    // insert, so its delete sees the row.
    const keys = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM capture_keys
      WHERE user_id = ${userId} AND disabled_at IS NULL FOR SHARE`;
    if (keys.length === 0) return { status: 'capture_disabled' };
    await tx.$executeRaw`
      INSERT INTO capture_read_models (user_id, enable_id, enabled_at)
      VALUES (${userId}, gen_random_uuid()::text, ${BigInt(now)})
      ON CONFLICT (user_id) DO NOTHING`;
    const rows = await tx.$queryRaw<AccessRow[]>`
      SELECT enable_id, published_at FROM capture_read_models WHERE user_id = ${userId}`;
    return {
      status: 'enabled',
      enableId: rows[0].enable_id,
      publishedAt: toNumber(rows[0].published_at),
    };
  });

export const disableReadAccess = async (userId: number): Promise<void> => {
  await prisma.$executeRaw`DELETE FROM capture_read_models WHERE user_id = ${userId}`;
};

/**
 * Stores the list only for the current enablement; never creates a row. An
 * unchanged list only moves `published_at`, so repeated syncs cost no rewrite.
 */
export const publishReadModel = async (
  userId: number,
  enableId: string,
  payloadJson: string,
  now: number = Date.now(),
): Promise<'published' | 'read_disabled'> => {
  const touched = await prisma.$executeRaw`
    UPDATE capture_read_models SET published_at = ${BigInt(now)}
    WHERE user_id = ${userId} AND enable_id = ${enableId} AND payload = ${payloadJson}`;
  if (touched > 0) return 'published';
  const written = await prisma.$executeRaw`
    UPDATE capture_read_models SET payload = ${payloadJson}, published_at = ${BigInt(now)}
    WHERE user_id = ${userId} AND enable_id = ${enableId}`;
  return written > 0 ? 'published' : 'read_disabled';
};

/** Null when reading is off. */
export const loadReadModel = async (
  userId: number,
): Promise<{ payload: string | null; publishedAt: number | null } | null> => {
  const rows = await prisma.$queryRaw<
    Array<{ payload: string | null; published_at: bigint | null }>
  >`
    SELECT payload, published_at FROM capture_read_models WHERE user_id = ${userId}`;
  const row = rows[0];
  return row ? { payload: row.payload, publishedAt: toNumber(row.published_at) } : null;
};
