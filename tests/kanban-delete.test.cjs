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

test("deleteKanbanCard removes an archived card from the data folder", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amerp-kanban-delete-"));
  const dataRoot = path.join(tempRoot, "data");
  const userDataRoot = path.join(tempRoot, "userData");
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
    const saved = await backend.saveKanbanCard({
      id: "kanban-delete-test",
      itemName: "Archived Test Card",
      internalInventoryNumber: "DELETE-TEST-1",
      status: "Archived",
      active: false
    });
    const cardRoot = backend.getKanbanRoot(dataRoot, saved.id);

    assert.equal(await pathExists(cardRoot), true);
    await backend.deleteKanbanCard(saved.id);
    assert.equal(await pathExists(cardRoot), false);
  } finally {
    if (previousDataFolder == null) {
      delete process.env.AMERP_DATA_FOLDER;
    } else {
      process.env.AMERP_DATA_FOLDER = previousDataFolder;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
