import { describe, expect, it } from "vitest";

import { isE2eTestEmail } from "./e2e-test-email";

describe("isE2eTestEmail", () => {
	it("returns true for @e2e.janovix.com addresses", () => {
		expect(isE2eTestEmail("user@e2e.janovix.com")).toBe(true);
		expect(isE2eTestEmail("  smoke@e2e.janovix.com  ")).toBe(true);
	});

	it("returns false for other addresses", () => {
		expect(isE2eTestEmail("user@janovix.com")).toBe(false);
		expect(isE2eTestEmail(undefined)).toBe(false);
		expect(isE2eTestEmail("")).toBe(false);
	});
});
