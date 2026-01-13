/**
 * OpenAPI documentation endpoints for Upload API
 */
import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

// Allowed MIME types schema
const MimeTypeEnum = z.enum([
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
]);

const ErrorResponseSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	details: z.array(z.unknown()).optional(),
});

const PrepareUploadResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		key: z.string().describe("Unique key for the upload"),
		uploadUrl: z.string().describe("URL to POST the file to"),
		publicUrl: z.string().url().describe("Public URL after upload completes"),
		maxSize: z.number().describe("Maximum file size in bytes"),
		allowedTypes: z.array(z.string()).describe("Allowed MIME types"),
		expiresIn: z.number().describe("Seconds until the upload URL expires"),
	}),
});

const UploadResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		key: z.string().describe("Storage key for the uploaded file"),
		url: z.string().url().describe("Public URL of the uploaded file"),
		size: z.number().describe("File size in bytes"),
		contentType: z.string().describe("MIME type of the uploaded file"),
	}),
});

/**
 * POST /api/upload/avatar/prepare - Prepare an avatar upload
 */
export class PrepareAvatarUploadEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Upload"],
		summary: "Prepare an avatar upload",
		description:
			"Validates upload parameters and returns the upload URL and key. " +
			"Use this before uploading to ensure the file meets requirements.",
		operationId: "upload-prepare-avatar",
		request: {
			body: contentJson(
				z.object({
					contentType: MimeTypeEnum.describe("MIME type of the file to upload"),
					contentLength: z
						.number()
						.int()
						.positive()
						.max(5 * 1024 * 1024)
						.describe("File size in bytes (max 5MB)"),
				}),
			),
		},
		responses: {
			"200": {
				description: "Upload prepared successfully",
				...contentJson(PrepareUploadResponseSchema),
			},
			"400": {
				description: "Invalid input",
				...contentJson(ErrorResponseSchema),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"503": {
				description: "Service unavailable - uploads not configured",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by upload routes");
	}
}

/**
 * POST /api/upload/avatar - Upload an avatar image
 *
 * Note: This endpoint accepts multipart/form-data which is not fully supported
 * by chanfana's OpenAPI generation. The actual implementation handles:
 * - 'file' (required): The image file
 * - 'key' (optional): Pre-generated key from /prepare endpoint
 */
export class UploadAvatarEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Upload"],
		summary: "Upload an avatar image",
		description:
			"Upload an avatar image as multipart/form-data. " +
			"The file field contains the image, and optionally include the key from /prepare.",
		operationId: "upload-avatar",
		// Note: multipart/form-data request body is documented in description
		// since chanfana doesn't fully support it
		responses: {
			"200": {
				description: "Avatar uploaded successfully",
				...contentJson(UploadResponseSchema),
			},
			"400": {
				description: "Invalid input - missing file or invalid file type/size",
				...contentJson(ErrorResponseSchema),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"500": {
				description: "Upload failed",
				...contentJson(ErrorResponseSchema),
			},
			"503": {
				description: "Service unavailable - uploads not configured",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by upload routes");
	}
}

/**
 * DELETE /api/upload/avatar/:key - Delete an avatar image
 */
export class DeleteAvatarEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Upload"],
		summary: "Delete an avatar image",
		description:
			"Delete an avatar image. Users can only delete their own avatars.",
		operationId: "upload-delete-avatar",
		request: {
			params: z.object({
				key: z.string().describe("The full storage key of the avatar to delete"),
			}),
		},
		responses: {
			"200": {
				description: "Avatar deleted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						data: z.object({
							key: z.string(),
						}),
					}),
				),
			},
			"400": {
				description: "Invalid key",
				...contentJson(ErrorResponseSchema),
			},
			"401": {
				description: "Unauthorized",
				...contentJson(ErrorResponseSchema),
			},
			"403": {
				description: "Forbidden - Cannot delete other users' avatars",
				...contentJson(ErrorResponseSchema),
			},
			"500": {
				description: "Delete failed",
				...contentJson(ErrorResponseSchema),
			},
			"503": {
				description: "Service unavailable - uploads not configured",
				...contentJson(ErrorResponseSchema),
			},
		},
	};

	public async handle(_c: AppContext) {
		throw new Error("This endpoint is handled by upload routes");
	}
}
