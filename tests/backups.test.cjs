"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ERPBackend } = require("../electron/backend/erp.cjs");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function withBackend(fn) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amerp-backups-"));
  const dataRoot = path.join(tempRoot, "data");
  const userDataRoot = path.join(tempRoot, "userData");
  const backupRoot = path.join(tempRoot, "backups");
  const previousDataFolder = process.env.AMERP_DATA_FOLDER;
  process.env.AMERP_DATA_FOLDER = dataRoot;

  try {
    await fs.mkdir(userDataRoot, { recursive: true });
    const backend = new ERPBackend({
      app: {
        getPath: () => userDataRoot,
        getAppPath: () => process.cwd(),
        isPackaged: false
      },
      devServerUrl: "",
      pythonPath: "python"
    });
    await backend.initializeDataFolder(dataRoot);
    await backend.savePreferences({ backupFolder: backupRoot });
    await fn({ backend, dataRoot, backupRoot });
  } finally {
    if (previousDataFolder == null) {
      delete process.env.AMERP_DATA_FOLDER;
    } else {
      process.env.AMERP_DATA_FOLDER = previousDataFolder;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("manual backups snapshot canonical data and exclude cache, locks, and nested backups", async () => {
  await withBackend(async ({ backend, dataRoot }) => {
    await backend.saveKanbanCard({
      id: "backup-card",
      itemName: "Original Card",
      internalInventoryNumber: "BACKUP-1",
      status: "Active",
      active: true
    });
    await fs.writeFile(path.join(dataRoot, "cache", "transient.txt"), "ignore");
    await fs.writeFile(path.join(dataRoot, "locks", "kanban-backup-card.json"), "{}");
    await fs.mkdir(path.join(dataRoot, "backups", "nested"), { recursive: true });

    const backup = await backend.createBackup({ kind: "manual" });

    assert.equal(await pathExists(path.join(backup.path, "manifest.json")), true);
    assert.equal(await pathExists(path.join(backup.path, "data", "kanban", "backup-card", "card.json")), true);
    assert.equal(await pathExists(path.join(backup.path, "data", "cache", "transient.txt")), false);
    assert.equal(await pathExists(path.join(backup.path, "data", "locks", "kanban-backup-card.json")), false);
    assert.equal(await pathExists(path.join(backup.path, "data", "backups", "nested")), false);
  });
});

test("restoreBackup creates a safety backup and replaces current data with the selected snapshot", async () => {
  await withBackend(async ({ backend }) => {
    await backend.saveKanbanCard({
      id: "restore-card",
      itemName: "Before Restore",
      internalInventoryNumber: "RESTORE-1",
      status: "Active",
      active: true
    });
    const backup = await backend.createBackup({ kind: "manual" });

    await backend.saveKanbanCard({
      id: "restore-card",
      itemName: "Changed After Backup",
      internalInventoryNumber: "RESTORE-1",
      status: "Active",
      active: true
    });

    const restored = await backend.restoreBackup(backup.path);
    const card = await backend.loadKanbanCard("restore-card");

    assert.equal(card.itemName, "Before Restore");
    assert.equal(restored.restoredFrom.path, backup.path);
    assert.equal(restored.safetyBackup.kind, "pre-restore");
    assert.equal(await pathExists(restored.safetyBackup.path), true);
  });
});

test("automatic backups only run when enabled and due", async () => {
  await withBackend(async ({ backend }) => {
    const disabled = await backend.runAutomaticBackupIfDue();
    assert.equal(disabled.skipped, true);
    assert.equal(disabled.reason, "disabled");

    await backend.savePreferences({ backupEnabled: true, backupIntervalHours: 24, lastAutomaticBackupAt: "" });
    const first = await backend.runAutomaticBackupIfDue();
    assert.equal(first.skipped, false);
    assert.equal(first.backup.kind, "automatic");

    const second = await backend.runAutomaticBackupIfDue();
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "not_due");
    assert.equal(second.preferences.lastAutomaticBackupAt, first.backup.createdAt);
  });
});
