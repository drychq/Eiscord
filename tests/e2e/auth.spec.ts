import { expect, Page, test } from '@playwright/test';

const demoPassword = 'DemoPass1';

test.describe('authentication flows', () => {
  test('registers a new user and lands on login page', async ({ page }) => {
    const suffix = Date.now();
    const username = `web_${suffix}`;

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: '注册 Eiscord' })).toBeVisible();

    await page.getByPlaceholder('3-32 位字母、数字或下划线').fill(username);
    await page.getByPlaceholder('用于登录和找回密码').fill(`${username}@example.com`);
    await page.getByPlaceholder('至少 8 位，含字母和数字').fill('StrongPass1');
    await page.locator('input[type="password"]').last().fill('StrongPass1');
    await page.getByRole('button', { name: '注册' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('注册成功')).toBeVisible();
  });

  test('logs in with valid credentials', async ({ page }) => {
    await login(page, 'alice', demoPassword);
    await expect(page.getByRole('heading', { name: '好友与私聊' })).toBeVisible();
  });

  test('rejects login with wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').first().fill('alice');
    await page.locator('input[type="password"]').first().fill('WrongPass1');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page).not.toHaveURL(/\/app/);
  });

  test('rejects login with non-existent user', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').first().fill('nonexistent_user_42');
    await page.locator('input[type="password"]').first().fill('SomePass1');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.getByText(/账号或密码错误|不存在|找不到|失败/)).toBeVisible();
    await expect(page).not.toHaveURL(/\/app/);
  });

  test('registers and then logs in successfully', async ({ page }) => {
    const suffix = Date.now();
    const username = `w2_${suffix}`;

    await page.goto('/register');
    await page.getByPlaceholder('3-32 位字母、数字或下划线').fill(username);
    await page.getByPlaceholder('用于登录和找回密码').fill(`${username}@example.com`);
    await page.getByPlaceholder('至少 8 位，含字母和数字').fill('StrongPass1');
    await page.locator('input[type="password"]').last().fill('StrongPass1');
    await page.getByRole('button', { name: '注册' }).click();

    await expect(page).toHaveURL(/\/login/);
    await login(page, username, 'StrongPass1');
    await expect(page.getByRole('heading', { name: '好友与私聊' })).toBeVisible();
  });
});

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/app/);
}
