"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ERPBackend } = require("../electron/backend/erp.cjs");

async function withBackends(fn) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amerp-locks-"));
  const dataRoot = path.join(tempRoot, "data");
  const userDataRoot = path.join(tempRoot, "userData");
  const previousDataFolder = process.env.AMERP_DATA_FOLDER;
  process.env.AMERP_DATA_FOLDER = dataRoot;

  const makeBackend = () => new ERPBackend({
    app: {
      getPath: () => userDataRoot,
      getAppPath: () => process.cwd(),
      getVersion: () => "test",
      isPackaged: false
    },
    devServerUrl: "",
    pythonPath: "python"
  });

  try {
    await fs.mkdir(userDataRoot, { recursive: true });
    const primary = makeBackend();
    await primary.initializeDataFolder(dataRoot);
    const secondary = makeBackend();
    await fn({ primary, secondary, dataRoot });
  } finally {
    if (previousDataFolder == null) {
      delete process.env.AMERP_DATA_FOLDER;
    } else {
      process.env.AMERP_DATA_FOLDER = previousDataFolder;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function seedKanban(backend, id = "lock-card") {
  await backend.saveKanbanCard({
    id,
    itemName: "Lock Test Card",
    internalInventoryNumber: id.toUpperCase(),
    status: "Active",
    active: true
  });
  return backend.loadKanbanCard(id);
}

function lockFile(dataRoot, kind, id) {
  return path.join(dataRoot, "locks", `${kind}-${id}.json`);
}

async function expireLock(dataRoot, kind, id) {
  const filePath = lockFile(dataRoot, kind, id);
  const lock = JSON.parse(await fs.readFile(filePath, "utf8"));
  const oldDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await fs.writeFile(filePath, JSON.stringify({
    ...lock,
    acquiredAt: oldDate,
    renewedAt: oldDate,
    expiresAt: oldDate
  }, null, 2));
}

test("lock lifecycle uses session token ownership", async () => {
  await withBackends(async ({ primary, secondary }) => {
    const card = await seedKanban(primary);
    const lock = await primary.acquireLock("kanban", card.id, { baseRevision: card._lockBaseRevision });

    assert.equal(lock.version, 2);
    assert.ok(lock.token);
    assert.equal((await primary.getLockStatus("kanban", card.id)).status, "owned");

    const secondaryStatus = await secondary.getLockStatus("kanban", card.id);
    assert.equal(secondaryStatus.status, "locked");
    assert.equal(secondaryStatus.token, "");
    await assert.rejects(
      () => secondary.acquireLock("kanban", card.id, { baseRevision: card._lockBaseRevision }),
      { code: "LOCK_HELD" }
    );

    const renewed = await primary.renewLock("kanban", card.id, lock.token);
    assert.equal(renewed.token, lock.token);
    await assert.rejects(() => primary.renewLock("kanban", card.id, "wrong-token"), { code: "LOCK_LOST" });
    assert.equal(await secondary.releaseLock("kanban", card.id, lock.token), false);
    assert.equal(await primary.releaseLock("kanban", card.id, lock.token), true);
    assert.equal((await secondary.getLockStatus("kanban", card.id)).status, "unlocked");
  });
});

test("stale locks can be taken over, but saves remain advisory", async () => {
  await withBackends(async ({ primary, secondary, dataRoot }) => {
    const card = await seedKanban(primary, "stale-card");
    const originalLock = await primary.acquireLock("kanban", card.id, { baseRevision: card._lockBaseRevision });
    await expireLock(dataRoot, "kanban", card.id);

    await assert.rejects(
      () => secondary.acquireLock("kanban", card.id, { baseRevision: card._lockBaseRevision }),
      { code: "LOCK_STALE" }
    );
    const takeover = await secondary.takeOverLock("kanban", card.id, "", { baseRevision: card._lockBaseRevision });
    assert.notEqual(takeover.token, originalLock.token);
    await assert.rejects(() => primary.renewLock("kanban", card.id, originalLock.token), { code: "LOCK_LOST" });
    const oldOwnerSaved = await primary.saveKanbanCard({ ...card, itemName: "Old owner write" }, {
      requireLock: true,
      lockToken: originalLock.token,
      baseRevision: card._lockBaseRevision
    });
    assert.equal(oldOwnerSaved.itemName, "Old owner write");

    const reloaded = await secondary.loadKanbanCard(card.id);
    const saved = await secondary.saveKanbanCard({ ...reloaded, itemName: "Taken over" }, {
      requireLock: true,
      lockToken: takeover.token,
      baseRevision: reloaded._lockBaseRevision
    });
    assert.equal(saved.itemName, "Taken over");
  });
});

test("baseRevision conflicts are advisory and do not block saves", async () => {
  await withBackends(async ({ primary, secondary }) => {
    const card = await seedKanban(primary, "revision-card");
    const lock = await primary.acquireLock("kanban", card.id, { baseRevision: card._lockBaseRevision });

    await secondary.saveKanbanCard({ ...card, itemName: "Manual external edit" });

    const saved = await primary.saveKanbanCard({ ...card, itemName: "Old draft write" }, {
      requireLock: true,
      lockToken: lock.token,
      baseRevision: card._lockBaseRevision
    });
    assert.equal(saved.itemName, "Old draft write");
  });
});
