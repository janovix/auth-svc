/**
 * Upload routes for avatar and file uploads using R2 storage
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Bindings } from "../types/bindings";
import { getBetterAuthContext } from "../auth/instance";
import { z } from "zod";

type UploadBindings = {
	Bindings: Bindings;
};

type UploadContext = Context<UploadBindings>;

const uploadRoutes = new Hono<UploadBindings>();

// Allowed MIME types for avatar uploads
const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Helper to get authenticated user from session
 */
async function getAuthenticatedUser(
	c: UploadContext,
): Promise<{ id: string } | null> {
	try {
		const { auth } = getBetterAuthContext(c.env);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session?.user) {
			return null;
		}
		return {
			id: session.user.id,
		};
	} catch {
		return null;
	}
}

/**
 * Get environment prefix for avatar storage
 * This ensures different environments don't collide when using a single bucket
 */
function getEnvironmentPrefix(env: Bindings): string {
	const environment = String(env.ENVIRONMENT || "dev");
	// Map environment names to short prefixes
	switch (environment) {
		case "production":
			return "prod";
		case "preview":
			return "preview";
		case "local":
			return "local";
		case "test":
			return "test";
		default:
			return "dev";
	}
}

/**
 * Get the public URL for an avatar
 */
function getAvatarPublicUrl(env: Bindings, key: string): string {
	// Use configured public URL (always avatar.janovix.com)
	if (env.AVATARS_PUBLIC_URL) {
		return `${env.AVATARS_PUBLIC_URL}/${key}`;
	}
	// Fallback to avatar.janovix.com
	return `https://avatar.janovix.com/${key}`;
}

/**
 * Generate a unique key for avatar storage
 * Format: {env}/avatars/{userId}/{timestamp}-{random}.{ext}
 *
 * Environment prefixes ensure no collisions between environments:
 * - prod/avatars/user123/1234567890-abc123.webp
 * - dev/avatars/user123/1234567890-abc123.webp
 * - local/avatars/user123/1234567890-abc123.webp
 */
function generateAvatarKey(
	env: Bindings,
	userId: string,
	mimeType: string,
): string {
	const envPrefix = getEnvironmentPrefix(env);
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	const ext = mimeType.split("/")[1] || "jpg";
	return `${envPrefix}/avatars/${userId}/${timestamp}-${random}.${ext}`;
}

/**
 * Schema for requesting a signed upload URL
 */
