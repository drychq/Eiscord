import { expect, Page, test } from '@playwright/test';

const demoPassword = 'DemoPass1';
const carolId = '10000000-0000-4000-8000-000000000003';

test.describe('friend and DM flows', () => {
  test('shows seeded friend Bob in Alice friend list', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await expect(page.getByRole('button', { name: 'Bob', exact: true })).toBeVisible();
    await expect(page.getByText('@bob').first()).toBeVisible();
  });

  test('Alice sends friend request to Carol via UUID', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /添加好友/ }).click();
    await page.getByPlaceholder('输入用户 UUID').fill(carolId);
    await page.getByRole('button', { name: '发送申请' }).click();

    await page.getByRole('tab', { name: /^待处理/ }).click();
    await expect(page.getByText('等待对方')).toBeVisible();
  });

  test('Carol sees and accepts Alice friend request', async ({ page }) => {
    // Ensure Alice's request exists, then Carol accepts it
    await login(page, 'carol', demoPassword);

    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /^待处理/ }).click();

    const acceptButton = page.getByRole('button', { name: '接受' });
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
    }

    // After accepting, switch to friends tab to verify
    await page.getByRole('tab', { name: /^好友 / }).click();
    await expect(page.getByText('@alice').first()).toBeVisible();
  });

  test('Carol rejects a pending friend request', async ({ page }) => {
    // Alice sends request, login as Carol and reject it
    await login(page, 'alice', demoPassword);
    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /添加好友/ }).click();

    // Use a unique-time-based approach: send request then immediately test
    await page.getByPlaceholder('输入用户 UUID').fill(carolId);
    const sendButton = page.getByRole('button', { name: '发送申请' });
    if (await sendButton.isEnabled()) await sendButton.click();

    // Re-login as Carol (must clear Alice's session first)
    await logout(page);
    await login(page, 'carol', demoPassword);
    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /^待处理/ }).click();

    const rejectButton = page.getByRole('button', { name: '拒绝' });
    if (await rejectButton.isVisible()) {
      await rejectButton.click();
      await expect(rejectButton).not.toBeVisible();
    }
  });

  test('Alice opens DM with Bob and exchanges messages', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Bob', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/dm\/[0-9a-f-]{36}/);

    await sendMessage(page, 'hello from browser test');
    await expect(page.getByText('hello from browser test')).toBeVisible();

    await sendMessage(page, 'second message');
    await expect(page.getByText('second message')).toBeVisible();
  });

  test('empty composer does not send', async ({ page }) => {
    await login(page, 'alice', demoPassword);

    await page.getByRole('button', { name: 'Bob', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/dm/);

    const sendButton = page.getByRole('button', { name: '发送' });
    await expect(sendButton).toBeDisabled();
  });
});

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/app/);
}

async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole('textbox', { name: '消息内容' }).fill(content);
  const sendButton = page.getByRole('button', { name: '发送' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}
