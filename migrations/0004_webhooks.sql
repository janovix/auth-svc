-- Webhook endpoint registration and delivery tracking tables.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  description TEXT,
  events TEXT NOT NULL,        -- JSON array: ["client.created", "alert.created"]
  active INTEGER NOT NULL DEFAULT 1,
  created_by_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(organization_id);
CREATE INDEX idx_webhook_endpoints_org_env ON webhook_endpoints(organization_id, environment);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, delivered, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_response_status INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id)
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_org ON webhook_deliveries(organization_id);
CREATE INDEX idx_webhook_deliveries_org_env ON webhook_deliveries(organization_id, environment);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at);
