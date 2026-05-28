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
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "amerp-time-clock-"));
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
    await fn({ backend, dataRoot });
  } finally {
    if (previousDataFolder == null) {
      delete process.env.AMERP_DATA_FOLDER;
    } else {
      process.env.AMERP_DATA_FOLDER = previousDataFolder;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function readEvents(dataRoot) {
  const raw = await fs.readFile(path.join(dataRoot, "time-clock", "events.jsonl"), "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

test("time clock initialization and employee records stay local and non-sensitive", async () => {
  await withBackend(async ({ backend, dataRoot }) => {
    assert.equal(await pathExists(path.join(dataRoot, "employees")), true);
    assert.equal(await pathExists(path.join(dataRoot, "time-clock", "sessions")), true);

    const employee = await backend.saveEmployee({
      name: "Alex Operator",
      payRate: 100,
      ssn: "000-00-0000",
      address: "Do not store"
    });

    assert.equal(employee.name, "Alex Operator");
    assert.deepEqual(Object.keys(employee).sort(), [
      "active",
      "archivedAt",
      "createdAt",
      "id",
      "name",
      "updatedAt"
    ].sort());
    assert.equal(await pathExists(path.join(dataRoot, "employees", employee.id, "employee.json")), true);
    assert.equal(await pathExists(path.join(dataRoot, "employees", employee.id, "history.md")), true);
  });
});

test("clock-in and clock-out create readable sessions, events, and exact duration minutes", async () => {
  await withBackend(async ({ backend, dataRoot }) => {
    const employee = await backend.saveEmployee({ name: "Jordan" });
    const open = await backend.clockInEmployee(employee.id, { clockInAt: "2026-05-21T12:00:00.000Z" });

    await assert.rejects(
      () => backend.clockInEmployee(employee.id, { clockInAt: "2026-05-21T12:05:00.000Z" }),
      /already clocked in/i
    );

    const closed = await backend.clockOutEmployee(employee.id, { clockOutAt: "2026-05-21T15:30:00.000Z" });
    assert.equal(closed.id, open.id);
    assert.equal(closed.status, "Closed");
    assert.equal(closed.durationMinutes, 210);
    assert.equal(await pathExists(path.join(dataRoot, "time-clock", "sessions", closed.id, "session.json")), true);

    await assert.rejects(
      () => backend.clockOutEmployee(employee.id, { clockOutAt: "2026-05-21T16:00:00.000Z" }),
      /not currently clocked in/i
    );

    const events = await readEvents(dataRoot);
    assert.deepEqual(events.map((event) => event.eventType), ["clock_in", "clock_out"]);
  });
});

test("time clock dashboard computes default and configured pay periods", async () => {
  await withBackend(async ({ backend }) => {
    const defaultDashboard = await backend.getTimeClockDashboard({ referenceDate: "2026-05-25T12:00:00.000Z" });
    assert.equal(defaultDashboard.payPeriod.startDay, "thursday");
    assert.equal(defaultDashboard.payPeriod.startDate, "2026-05-21");
    assert.equal(defaultDashboard.payPeriod.endDate, "2026-05-27");

    await backend.savePreferences({ payPeriodStartDay: "monday", payPeriodLengthDays: 7 });
    const mondayDashboard = await backend.getTimeClockDashboard({ referenceDate: "2026-05-25T12:00:00.000Z" });
    assert.equal(mondayDashboard.payPeriod.startDay, "monday");
    assert.equal(mondayDashboard.payPeriod.startDate, "2026-05-25");
    assert.equal(mondayDashboard.payPeriod.endDate, "2026-05-31");
  });
});

test("session corrections require a reason, recalculate duration, and append an event", async () => {
  await withBackend(async ({ backend, dataRoot }) => {
    const employee = await backend.saveEmployee({ name: "Morgan" });
    const open = await backend.clockInEmployee(employee.id, { clockInAt: "2026-05-21T12:00:00.000Z" });
    await backend.clockOutEmployee(employee.id, { clockOutAt: "2026-05-21T14:00:00.000Z" });

    await assert.rejects(
      () => backend.correctTimeClockSession(open.id, { clockOutAt: "2026-05-21T14:30:00.000Z" }, " "),
      /correction reason is required/i
    );

    const corrected = await backend.correctTimeClockSession(
      open.id,
      { clockInAt: "2026-05-21T12:15:00.000Z", clockOutAt: "2026-05-21T14:45:00.000Z" },
      "Supervisor corrected missed punch."
    );

    assert.equal(corrected.durationMinutes, 150);
    assert.equal(corrected.corrected, true);
    assert.equal(corrected.corrections.length, 1);
    assert.equal(corrected.corrections[0].reason, "Supervisor corrected missed punch.");

    const events = await readEvents(dataRoot);
    assert.equal(events.at(-1).eventType, "session_corrected");
    assert.equal(events.at(-1).reason, "Supervisor corrected missed punch.");
  });
});

test("paid marking supports bulk changes and archived employees stay visible in history", async () => {
  await withBackend(async ({ backend }) => {
    const employee = await backend.saveEmployee({ name: "Riley" });
    const open = await backend.clockInEmployee(employee.id, { clockInAt: "2026-05-21T12:00:00.000Z" });
    await backend.clockOutEmployee(employee.id, { clockOutAt: "2026-05-21T13:00:00.000Z" });

    const [paid] = await backend.markTimeClockSessionsPaid([open.id], true);
    assert.equal(paid.paid, true);
    assert.ok(paid.paidAt);

    const [unpaid] = await backend.markTimeClockSessionsPaid([open.id], false);
    assert.equal(unpaid.paid, false);
    assert.equal(unpaid.paidAt, "");

    await backend.archiveEmployee(employee.id);
    assert.equal((await backend.listEmployees()).some((item) => item.id === employee.id), false);

    const allEmployees = await backend.listEmployees({ includeArchived: true });
    assert.equal(allEmployees.find((item) => item.id === employee.id)?.active, false);

    const dashboard = await backend.getTimeClockDashboard({ periodStartDate: "2026-05-21" });
    assert.equal(dashboard.groups[0].employeeName, "Riley");
    assert.equal(dashboard.groups[0].employeeActive, false);
    assert.equal(dashboard.groups[0].totalMinutes, 60);
  });
});
