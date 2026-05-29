import { expect, test } from '@playwright/test';

import {
  createUserViaApi,
  login,
  logout,
  sendFriendRequestBySearch,
  sendMessage,
  strongPassword,
  uniqueUsername,
} from './helpers';

test.describe('friend and DM flows', () => {
  test('shows seeded friend Bob in Alice friend list', async ({ page }) => {
    await login(page, 'alice');

    const friendsList = page.getByRole('region', { name: '好友列表' });
    await expect(friendsList.getByRole('listitem', { name: /Bob @bob/ })).toBeVisible();
  });

  test('Alice sends friend request by searching username', async ({ page }) => {
    const targetUsername = uniqueUsername('friend_target');
    await createUserViaApi(targetUsername);
    await login(page, 'alice');

    await sendFriendRequestBySearch(page, targetUsername);

    await page.getByRole('tab', { name: /^待处理/ }).click();
    await expect(
      page
        .getByRole('region', { name: '待处理申请' })
        .getByRole('listitem', { name: new RegExp(`@${targetUsername}.*等待对方`) }),
    ).toBeVisible();
  });

  test('recipient sees and accepts a friend request', async ({ page }) => {
    const requester = uniqueUsername('friend_requester');
    const recipient = uniqueUsername('friend_recipient');
    await createUserViaApi(requester, strongPassword);
    await createUserViaApi(recipient, strongPassword);

    await login(page, requester, strongPassword);
    await sendFriendRequestBySearch(page, recipient);
    await logout(page);
    await login(page, recipient, strongPassword);

    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /^待处理/ }).click();

    const pendingRequest = page
      .getByRole('region', { name: '待处理申请' })
      .getByRole('listitem', { name: new RegExp(`@${requester}.*待你处理`) });
    await pendingRequest.getByRole('button', { name: '接受' }).click();

    await page.getByRole('tab', { name: /^好友 / }).click();
    await expect(
      page
        .getByRole('region', { name: '好友列表' })
        .getByRole('listitem', { name: new RegExp(`@${requester}`) }),
    ).toBeVisible();
  });

  test('recipient rejects a pending friend request', async ({ page }) => {
    const requester = uniqueUsername('friend_rejecter');
    const recipient = uniqueUsername('friend_reject_target');
    await createUserViaApi(requester, strongPassword);
    await createUserViaApi(recipient, strongPassword);

    await login(page, requester, strongPassword);
    await sendFriendRequestBySearch(page, recipient);
    await logout(page);
    await login(page, recipient, strongPassword);
    await page.goto('/app/friends');
    await page.getByRole('tab', { name: /^待处理/ }).click();

    const pendingRequest = page
      .getByRole('region', { name: '待处理申请' })
      .getByRole('listitem', { name: new RegExp(`@${requester}.*待你处理`) });
    await pendingRequest.getByRole('button', { name: '拒绝' }).click();
    await expect(pendingRequest).toHaveCount(0);
  });

  test('Alice opens DM with Bob and exchanges messages', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: '与 Bob 私聊' }).first().click();
    await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible();

    const firstMessage = `hello from browser test ${Date.now()}`;
    await sendMessage(page, firstMessage);
    await expect(page.getByText(firstMessage)).toBeVisible();

    const secondMessage = `second message ${Date.now()}`;
    await sendMessage(page, secondMessage);
    await expect(page.getByText(secondMessage)).toBeVisible();
  });

  test('empty composer does not send', async ({ page }) => {
    await login(page, 'alice');

    await page.getByRole('button', { name: '与 Bob 私聊' }).first().click();
    await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible();

    const sendButton = page.getByRole('button', { name: '发送' });
    await expect(sendButton).toBeDisabled();
  });
});
