-- Migration: Add workflow execution tables for pause/resume functionality
-- Created: 2026-02-12

-- Create enum for execution status
CREATE TYPE execution_status AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'WAITING_FOR_INPUT'
);

-- Create workflows table
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create workflow_instances table
CREATE TABLE workflow_instances (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  status execution_status NOT NULL DEFAULT 'PENDING',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost TEXT NOT NULL DEFAULT '0.0',
  current_node_id TEXT,
  paused_by TEXT,
  resume_token_hash TEXT,
  pause_meta JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create execution_logs table
CREATE TABLE execution_logs (
  id SERIAL PRIMARY KEY,
  instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
  node_id TEXT,
  action TEXT NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  user_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_workflow_instances_workflow_id ON workflow_instances(workflow_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX idx_execution_logs_instance_id ON execution_logs(instance_id);
CREATE INDEX idx_execution_logs_created_at ON execution_logs(created_at);
