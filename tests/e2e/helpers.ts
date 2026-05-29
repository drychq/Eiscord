import { expect, Page } from '@playwright/test';

export const demoPassword = 'DemoPass1';
export const strongPassword = 'StrongPass1';

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:14400';

export async function createUserViaApi(username: string, password = strongPassword): Promise<void> {
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    body: JSON.stringify({
      email_or_phone: `${username}@example.com`,
      password,
      username,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (response.status !== 201) {
    throw new Error(`Failed to create test user ${username}: ${response.status} ${await response.text()}`);
  }
}

export async function login(
  page: Page,
  username: string,
  password = demoPassword,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('用户名 / 邮箱 / 手机号').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: '好友与私聊' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

export async function registerNewUser(
  page: Page,
  username: string,
  password = strongPassword,
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('邮箱 / 手机号').fill(`${username}@example.com`);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码').fill(password);
  await page.getByRole('button', { name: '注册' }).click();
}

export async function sendFriendRequestBySearch(page: Page, username: string): Promise<void> {
  await page.goto('/app/friends');
  await page.getByRole('tab', { name: /添加好友/ }).click();
  await page.getByLabel('搜索用户').fill(username);

  const result = page
    .getByRole('region', { name: '添加好友' })
    .getByRole('listitem', { name: new RegExp(`@${escapeRegExp(username)}`, 'i') });
  await expect(result).toBeVisible();

  const addButton = result.getByRole('button', { name: '添加' });
  await expect(addButton).toBeEnabled();
  await addButton.click();
}

export async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByRole('textbox', { name: '消息内容' }).fill(content);
  const sendButton = page.getByRole('button', { name: '发送' });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
}

export function uniqueUsername(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 31 - suffix.length);

  return `${safePrefix}_${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
