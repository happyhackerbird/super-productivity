/**
 * Real-PostgreSQL coverage for the task-reading race PGlite (one connection)
 * cannot play: reading switched on while capture is switched off. The share
 * lock `enableReadAccess` takes on the live key makes a concurrent
 * `disableCaptureKey` wait for the switch-on to commit, so the switch-off's
 * delete sees the new row and no list survives it.
 *
 * Prerequisites:
 *   DATABASE_URL=postgresql://supersync:superpassword@localhost:55432/supersync_db
 *   (`npm run supersync:db` publishes it on 55432 and applies the schema)
 *
 * Run with:
 *   npx vitest run --config vitest.integration.config.ts \
 *     tests/integration/capture-read-race.integration.spec.ts
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'integration-test-jwt-secret-at-least-32-characters';
});

import { createECDH } from 'crypto';
import { disconnectDb, prisma } from '../../src/db';
import {
  disableCaptureKey,
  registerCaptureKey,
} from '../../src/capture/capture-key.store';
import { enableReadAccess } from '../../src/capture/capture-read.store';

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDb = DATABASE_URL ? describe : describe.skip;
const EMAIL = `capture-read-race-${Date.now()}-${process.pid}@example.com`;
const RACE_ROUNDS = 25;

const P256_SPKI_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex',
);
const newPublicKey = (): string => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return Buffer.concat([P256_SPKI_PREFIX, ecdh.getPublicKey()]).toString('base64');
};

describeWithDb('task reading vs capture switch-off (real PostgreSQL)', () => {
  let userId: number;

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    userId = (await prisma.user.create({ data: { email: EMAIL, isVerified: 1 } })).id;
    await registerCaptureKey(userId, newPublicKey());
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await disconnectDb();
  });

  const readRows = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM capture_read_models WHERE user_id = ${userId}`;
    return Number(rows[0].count);
  };

  const isKeyDisabled = async (): Promise<boolean> => {
    const rows = await prisma.$queryRaw<Array<{ disabled_at: bigint | null }>>`
      SELECT disabled_at FROM capture_keys WHERE user_id = ${userId}`;
    return rows[0]?.disabled_at !== null && rows[0]?.disabled_at !== undefined;
  };

  /** Backends of this database waiting on a lock while running `queryPattern`. */
  const lockWaiters = async (queryPattern: string): Promise<number> => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock' AND query LIKE ${queryPattern}`;
    return Number(rows[0].count);
  };

  /** Backends running `waiterPattern` that are blocked by one running `holderPattern`. */
  const blockedBy = async (
    waiterPattern: string,
    holderPattern: string,
  ): Promise<number> => {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM pg_stat_activity waiter
      JOIN pg_stat_activity holder ON holder.pid = ANY (pg_blocking_pids(waiter.pid))
      WHERE waiter.datname = current_database()
        AND waiter.query LIKE ${waiterPattern} AND holder.query LIKE ${holderPattern}`;
    return Number(rows[0].count);
  };

  it('a capture switch-off after the switch-on passed its key check waits for it and deletes the row', async () => {
    // Hold the account row. The switch-on's insert checks its foreign key
    // against it (FOR KEY SHARE), so the real enableReadAccess stops after its
    // key check, keeping whatever lock that check took.
    let release: () => void = () => undefined;
    let locked: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 10000 },
    );
    await ready;

    const finished: string[] = [];
    const enabling = enableReadAccess(userId).then((result) => {
      finished.push('enable');
      return result;
    });
    let disabling: Promise<void> | undefined;
    try {
      await expect
        .poll(() => lockWaiters('%INSERT INTO capture_read_models%'), { timeout: 3000 })
        .toBeGreaterThan(0);
      disabling = disableCaptureKey(userId).then(() => {
        finished.push('disable');
      });
      // Until the switch-off either queues or finishes.
      await expect
        .poll(
          async () =>
            finished.includes('disable') ||
            (await lockWaiters('%UPDATE capture_keys SET disabled_at%')) > 0,
          { timeout: 3000 },
        )
        .toBe(true);
      // While the switch-on is open the switch-off has not committed: it waits
      // on the switch-on's own backend.
      expect(finished).toEqual([]);
      expect(
        await blockedBy(
          '%UPDATE capture_keys SET disabled_at%',
          '%INSERT INTO capture_read_models%',
        ),
      ).toBe(1);
    } finally {
      release();
      await blocker;
      await Promise.allSettled([enabling, disabling]);
    }

    expect(await enabling).toMatchObject({ status: 'enabled' });
    expect(finished).toEqual(['enable', 'disable']);
    expect(await isKeyDisabled()).toBe(true);
    expect(await readRows()).toBe(0);
  });

  it(`leaves no row after ${RACE_ROUNDS} concurrent switch-on / capture switch-off pairs`, async () => {
    const leftovers: number[] = [];
    for (let round = 0; round < RACE_ROUNDS; round++) {
      // A new key turns capture back on (the same key would be refused).
      await registerCaptureKey(userId, newPublicKey());
      expect(await readRows()).toBe(0);
      // Both in flight at once; which one is sent first alternates.
      await Promise.all(
        round % 2 === 0
          ? [enableReadAccess(userId), disableCaptureKey(userId)]
          : [disableCaptureKey(userId), enableReadAccess(userId)],
      );
      if ((await isKeyDisabled()) && (await readRows()) > 0) leftovers.push(round);
      expect(await isKeyDisabled()).toBe(true);
    }
    expect(leftovers).toEqual([]);
  });
});
