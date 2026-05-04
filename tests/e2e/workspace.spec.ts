import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("a genuine source change reopens an older review and preserves its evidence lineage", async ({
  page,
}) => {
  await page.goto("/#changes");
  await page
    .getByRole("button", {
      name: "Load historical review example",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Reopen affected reviews", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Reopened 1 reviews");
  await page
    .getByRole("link", { name: "Review analytics", exact: true })
    .click();
  await expect(
    page.getByText("Review reopened", { exact: true }),
  ).toBeVisible();
  const events = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pharma-evidence:review:v1") ?? "[]"),
  );
  expect(events[0].sourceVersion).toBe("winrevair-v8");
  expect(events[0].sectionId).toBe("winrevair-v8:4-contraindications");
  expect(events[1].sourceVersion).toBe("winrevair-v13");
  expect(events[1].action).toBe("reopened");
});
test("opens actual evidence and records a review across reloads", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every claim.",
  );
  await expect(
    page.getByRole("heading", { name: "Eligibility qualifiers need review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open exact source" }),
  ).toHaveAttribute("href", /dailymed.*version=13/);
  await page
    .getByLabel("Reviewer note")
    .fill("Needs the adult and WHO Group 1 qualifiers.");
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reopen review", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review analytics" }).click();
  await expect(
    page.getByText("Needs the adult and WHO Group 1 qualifiers."),
  ).toBeVisible();
});
test("custom draft runs real rule checks, with unsupported text safely displayed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New review", exact: true }).click();
  await page
    .getByLabel("Draft content")
    .fill("The starting dose of WINREVAIR is 7 mg/kg.");
  await page.getByRole("button", { name: "Check draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dose differs from the source" }),
  ).toBeVisible();
  await expect(page.locator(".claim-card")).toHaveCount(1);
});
test("compares genuine historical sources and supports unchanged sections", async ({
  page,
}) => {
  await page.goto("/#changes");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "When evidence moves",
  );
  await expect(page.locator(".diff-text")).toContainText("hypersensitivity");
  await expect(
    page.getByRole("link", { name: "Previous source" }),
  ).toHaveAttribute("href", /version=8/);
  await page.getByLabel("Include unchanged").check();
  await expect(
    page.locator(".change-item").filter({ hasText: "unchanged" }).first(),
  ).toBeVisible();
});
test("exports a review CSV and serves the Excel workbook", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export review", exact: true })
    .click();
  expect((await event).suggestedFilename()).toContain("review.csv");
  const response = await request.get(
    "/downloads/PharmaEvidence-Source-Tracker.xlsx",
  );
  expect(response.status()).toBe(200);
  expect((await response.body()).length).toBeGreaterThan(10000);
});
test("live AI runs from same-origin assets and returns real neural scores", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180000);
  const outside: string[] = [];
  const weightRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/onnx/model_quantized.onnx"))
      weightRequests.push(r.url());
    if (!r.url().startsWith(baseURL!) && !r.url().startsWith("blob:"))
      outside.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run AI on this device" }).click();
  await expect
    .poll(
      async () => {
        const errors = page.locator(".draft-ai-status.error");
        const error = (await errors.count())
          ? await errors.textContent()
          : null;
        if (error) throw Error("Local inference failed: " + error);
        return await page
          .getByText("Ran on this device", { exact: true })
          .count();
      },
      { timeout: 160000 },
    )
    .toBe(1);
  await expect(
    page
      .locator(".neural-panel")
      .getByText(
        "Local AI review complete. Model scores are separate from rule checks.",
      ),
  ).toBeVisible({ timeout: 160000 });
  await expect(
    page.getByText("Ran on this device", { exact: true }),
  ).toBeVisible();
  expect(outside).toEqual([]);
  expect(weightRequests).toHaveLength(1);
});
for (const width of [320, 390, 768]) {
  test(`all views fit at ${width}px and mobile navigation works`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const view of [
      "review",
      "changes",
      "sources",
      "analytics",
      "method",
    ]) {
      await page.goto("/#" + view);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        view,
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Review workbench", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Every claim.",
    );
  });
}
for (const view of ["review", "changes", "sources", "analytics", "method"]) {
  test(`accessible ${view} view`, async ({ page }) => {
    await page.goto("/#" + view);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes
          .slice(0, 3)
          .map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
  });
}