const signedUrlRequestSchema = z.object({
	contentType: z.enum(ALLOWED_MIME_TYPES, {
		errorMap: () => ({
			message: `Content type must be one of: ${ALLOWED_MIME_TYPES.join(", ")}`,
		}),
	}),
	contentLength: z
		.number()
		.int()
		.positive()
		.max(
			MAX_FILE_SIZE,
			`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
		),
});

/**
 * POST /api/upload/avatar/prepare
 * Prepare an avatar upload by generating the key and validating the request.
 * Returns the upload URL and the key to use for the upload.
 *
 * Note: For R2, we use a direct upload approach through our API since
 * R2 presigned URLs require S3 API credentials configuration.
 */
uploadRoutes.post("/avatar/prepare", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	// Check if R2 bucket is configured
	if (!c.env.AVATARS_BUCKET) {
		console.error("[Upload] AVATARS_BUCKET not configured");
		return c.json(
			{ success: false, error: "Avatar uploads not configured" },
			503,
		);
	}

	const body = await c.req.json();
	const parseResult = signedUrlRequestSchema.safeParse(body);

	if (!parseResult.success) {
		return c.json(
			{
				success: false,
				error: "Invalid input",
				details: parseResult.error.errors,
			},
			400,
		);
	}

	const { contentType, contentLength: _contentLength } = parseResult.data;

	// Generate a unique key for this upload (with environment prefix)
	const key = generateAvatarKey(c.env, user.id, contentType);

	// Return the upload endpoint and key
	// Client will POST the file to /api/upload/avatar with this key
	return c.json({
		success: true,
		data: {
			key,
			uploadUrl: `/api/upload/avatar`,
			publicUrl: getAvatarPublicUrl(c.env, key),
			maxSize: MAX_FILE_SIZE,
			allowedTypes: ALLOWED_MIME_TYPES,
			expiresIn: 300, // 5 minutes to complete upload
		},
	});
});

/**
 * POST /api/upload/avatar
 * Upload an avatar image directly.
 * Expects multipart/form-data with:
 * - file: The image file
 * - key: The pre-generated key from /avatar/prepare (optional, will generate if not provided)
 */
uploadRoutes.post("/avatar", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	// Check if R2 bucket is configured
	if (!c.env.AVATARS_BUCKET) {
		console.error("[Upload] AVATARS_BUCKET not configured");
		return c.json(
			{ success: false, error: "Avatar uploads not configured" },
			503,
		);
	}

	try {
		const formData = await c.req.formData();
		const file = formData.get("file");
		const providedKey = formData.get("key");

		if (!file || !(file instanceof File)) {
			return c.json({ success: false, error: "No file provided" }, 400);
		}

		// Validate file type
		if (
			!ALLOWED_MIME_TYPES.includes(
				file.type as (typeof ALLOWED_MIME_TYPES)[number],
			)
		) {
			return c.json(
				{
					success: false,
					error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
				},
				400,
			);
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return c.json(
				{
					success: false,
					error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
				},
				400,
			);
		}

		// Use provided key or generate a new one (with environment prefix)
		const envPrefix = getEnvironmentPrefix(c.env);
		const expectedKeyPrefix = `${envPrefix}/avatars/${user.id}/`;
		const key =
			typeof providedKey === "string" &&
			providedKey.startsWith(expectedKeyPrefix)
				? providedKey
				: generateAvatarKey(c.env, user.id, file.type);

		// Upload to R2
		const arrayBuffer = await file.arrayBuffer();
		await c.env.AVATARS_BUCKET.put(key, arrayBuffer, {
			httpMetadata: {
				contentType: file.type,
				cacheControl: "public, max-age=31536000", // Cache for 1 year
			},
			customMetadata: {
				userId: user.id,
				uploadedAt: new Date().toISOString(),
			},
		});

		const publicUrl = getAvatarPublicUrl(c.env, key);

		console.log(`[Upload] Avatar uploaded for user ${user.id}: ${key}`);

		return c.json({
			success: true,
			data: {
				key,
				url: publicUrl,
				size: file.size,
				contentType: file.type,
			},
		});
	} catch (error) {
		console.error("[Upload] Error uploading avatar:", error);
		return c.json({ success: false, error: "Failed to upload avatar" }, 500);
	}
});

/**
 * DELETE /api/upload/avatar/:key
 * Delete an avatar image (only the owner can delete their avatars)
 */
uploadRoutes.delete("/avatar/*", async (c) => {
	const user = await getAuthenticatedUser(c);
	if (!user) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	// Check if R2 bucket is configured
	if (!c.env.AVATARS_BUCKET) {
		console.error("[Upload] AVATARS_BUCKET not configured");
		return c.json(
			{ success: false, error: "Avatar uploads not configured" },
			503,
		);
	}

	// Extract the key from the path (everything after /avatar/)
	const path = c.req.path;
	const keyMatch = path.match(/\/api\/upload\/avatar\/(.+)/);
	if (!keyMatch) {
		return c.json({ success: false, error: "Invalid key" }, 400);
	}

	const key = keyMatch[1];

	// Verify the key belongs to this user and environment
	const envPrefix = getEnvironmentPrefix(c.env);
	const expectedKeyPrefix = `${envPrefix}/avatars/${user.id}/`;
	if (!key.startsWith(expectedKeyPrefix)) {
		return c.json(
			{
				success: false,
				error: "Forbidden: Cannot delete other users' avatars",
			},
			403,
		);
	}

	try {
		await c.env.AVATARS_BUCKET.delete(key);

		console.log(`[Upload] Avatar deleted for user ${user.id}: ${key}`);

		return c.json({
			success: true,
			data: { key },
		});
	} catch (error) {
		console.error("[Upload] Error deleting avatar:", error);
		return c.json({ success: false, error: "Failed to delete avatar" }, 500);
	}
});

export { uploadRoutes };
