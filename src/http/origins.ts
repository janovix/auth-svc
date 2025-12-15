function normalizePort(scheme: string, port: string) {
	if (port) return port;
	if (scheme === "http") return "80";
	if (scheme === "https") return "443";
	return "";
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostMatchesPattern(host: string, patternHost: string) {
	if (patternHost === host) return true;

	// Common wildcard form: https://*.example.com
	if (patternHost.startsWith("*.")) {
		const base = patternHost.slice(2);
		return host.endsWith(`.${base}`) && host !== base;
	}

	if (!patternHost.includes("*")) return false;

	const re = new RegExp(
		`^${patternHost.split("*").map(escapeRegExp).join(".*")}$`,
		"i",
	);
	return re.test(host);
}

function parseOriginLike(input: string) {
	const trimmed = input.trim();
	if (!trimmed.includes("://")) return null;

	const parts = trimmed.split("://", 2);
	if (parts.length !== 2) return null;

	const scheme = (parts[0] ?? "").toLowerCase();
	const rest = (parts[1] ?? "").split("/", 1)[0];
	if (!rest) return null;

	// Note: we intentionally keep wildcard tokens in host/port.
	const lastColonIdx = rest.lastIndexOf(":");
	if (lastColonIdx > -1 && rest.includes("]") === false) {
		const host = rest.slice(0, lastColonIdx).toLowerCase();
		const port = rest.slice(lastColonIdx + 1);
		return { scheme, host, port };
	}

	return { scheme, host: rest.toLowerCase(), port: "" };
}

export function originMatchesPattern(origin: string, pattern: string) {
	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		return false;
	}

	const parsedPattern = parseOriginLike(pattern);
	if (!parsedPattern) return false;

	const scheme = url.protocol.replace(":", "").toLowerCase();
	if (scheme !== parsedPattern.scheme) return false;

	const originHost = url.hostname.toLowerCase();
	if (!hostMatchesPattern(originHost, parsedPattern.host)) return false;

	const originPort = normalizePort(scheme, url.port);
	const patternPort = parsedPattern.port;

	if (!patternPort) {
		// If no port is specified, treat it as the default for the scheme.
		return originPort === normalizePort(parsedPattern.scheme, "");
	}

	if (patternPort === "*") return true;

	return originPort === patternPort;
}

export function originMatchesAnyPattern(
	origin: string,
	patterns: readonly string[],
) {
	for (const pattern of patterns) {
		if (originMatchesPattern(origin, pattern)) return true;
	}
	return false;
}
