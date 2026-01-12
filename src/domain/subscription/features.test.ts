import { describe, it, expect } from "vitest";
import {
	PLAN_FEATURES,
	PLAN_LIMITS,
	planHasFeature,
	getRequiredTierForFeature,
	comparePlanTiers,
	tierAtLeast,
} from "./features";
import type { Feature, PlanTier } from "./types";

describe("Subscription Features", () => {
	describe("PLAN_FEATURES", () => {
		it("should have empty features for 'none' tier", () => {
			expect(PLAN_FEATURES.none).toEqual([]);
		});

		it("should have business features", () => {
			expect(PLAN_FEATURES.business).toContain("data_capture");
			expect(PLAN_FEATURES.business).toContain("compliance_validation");
			expect(PLAN_FEATURES.business).toContain("report_generation");
			expect(PLAN_FEATURES.business).toContain("acknowledgment_tracking");
			expect(PLAN_FEATURES.business).toHaveLength(4);
		});

		it("should have pro features including business features", () => {
			expect(PLAN_FEATURES.pro).toContain("data_capture");
			expect(PLAN_FEATURES.pro).toContain("advanced_roles");
			expect(PLAN_FEATURES.pro).toContain("approval_flows");
			expect(PLAN_FEATURES.pro).toContain("priority_support");
			expect(PLAN_FEATURES.pro).toHaveLength(8);
		});

		it("should have enterprise features including all features", () => {
			expect(PLAN_FEATURES.enterprise).toContain("sso");
			expect(PLAN_FEATURES.enterprise).toContain("custom_branding");
			expect(PLAN_FEATURES.enterprise).toContain("api_access");
			expect(PLAN_FEATURES.enterprise).toContain("dedicated_support");
			expect(PLAN_FEATURES.enterprise).toHaveLength(14);
		});
	});

	describe("PLAN_LIMITS", () => {
		it("should have zero limits for 'none' tier", () => {
			expect(PLAN_LIMITS.none).toEqual({
				notices: 0,
				users: 0,
				transactions: 0,
				alerts: 0,
			});
		});

		it("should have correct business limits", () => {
			expect(PLAN_LIMITS.business.notices).toBe(50);
			expect(PLAN_LIMITS.business.users).toBe(5);
			expect(PLAN_LIMITS.business.transactions).toBeNull();
			expect(PLAN_LIMITS.business.alerts).toBeNull();
		});

		it("should have correct pro limits", () => {
			expect(PLAN_LIMITS.pro.notices).toBe(150);
			expect(PLAN_LIMITS.pro.users).toBe(10);
			expect(PLAN_LIMITS.pro.transactions).toBeNull();
			expect(PLAN_LIMITS.pro.alerts).toBeNull();
		});

		it("should have null (unlimited) limits for enterprise", () => {
			expect(PLAN_LIMITS.enterprise.notices).toBeNull();
			expect(PLAN_LIMITS.enterprise.users).toBeNull();
			expect(PLAN_LIMITS.enterprise.transactions).toBeNull();
			expect(PLAN_LIMITS.enterprise.alerts).toBeNull();
		});
	});

	describe("planHasFeature", () => {
		it("should return false for 'none' tier with any feature", () => {
			expect(planHasFeature("none", "data_capture")).toBe(false);
			expect(planHasFeature("none", "sso")).toBe(false);
		});

		it("should return true for business tier with basic features", () => {
			expect(planHasFeature("business", "data_capture")).toBe(true);
			expect(planHasFeature("business", "compliance_validation")).toBe(true);
		});

		it("should return false for business tier with pro features", () => {
			expect(planHasFeature("business", "advanced_roles")).toBe(false);
			expect(planHasFeature("business", "sso")).toBe(false);
		});

		it("should return true for pro tier with pro features", () => {
			expect(planHasFeature("pro", "advanced_roles")).toBe(true);
			expect(planHasFeature("pro", "priority_support")).toBe(true);
		});

		it("should return false for pro tier with enterprise features", () => {
			expect(planHasFeature("pro", "sso")).toBe(false);
			expect(planHasFeature("pro", "custom_branding")).toBe(false);
		});

		it("should return true for enterprise tier with all features", () => {
			expect(planHasFeature("enterprise", "data_capture")).toBe(true);
			expect(planHasFeature("enterprise", "sso")).toBe(true);
			expect(planHasFeature("enterprise", "custom_integrations")).toBe(true);
		});
	});

	describe("getRequiredTierForFeature", () => {
		it("should return business for basic features", () => {
			expect(getRequiredTierForFeature("data_capture")).toBe("business");
			expect(getRequiredTierForFeature("compliance_validation")).toBe(
				"business",
			);
		});

		it("should return business for features available in all tiers", () => {
			expect(getRequiredTierForFeature("report_generation")).toBe("business");
		});

		it("should return pro for pro-only features", () => {
			expect(getRequiredTierForFeature("advanced_roles")).toBe("pro");
			expect(getRequiredTierForFeature("approval_flows")).toBe("pro");
		});

		it("should return enterprise for enterprise-only features", () => {
			expect(getRequiredTierForFeature("sso")).toBe("enterprise");
			expect(getRequiredTierForFeature("custom_branding")).toBe("enterprise");
			expect(getRequiredTierForFeature("api_access")).toBe("enterprise");
		});

		it("should return null for invalid feature", () => {
			expect(
				getRequiredTierForFeature("invalid_feature" as Feature),
			).toBeNull();
		});
	});

	describe("comparePlanTiers", () => {
		it("should return 0 for same tiers", () => {
			expect(comparePlanTiers("none", "none")).toBe(0);
			expect(comparePlanTiers("business", "business")).toBe(0);
			expect(comparePlanTiers("enterprise", "enterprise")).toBe(0);
		});

		it("should return positive when first tier is higher", () => {
			expect(comparePlanTiers("business", "none")).toBeGreaterThan(0);
			expect(comparePlanTiers("pro", "business")).toBeGreaterThan(0);
			expect(comparePlanTiers("enterprise", "pro")).toBeGreaterThan(0);
		});

		it("should return negative when first tier is lower", () => {
			expect(comparePlanTiers("none", "business")).toBeLessThan(0);
			expect(comparePlanTiers("business", "pro")).toBeLessThan(0);
			expect(comparePlanTiers("pro", "enterprise")).toBeLessThan(0);
		});

		it("should correctly order all tiers", () => {
			const tiers: PlanTier[] = ["none", "business", "pro", "enterprise"];
			for (let i = 0; i < tiers.length; i++) {
				for (let j = 0; j < tiers.length; j++) {
					if (i < j) {
						expect(comparePlanTiers(tiers[i], tiers[j])).toBeLessThan(0);
					} else if (i > j) {
						expect(comparePlanTiers(tiers[i], tiers[j])).toBeGreaterThan(0);
					} else {
						expect(comparePlanTiers(tiers[i], tiers[j])).toBe(0);
					}
				}
			}
		});
	});

	describe("tierAtLeast", () => {
		it("should return true when current tier equals required", () => {
			expect(tierAtLeast("none", "none")).toBe(true);
			expect(tierAtLeast("business", "business")).toBe(true);
			expect(tierAtLeast("enterprise", "enterprise")).toBe(true);
		});

		it("should return true when current tier is higher than required", () => {
			expect(tierAtLeast("business", "none")).toBe(true);
			expect(tierAtLeast("pro", "business")).toBe(true);
			expect(tierAtLeast("enterprise", "none")).toBe(true);
			expect(tierAtLeast("enterprise", "business")).toBe(true);
			expect(tierAtLeast("enterprise", "pro")).toBe(true);
		});

		it("should return false when current tier is lower than required", () => {
			expect(tierAtLeast("none", "business")).toBe(false);
			expect(tierAtLeast("business", "pro")).toBe(false);
			expect(tierAtLeast("pro", "enterprise")).toBe(false);
			expect(tierAtLeast("none", "enterprise")).toBe(false);
		});
	});
});
