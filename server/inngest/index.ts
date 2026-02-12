import { inngest } from "./client";
import { workflowExecutor } from "./workflowExecutor";
import { resumeExecutor } from "./resumeExecutor";

// Export all functions
export const functions = [workflowExecutor, resumeExecutor];

// Export client
export { inngest };
