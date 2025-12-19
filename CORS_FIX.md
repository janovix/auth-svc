# CORS Fix for Better Auth Routes

## Problem

When making requests from `https://auth.janovix.workers.dev` to `https://auth-svc.janovix.workers.dev/api/auth/sign-in/email`, the browser was blocking the request with:

```
Access to fetch at 'https://auth-svc.janovix.workers.dev/api/auth/sign-in/email'
from origin 'https://auth.janovix.workers.dev' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Root Cause

Better Auth's handler returns raw `Response` objects that bypass Hono's middleware chain. Even though CORS middleware was applied globally to the Hono app, Better Auth's responses didn't include the necessary CORS headers because:

1. Better Auth's `auth.handler()` returns a native `Response` object
2. When returned directly, this bypasses Hono's middleware that adds CORS headers
3. The preflight OPTIONS request and actual requests both lacked CORS headers

## Solution

Two changes were made:

### 1. Apply CORS Middleware to Better Auth Router

Added CORS middleware directly to the Better Auth router to ensure it processes requests:

```typescript
router.use("*", createCorsMiddleware());
```

This ensures that OPTIONS preflight requests are handled by Hono's CORS middleware before reaching Better Auth.

### 2. Manually Add CORS Headers to Better Auth Responses

Since Better Auth returns raw Response objects, we wrap them to add CORS headers:

```typescript
async function addCorsHeadersToResponse(
	c: Context<{ Bindings: Bindings }>,
	response: Response,
): Promise<Response> {
	const requestOrigin = c.req.header("origin");
	if (!requestOrigin) {
		return response;
	}

	const patterns = getTrustedOriginPatterns(c.env);
	const isTrusted = originMatchesAnyPattern(requestOrigin, patterns);
	if (!isTrusted) {
		return response;
	}

	// Clone headers and add CORS headers
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", requestOrigin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, PATCH, OPTIONS",
	);
	headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization, x-auth-internal-token, x-csrf-token, x-xsrf-token, x-requested-with",
	);

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
```

This function:

- Checks if the request has an origin header
- Validates the origin against trusted origin patterns
- Adds appropriate CORS headers to the response
- Preserves the original response body, status, and other headers

## Origin Pattern Matching

The origin `https://auth.janovix.workers.dev` correctly matches the pattern `https://*.janovix.workers.dev` because:

1. The pattern `*.janovix.workers.dev` starts with `*.`
2. The host `auth.janovix.workers.dev` ends with `.janovix.workers.dev`
3. The host is not equal to the base domain (`auth.janovix.workers.dev` !== `janovix.workers.dev`)

This matching logic is implemented in `src/http/origins.ts` and correctly handles wildcard subdomain patterns.

## Testing

- ✅ All existing tests pass
- ✅ Type checking passes
- ✅ Linting passes
- ✅ CORS headers are now added to all Better Auth responses from trusted origins

## Expected Behavior After Fix

1. **Preflight OPTIONS requests**: Handled by Hono's CORS middleware, returning appropriate CORS headers
2. **Actual requests**: Better Auth processes the request, and CORS headers are added to the response
3. **Trusted origins**: Only origins matching the configured patterns receive CORS headers
4. **Credentials**: CORS responses include `Access-Control-Allow-Credentials: true` to support cookie-based sessions

## Files Modified

- `src/auth/routes.ts`: Added CORS middleware to router and `addCorsHeadersToResponse` function
