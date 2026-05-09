import { expect, Page, test } from '@playwright/test';

const demoPassword = 'DemoPass1';

test.describe('server channel and voice flows', () => {
  test('owner Alice navigates to server and sends text message', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /general/ }).click();
    await expect(page).toHaveURL(/\/channels\/[0-9a-f-]{36}/);

    const content = `channel msg ${Date.now()}`;
    await sendMessage(page, content);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('owner Alice can see private channel in sidebar', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('link', { name: /general/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /private/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /voice-room/ })).toBeVisible();
  });

  test('owner Alice joins voice channel, sees connected status, and toggles mute', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /voice-room/ }).click();
    await expect(page).toHaveURL(/\/voice\/[0-9a-f-]{36}/);

    await page.getByTestId('voice-join').click();
    await expect(page.getByTestId('voice-leave')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('voice-status')).toBeVisible();

    const muteButton = page.getByTestId('voice-mute');
    await muteButton.click();
    await expect(muteButton).toHaveAttribute('aria-pressed', 'true');

    await muteButton.click();
    await expect(muteButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('owner Alice joins voice channel and toggles deafen', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /voice-room/ }).click();

    await page.getByTestId('voice-join').click();
    await expect(page.getByTestId('voice-leave')).toBeVisible({ timeout: 15_000 });

    const deafenButton = page.getByTestId('voice-deafen');
    await deafenButton.click();
    await expect(deafenButton).toHaveAttribute('aria-pressed', 'true');

    await deafenButton.click();
    await expect(deafenButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('ordinary member Carol cannot see restricted private channel', async ({ page }) => {
    await login(page, 'carol', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('link', { name: /general/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /voice-room/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /private/ })).toHaveCount(0);
  });

  test('ordinary member Carol can see and use general channel', async ({ page }) => {
    await login(page, 'carol', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await page.getByRole('link', { name: /general/ }).click();
    await expect(page).toHaveURL(/\/channels\/[0-9a-f-]{36}/);

    const content = `carol says ${Date.now()}`;
    await sendMessage(page, content);
    await expect(page.getByText(content)).toBeVisible();
  });

  test('owner Alice sees server settings button', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('button', { name: '社区设置' })).toBeVisible();
  });

  test('ordinary member Carol does not see server settings', async ({ page }) => {
    await login(page, 'carol', demoPassword);

    await page.getByRole('button', { name: 'Course Discussion' }).click();
    await expect(page.getByRole('button', { name: '社区设置' })).toHaveCount(0);
  });
});

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/app/);
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole('textbox', { name: '消息内容' }).fill(content);
  const sendButton = page.getByRole('button', { name: '发送' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}
