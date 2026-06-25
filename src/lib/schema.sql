-- Opzava Phase 2 Database Schema
-- Created: 2026-02-02 for Ralph Wiggum Loop pattern

-- Tasks Table - Core Kanban task management
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'inbox', -- inbox, assigned, in_progress, review, quality_review, done
    priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    assigned_to TEXT, -- agent session key
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    due_date INTEGER, -- Unix timestamp
    estimated_hours INTEGER,
    actual_hours INTEGER,
    tags TEXT, -- JSON array of tags
    metadata TEXT -- JSON for additional data
);

-- Agents Table - Squad management
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL, -- e.g., "researcher", "developer", "analyst"
    session_key TEXT UNIQUE, -- ClawdBot session identifier
    soul_content TEXT, -- SOUL.md content for this agent
    status TEXT NOT NULL DEFAULT 'offline', -- offline, idle, busy, error
    last_seen INTEGER, -- Unix timestamp
    last_activity TEXT, -- Description of last activity
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    config TEXT -- JSON for agent-specific configuration
);

-- Comments Table - Task discussion threads
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    author TEXT NOT NULL, -- agent name or "system"
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    parent_id INTEGER, -- For nested comments/replies
    mentions TEXT, -- JSON array of @mentioned agents
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL
);

-- Activities Table - Real-time activity stream
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- task_created, task_updated, comment_added, agent_status_change, etc.
    entity_type TEXT NOT NULL, -- task, agent, comment
    entity_id INTEGER NOT NULL,
    actor TEXT NOT NULL, -- who performed the action
    description TEXT NOT NULL, -- human-readable description
    data TEXT, -- JSON with additional context
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Notifications Table - @mentions and alerts
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL, -- agent name
    type TEXT NOT NULL, -- mention, assignment, status_change, due_date
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source_type TEXT, -- task, comment, agent
    source_id INTEGER,
    read_at INTEGER, -- Unix timestamp when marked as read
    delivered_at INTEGER, -- Unix timestamp when delivered to agent
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Task Subscriptions - who follows which tasks
CREATE TABLE IF NOT EXISTS task_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(task_id, agent_name),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Standup reports archive
CREATE TABLE IF NOT EXISTS standup_reports (
    date TEXT PRIMARY KEY, -- YYYY-MM-DD
    report TEXT NOT NULL, -- JSON
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Quality reviews (Aegis gate)
CREATE TABLE IF NOT EXISTS quality_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    reviewer TEXT NOT NULL, -- e.g., "aegis"
    status TEXT NOT NULL, -- approved | rejected
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);


-- Gateway health logs (captured each time MC probes a gateway)
CREATE TABLE IF NOT EXISTS gateway_health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gateway_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    latency INTEGER,
    probed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    error TEXT
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_agents_session_key ON agents(session_key);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_task_subscriptions_task_id ON task_subscriptions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_subscriptions_agent_name ON task_subscriptions(agent_name);
CREATE INDEX IF NOT EXISTS idx_standup_reports_created_at ON standup_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_quality_reviews_task_id ON quality_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_reviews_reviewer ON quality_reviews(reviewer);
CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_gateway_id ON gateway_health_logs(gateway_id);
CREATE INDEX IF NOT EXISTS idx_gateway_health_logs_probed_at ON gateway_health_logs(probed_at);

-- Migration 059 (orchestration-fleet-schema):
-- tasks.account_profile is added by ALTER TABLE in the migration runner.
-- The two tables below are created by the same migration.

-- Orchestration: decomposed Card → WorkflowGraph linkage
CREATE TABLE IF NOT EXISTS opzava_card_workflow_graph (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,       -- references tasks.id by value (no FK)
    workspace_id INTEGER NOT NULL,
    graph_json TEXT NOT NULL,       -- serialised WorkflowGraph
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_opzava_card_workflow_graph_task_id ON opzava_card_workflow_graph(task_id);
-- At most ONE active decomposition per Card (idempotency invariant).
CREATE UNIQUE INDEX IF NOT EXISTS idx_opzava_card_workflow_graph_active_task
    ON opzava_card_workflow_graph(task_id)
    WHERE status = 'active';

-- Orchestration: append-only audit log for dispatch/deny/retry/escalate decisions
CREATE TABLE IF NOT EXISTS opzava_orchestration_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    action_kind TEXT NOT NULL,   -- e.g. dispatch | deny | retry | escalate
    card_id INTEGER,
    graph_id TEXT,
    step_id TEXT,
    verdict TEXT NOT NULL,
    denials_json TEXT,           -- JSON array of denial reasons
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opzava_orchestration_audit_workspace_created_at
    ON opzava_orchestration_audit(workspace_id, created_at);

-- Sample data intentionally omitted - seed in dev scripts if needed.
