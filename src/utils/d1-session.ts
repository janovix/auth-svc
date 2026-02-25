/**
 * D1 Sessions API bridge for Prisma compatibility.
 *
 * D1 read replication requires Worker code to call `db.withSession()` to route
 * reads to nearby replicas. Prisma's D1 adapter calls `env.DB.prepare()` directly,
 * bypassing the Sessions API entirely.
 *
 * This proxy intercepts all `prepare`, `batch`, and `exec` calls made by Prisma
 * and routes them through a `"first-unconstrained"` D1 session, which sends reads
 * to the nearest available replica without strict read-after-write consistency.
 *
 * Consistency trade-off: "first-unconstrained" means a read immediately after a
 * write MAY be served by a replica that hasn't caught up yet. For this workload
 * this is acceptable because:
 * - Sessions live in KV + cookie cache, not read back from D1 after creation.
 * - Passkey / member / user data written seconds or more before the next read.
 * - Rare race conditions result in a retry prompt, not data corruption.
 *
 * Prerequisites:
 * - D1 read replication must be enabled on the database (Dashboard → D1 → Settings).
 * - Requires @cloudflare/workers-types ≥ 4.x with D1Session types.
 *
 * @see https://developers.cloudflare.com/d1/best-practices/read-replication/
 */
export function withD1Session(db: D1Database): D1Database {
	// `withSession` is only available when D1 read replication is enabled.
	// If not available (disabled or unsupported runtime), return the DB unchanged
	// so the application continues to work without replication.
	if (typeof (db as { withSession?: unknown }).withSession !== "function") {
		return db;
	}

	// "first-unconstrained" routes reads to the nearest replica.
	// Use the non-generic overload that accepts the bookmark string literal.
	const session = (
		db as D1Database & {
			withSession: (mode: "first-unconstrained") => D1Database;
		}
	).withSession("first-unconstrained");

	return new Proxy(db, {
		get(target, prop: string | symbol) {
			if (prop === "prepare") return session.prepare.bind(session);
			if (prop === "batch") return session.batch.bind(session);
			if (prop === "exec") return session.exec.bind(session);
			// dump/withSession/toString and any future additions fall through
			return target[prop as keyof D1Database];
		},
	});
}
