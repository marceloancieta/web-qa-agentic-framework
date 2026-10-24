import { expect, request, test } from '@playwright/test'; // expect-finding: spec-sends-request
import axios from 'axios'; // expect-finding: spec-sends-request
import { OrdersClient } from '../api/orders-client';

test.beforeEach(async ({ request }) => { // expect-finding: spec-sends-request
  await request.post('/api/reset');
});

test('an order through the api client', async ({ customer }) => {
  const orders = new OrdersClient(customer.api);
  expect((await orders.list()).length).toBe(0);
});

test('an order sent by hand', async ({ page }) => {
  await fetch('http://localhost:3000/api/orders'); // expect-finding: spec-sends-request
  const context = await request.newContext(); // expect-finding: spec-sends-request
  await context.dispose();
  await axios.get('/api/orders');
  await page.goto('/orders');
});
