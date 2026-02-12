# Tunivo AI

This is the README file for Tunivo AI.

## Workflow Pause/Resume Feature

Tunivo AI now supports durable pause-and-resume (human-in-the-loop) functionality for workflow execution.

### Overview

The pause/resume feature allows workflows to pause execution when they encounter nodes that require human intervention (e.g., approval, input, review). The workflow instance persists its state to the database, and execution can be resumed later with user-provided input.

### Key Features

- **Durable Pausing**: Workflow state is persisted to the database when paused
- **Secure Resume Tokens**: Uses `crypto.scrypt` to hash resume tokens with random salts
- **Context Merging**: User input is merged into the workflow context on resume
- **Idempotency**: Prevents duplicate resume operations
- **Audit Trail**: All pause/resume actions are logged in `execution_logs`

### Architecture

1. **Database Schema**: 
   - `workflows`: Stores workflow definitions (nodes, transitions)
   - `workflow_instances`: Tracks execution state, status, context, and pause metadata
   - `execution_logs`: Audit trail of all workflow actions
   - `execution_status` enum: PENDING, RUNNING, COMPLETED, FAILED, WAITING_FOR_INPUT

2. **Inngest Functions**:
   - `workflow-executor`: Executes workflows, pauses at human nodes
   - `workflow-resume`: Resumes paused workflows from their last node

3. **API Endpoints**:
   - `POST /api/v1/workflows/:workflowId/instances` - Create and start a workflow instance
   - `GET /api/v1/instances/:id` - Get instance status
   - `POST /api/v1/instances/:id/resume` - Resume a paused instance
   - `GET /api/v1/instances/:id/logs` - Get execution logs

### Usage Example

#### 1. Create a workflow with a human node

```typescript
const workflow = {
  id: "approval-workflow",
  name: "Approval Workflow",
  definition: {
    nodes: {
      start: {
        id: "start",
        type: "start",
        next: "human_approval"
      },
      human_approval: {
        id: "human_approval",
        type: "human_approval",
        data: {
          prompt: "Please review and approve this request"
        },
        next: "complete"
      },
      complete: {
        id: "complete",
        type: "complete"
      }
    },
    startNode: "start"
  }
};
```

#### 2. Start a workflow instance

```bash
curl -X POST http://localhost:5000/api/v1/workflows/approval-workflow/instances \
  -H "Content-Type: application/json" \
  -d '{"context": {"userId": "user123", "requestId": "req456"}}'
```

Response:
```json
{
  "instanceId": "inst-abc123",
  "status": "PENDING"
}
```

The workflow will execute until it reaches the `human_approval` node, then pause with status `WAITING_FOR_INPUT`.

#### 3. Check instance status

```bash
curl http://localhost:5000/api/v1/instances/inst-abc123
```

Response:
```json
{
  "id": "inst-abc123",
  "workflowId": "approval-workflow",
  "status": "WAITING_FOR_INPUT",
  "currentNodeId": "human_approval",
  "pauseMeta": {
    "prompt": "Please review and approve this request"
  },
  "context": {
    "userId": "user123",
    "requestId": "req456"
  }
}
```

#### 4. Resume the workflow with input

```bash
curl -X POST http://localhost:5000/api/v1/instances/inst-abc123/resume \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "the-resume-token-from-logs",
    "input": {
      "approved": true,
      "comment": "Looks good!"
    },
    "userId": "approver789"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Workflow resumed",
  "instanceId": "inst-abc123"
}
```

The workflow will continue executing from the `human_approval` node with the merged context.

### Security Considerations

1. **Resume Token Hashing**: Resume tokens are hashed using `crypto.scrypt` with random salts before storage. The plain token is never persisted.

2. **Token Verification**: When resuming, the provided token is hashed with the stored salt and compared to the stored hash.

3. **Authentication**: In production, add authentication middleware to verify user identity before allowing resume operations.

4. **Authorization**: Check user roles/permissions to ensure they're authorized to resume the specific workflow instance.

5. **Token Expiration**: Consider implementing TTL (time-to-live) for resume tokens by storing a `pausedAt` timestamp and rejecting old tokens.

6. **Rate Limiting**: Implement rate limiting on resume endpoints to prevent abuse.

### Migration

To apply the database schema changes, run:

```bash
npm run db:push
```

Or manually execute the migration SQL:

```bash
psql $DATABASE_URL < migrations/0001_workflow_execution.sql
```

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (required)
- `INNGEST_EVENT_KEY`: Inngest event key for production (optional for development)
- `INNGEST_SIGNING_KEY`: Inngest signing key for webhook verification (optional)

### Development

The Inngest Dev Server can be used for local development:

```bash
npx inngest-cli dev
```

This provides a UI for inspecting workflow executions and triggering events manually.


Last updated: 2026-02-12

