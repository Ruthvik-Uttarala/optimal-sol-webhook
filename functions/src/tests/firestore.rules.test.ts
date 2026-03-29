import fs from "node:fs";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "parking-sol-rules-test";

let testEnv: RulesTestEnvironment;

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.collection("users").doc("uid_admin").set({ id: "uid_admin", globalRole: "admin" });
    await db.collection("users").doc("uid_operator").set({ id: "uid_operator", globalRole: "operator" });
    await db.collection("users").doc("uid_support").set({ id: "uid_support", globalRole: "support" });

    await db.collection("userLotAccess").doc("access_uid_operator_lot_a").set({
      id: "access_uid_operator_lot_a",
      userId: "uid_operator",
      lotId: "lot_a",
      organizationId: "org_demo",
      status: "active"
    });

    await db.collection("userLotAccess").doc("access_uid_support_lot_a").set({
      id: "access_uid_support_lot_a",
      userId: "uid_support",
      lotId: "lot_a",
      organizationId: "org_demo",
      status: "active"
    });

    await db.collection("events").doc("evt_1").set({ id: "evt_1", lotId: "lot_a", plate: "ABC1234" });
    await db.collection("rules").doc("rule_1").set({ id: "rule_1", lotId: "lot_a", status: "active" });
    await db.collection("payments").doc("pay_1").set({ id: "pay_1", lotId: "lot_a", status: "active" });
    await db.collection("auditLogs").doc("audit_1").set({ id: "audit_1", lotId: "lot_a", summary: "test" });
  });
}

describe("firestore security rules", () => {
  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] || "127.0.0.1",
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8080),
        rules
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedBaseData();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it("allows operator to read events in assigned lot", async () => {
    const db = testEnv.authenticatedContext("uid_operator").firestore();
    await assertSucceeds(db.collection("events").doc("evt_1").get());
  });

  it("blocks operator from writing rules", async () => {
    const db = testEnv.authenticatedContext("uid_operator").firestore();
    await assertFails(db.collection("rules").doc("rule_1").set({ status: "inactive" }, { merge: true }));
  });

  it("allows admin to update rules", async () => {
    const db = testEnv.authenticatedContext("uid_admin").firestore();
    await assertSucceeds(db.collection("rules").doc("rule_1").set({ status: "inactive" }, { merge: true }));
  });

  it("allows support to read audit logs", async () => {
    const db = testEnv.authenticatedContext("uid_support").firestore();
    await assertSucceeds(db.collection("auditLogs").doc("audit_1").get());
  });

  it("blocks support from writing payments", async () => {
    const db = testEnv.authenticatedContext("uid_support").firestore();
    await assertFails(db.collection("payments").doc("pay_1").set({ status: "cancelled" }, { merge: true }));
  });
});
