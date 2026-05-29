import { expect, test } from '@playwright/test';

import { login, registerNewUser, strongPassword, uniqueUsername } from './helpers';

test.describe('authentication flows', () => {
  test('registers a new user and lands on login page', async ({ page }) => {
    const username = uniqueUsername('web');

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: '注册 Eiscord' })).toBeVisible();

    await registerNewUser(page, username, strongPassword);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('注册成功')).toBeVisible();
  });

  test('logs in with valid credentials', async ({ page }) => {
    await login(page, 'alice');
    await expect(page.getByRole('heading', { name: '好友与私聊' })).toBeVisible();
  });

  test('rejects login with wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('用户名 / 邮箱 / 手机号').fill('alice');
    await page.getByLabel('密码').fill('WrongPass1');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/\/app/);
  });

  test('rejects login with non-existent user', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('用户名 / 邮箱 / 手机号').fill('nonexistent_user_42');
    await page.getByLabel('密码').fill('SomePass1');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.getByText(/账号或密码错误|不存在|找不到|失败/)).toBeVisible();
    await expect(page).not.toHaveURL(/\/app/);
  });

  test('registers and then logs in successfully', async ({ page }) => {
    const username = uniqueUsername('w2');

    await registerNewUser(page, username, strongPassword);

    await expect(page).toHaveURL(/\/login/);
    await login(page, username, strongPassword);
    await expect(page.getByRole('heading', { name: '好友与私聊' })).toBeVisible();
  });
});
