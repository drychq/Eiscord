import { expect, test } from '@playwright/test';

import { createUserViaApi, login, logout, sendMessage, strongPassword, uniqueUsername } from './helpers';

test.describe('server channel and voice flows', () => {
  test('owner Alice navigates to server and sends text message', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /general/ }).click();
    await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible();

    const content = `channel msg ${Date.now()}`;
    await sendMessage(page, content);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('owner Alice can see private channel in sidebar', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('link', { name: /general/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /private/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /voice-room/ })).toBeVisible();
  });

  test('owner Alice joins voice channel, sees connected status, and toggles mute', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /voice-room/ }).click();
    await expect(page.getByRole('heading', { name: 'voice-room' })).toBeVisible();

    await page.getByRole('button', { name: '加入语音' }).click();
    await expect(page.getByRole('button', { name: '离开语音' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('voice-status')).toContainText(/已连接|协商中/);

    const muteButton = page.getByRole('button', { name: '静音麦克风' });
    await muteButton.click();
    await expect(page.getByRole('button', { name: '取消静音' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '取消静音' }).click();
    await expect(page.getByRole('button', { name: '静音麦克风' })).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: '离开语音' }).click();
    await expect(page.getByRole('button', { name: '加入语音' })).toBeVisible();
  });

  test('owner Alice joins voice channel and toggles deafen', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /voice-room/ }).click();

    await page.getByRole('button', { name: '加入语音' }).click();
    await expect(page.getByRole('button', { name: '离开语音' })).toBeVisible({ timeout: 15_000 });

    const deafenButton = page.getByRole('button', { name: '关闭收听' });
    await deafenButton.click();
    await expect(page.getByRole('button', { name: '恢复收听' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '恢复收听' }).click();
    await expect(page.getByRole('button', { name: '关闭收听' })).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: '离开语音' }).click();
    await expect(page.getByRole('button', { name: '加入语音' })).toBeVisible();
  });

  test('ordinary member Carol cannot see restricted private channel', async ({ page }) => {
    await login(page, 'carol');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('link', { name: /general/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /voice-room/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /private/ })).toHaveCount(0);
  });

  test('ordinary member Carol can see and use general channel', async ({ page }) => {
    await login(page, 'carol');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /general/ }).click();
    await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible();

    const content = `carol says ${Date.now()}`;
    await sendMessage(page, content);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('owner Alice sees server settings button', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('button', { name: '社区设置' })).toBeVisible();
  });

  test('ordinary member Carol does not see server settings', async ({ page }) => {
    await login(page, 'carol');

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('button', { name: '社区设置' })).toHaveCount(0);
  });
});

test.describe('server invite flow', () => {
  test('owner generates an invite and a new user joins through the invite link', async ({
    page,
  }) => {
    const joiner = uniqueUsername('inv');
    await createUserViaApi(joiner);

    // Owner Alice opens community settings and generates a fresh invite.
    await login(page, 'alice');
    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('button', { name: '社区设置' }).click();
    await page.getByRole('link', { name: '邀请' }).click();

    const codeLocator = page.locator('.settings-list-item .item-name');
    await expect(codeLocator.first()).toBeVisible();
    const before = await codeLocator.allInnerTexts();
    await page.getByRole('button', { name: '生成邀请' }).click();
    await expect(codeLocator).toHaveCount(before.length + 1);
    const after = await codeLocator.allInnerTexts();
    const code = after.find((c) => !before.includes(c))?.trim();
    expect(code).toBeTruthy();

    // A brand-new (non-member) user opens the invite link, which joins the community.
    await logout(page);
    await login(page, joiner, strongPassword);
    const joinResponse = page.waitForResponse(
      (r) => r.url().includes('/api/v1/servers/join') && r.request().method() === 'POST',
    );
    await page.goto(`/invite/${code}`);
    expect((await joinResponse).status()).toBe(201);

    // The joined community is now visible in the new member's workspace.
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Course Discussion' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
