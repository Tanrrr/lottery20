import { test, expect } from '@playwright/test'

test.beforeAll(async ({ request }) => {
  // Next.js dev mode compiles each route on first request and pushes a Fast
  // Refresh to connected clients once the compile finishes. If that happens
  // while the test is mid-interaction (e.g. right as the /watch/[token] route
  // is hit for the first time), it can remount the commissioner's page and
  // reset its in-progress form state. Warm up all three routes once here so
  // the dev server is already compiled before the real test below runs.
  await request.get('/')
  await request.get('/league/warmup-token/manage')
  await request.get('/watch/warmup-token')
})

test('commissioner runs a random-mode draft and the viewer sees the final order', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel(/league name/i).fill('E2E Test League')
  await page.getByRole('button', { name: /create league/i }).click()

  await page.waitForURL(/\/league\/.+\/manage/)

  // The manage page shows "Loading..." while it fetches the league from the
  // API; wait for the real form to render before interacting with it.
  const addTeamButton = page.getByRole('button', { name: /add team/i })
  await expect(addTeamButton).toBeVisible()

  for (let i = 0; i < 6; i++) {
    await addTeamButton.click()
    await expect(page.getByPlaceholder(/team name/i)).toHaveCount(i + 1)
  }
  const nameInputs = page.getByPlaceholder(/team name/i)
  for (let i = 0; i < 6; i++) {
    await nameInputs.nth(i).fill(`Team ${i}`)
  }
  // Wait for the save request to actually complete before moving on.
  // "Start Draft" independently re-saves the team roster (it calls the same
  // save logic internally), so if we clicked it before this PUT finished,
  // two concurrent PUT /teams requests would race against each other.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/teams') && res.request().method() === 'PUT'
    ),
    page.getByRole('button', { name: /^save teams$/i }).click(),
  ])

  // The viewer link is only shown on the pre-draft setup view (it disappears
  // once the league goes live and the page switches to the LiveDraftView), so
  // it must be captured before clicking "Start Draft".
  const viewerLinkText = await page.getByText(/\/watch\//).innerText()
  const viewerPath = viewerLinkText.match(/\/watch\/\S+/)?.[0]
  expect(viewerPath).toBeTruthy()

  const viewerPage = await context.newPage()
  await viewerPage.goto(viewerPath!)

  await page.getByRole('button', { name: /start draft/i }).click()

  const revealButton = page.getByRole('button', { name: /reveal next pick/i })
  await expect(revealButton).toBeVisible()

  for (let i = 0; i < 6; i++) {
    await revealButton.click()
    // Wait for the commissioner's own view to reflect the reveal before
    // clicking again, so we don't fire concurrent reveal requests against
    // the optimistic-concurrency check on the API.
    await expect(page.locator('text=/^Slot \\d+/')).toHaveCount(i + 1)
  }

  // Playwright's toHaveCount polls/retries automatically, which absorbs the
  // realtime broadcast latency to the viewer's page without an arbitrary sleep.
  await expect(viewerPage.getByText(/^Slot 1 —/i)).toBeVisible()
  await expect(viewerPage.locator('text=/^Slot \\d+/')).toHaveCount(6)

  const commissionerOrder = await page.locator('text=/^Slot \\d+/').allTextContents()
  const viewerOrder = await viewerPage.locator('text=/^Slot \\d+/').allTextContents()
  expect(viewerOrder).toEqual(commissionerOrder)
})
