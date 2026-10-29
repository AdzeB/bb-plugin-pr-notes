import { test as base } from "@playwright/test";
export { expect, type Page, type APIRequestContext } from "@playwright/test";

// Host install notifications are unrelated to the plugin and can cover its input.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "[data-sonner-toaster] { visibility: hidden !important; pointer-events: none !important; }";
        document.head.append(style);
      });
    });
    await use(page);
  },
});
