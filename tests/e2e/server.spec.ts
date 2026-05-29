import { expect, test } from '@playwright/test';

import { login, sendMessage } from './helpers';

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
