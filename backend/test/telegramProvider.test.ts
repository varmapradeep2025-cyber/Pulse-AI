import test from "node:test";
import assert from "node:assert/strict";
import { TelegramNotificationProvider } from "../src/services/providers/telegramProvider.js";
import {
  CompositeSmsProvider,
  MockSmsProvider,
} from "../src/services/providers/smsProvider.js";

test("TelegramNotificationProvider rejects when no chat ID or default chat ID is available", async () => {
  const provider = new TelegramNotificationProvider("fake-token");
  const result = await provider.sendSms({
    phoneNumber: "not-a-chat-id",
    message: "Test message",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.provider, "telegram");
  assert.match(result.errorMessage ?? "", /No Telegram chat ID provided/);
});

test("CompositeSmsProvider dispatches to multiple providers and returns accepted if any succeeds", async () => {
  const mock1 = new MockSmsProvider();
  const mock2 = new MockSmsProvider();

  const composite = new CompositeSmsProvider([mock1, mock2]);
  const result = await composite.sendSms({
    phoneNumber: "9876543210",
    message: "Test Composite Alert",
  });

  assert.ok(result.status === "accepted" || result.status === "delivered");
  assert.equal(mock1.sentMessages.length, 1);
  assert.equal(mock2.sentMessages.length, 1);
  assert.equal(mock1.sentMessages[0].message, "Test Composite Alert");
});
