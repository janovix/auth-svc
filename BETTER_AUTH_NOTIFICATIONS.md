# Better-Auth Notification Integration

This guide explains how the auth-svc integrates with the notifications-svc for sending authentication-related emails.

## Overview

Instead of handling email sending directly, auth-svc uses the centralized notifications-svc via service binding. This provides:

- Centralized credential management (API keys in one place)
- Consistent email templates
- Delivery logging and tracking
- Retry handling

## Architecture

```
┌─────────────┐     Service Binding     ┌───────────────────┐
│  auth-svc   │ ─────────────────────► │ notifications-svc │
│             │                         │                   │
│ better-auth │                         │ Email Service     │
│             │                         │ (Mandrill/SendGrid)│
└─────────────┘                         └───────────────────┘
```

## Configuration

### 1. Wrangler Configuration

Add the service binding to `wrangler.jsonc`:

```jsonc
{
	"services": [
		{
			"binding": "NOTIFICATIONS_SERVICE",
			"service": "notifications-svc",
		},
	],
}
```

### 2. Type Definitions

Update `src/types/bindings.ts`:

```typescript
export interface Fetchers {
	NOTIFICATIONS_SERVICE?: Fetcher;
}

export type Bindings = Env &
	Fetchers & {
		// ... other bindings
	};
```

### 3. Notification Service Client

Use the `NotificationServiceClient` from `src/services/notification-service.ts`:

```typescript
import {
	NotificationServiceClient,
	createEmailSender,
} from "./services/notification-service.js";

const notificationService = new NotificationServiceClient(
	env.NOTIFICATIONS_SERVICE,
);

// Create better-auth compatible sender
const emailSender = createEmailSender(notificationService, "Janovix");
```

## Notification Types

### Email Verification

Sent when a new user registers:

```typescript
await notificationService.sendEmailVerification(email, verificationUrl, {
	userId,
	appName: "Janovix",
});
```

Template key: `email_verification`

### Password Reset

Sent when user requests password reset:

```typescript
await notificationService.sendPasswordReset(email, resetUrl, {
	userId,
	appName: "Janovix",
});
```

Template key: `password_reset`

### Magic Link

Sent for passwordless login:

```typescript
await notificationService.sendMagicLink(email, magicLinkUrl, {
	userId,
	appName: "Janovix",
});
```

Template key: `magic_link` (needs to be created)

### Security Notification

Sent for account security events:

```typescript
await notificationService.sendSecurityNotification(
	email,
	userId,
	"New login detected from unknown device",
	{
		appName: "Janovix",
		metadata: { ip, userAgent, location },
	},
);
```

Template key: `security` (needs to be created)

## Better-Auth Integration

### Using with better-auth Email Plugin

```typescript
import { betterAuth } from "better-auth";
import { createEmailSender } from "./services/notification-service.js";

const auth = betterAuth({
	// ... other config
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ user, url, token }) => {
			const notificationService = new NotificationServiceClient(
				ctx.env.NOTIFICATIONS_SERVICE,
			);
			await notificationService.sendPasswordReset(user.email, url, {
				userId: user.id,
				appName: "Janovix",
			});
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url, token }) => {
			const notificationService = new NotificationServiceClient(
				ctx.env.NOTIFICATIONS_SERVICE,
			);
			await notificationService.sendEmailVerification(user.email, url, {
				userId: user.id,
				appName: "Janovix",
			});
		},
	},
});
```

### Context-Based Usage

Access the notification service from Hono context:

```typescript
app.use("*", async (c, next) => {
	// Add notification service to context
	const notificationService = new NotificationServiceClient(
		c.env.NOTIFICATIONS_SERVICE,
	);
	c.set("notifications", notificationService);
	await next();
});

// Use in routes
app.post("/send-verification", async (c) => {
	const notifications = c.get("notifications");
	await notifications.sendEmailVerification(email, url);
});
```

## Email Templates

Templates are stored in notifications-svc database. Default templates:

| Key                  | Name               | Subject                              |
| -------------------- | ------------------ | ------------------------------------ |
| `email_verification` | Email Verification | Verifica tu Email - {{appName}}      |
| `password_reset`     | Password Reset     | Restablecer Contraseña - {{appName}} |

### Template Variables

| Variable        | Description            |
| --------------- | ---------------------- |
| `{{appName}}`   | Application name       |
| `{{actionUrl}}` | Main action URL        |
| `{{verifyUrl}}` | Email verification URL |
| `{{resetUrl}}`  | Password reset URL     |
| `{{expiresIn}}` | Link expiration time   |

## Error Handling

The notification service client handles errors gracefully:

```typescript
const result = await notificationService.sendEmailVerification(email, url);

if (!result.success) {
	console.error(`Failed to send email: ${result.error}`);
	// Continue with auth flow - don't block on email failure
}
```

## Testing

### Mock Notification Service

For testing without the service binding:

```typescript
const mockNotificationService = {
	isAvailable: () => false,
	sendEmailVerification: async () => ({
		success: false,
		error: "Service not available",
	}),
};
```

### Development Mode

In dev mode, notifications-svc logs emails instead of sending:

```
Email would be sent (dev mode): {
  to: "test@example.com",
  subject: "Verifica tu Email - Janovix"
}
```

## Troubleshooting

### Service Binding Not Working

1. Check wrangler.jsonc has the service binding
2. Verify notifications-svc is deployed
3. Check worker logs for connection errors

### Emails Not Sending

1. Check notifications-svc has email provider configured
2. Verify MANDRILL_API_KEY or SENDGRID_API_KEY is set
3. Check notification logs in notifications-svc database

### Template Not Found

1. Check template key matches exactly
2. Verify template exists in email_templates table
3. Run migrations on notifications-svc

## Related Documentation

- [notifications-svc/README.md](../notifications-svc/README.md)
- [notifications-svc/INTEGRATION.md](../notifications-svc/INTEGRATION.md)
