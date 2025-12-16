// Polyfill for node:async_hooks in Cloudflare Workers
// Cloudflare Workers don't support async_hooks, so we provide empty stubs

export function createHook() {
	return {
		enable: () => {},
		disable: () => {},
	};
}

export function executionAsyncId() {
	return 0;
}

export function triggerAsyncId() {
	return 0;
}

export function executionAsyncResource() {
	return null;
}

export function asyncWrapProviders() {
	return {};
}

export const AsyncResource = class {
	constructor() {}
	runInAsyncScope() {}
	emitDestroy() {}
	asyncId() {
		return 0;
	}
	triggerAsyncId() {
		return 0;
	}
};

export default {
	createHook,
	executionAsyncId,
	triggerAsyncId,
	executionAsyncResource,
	asyncWrapProviders,
	AsyncResource,
};
