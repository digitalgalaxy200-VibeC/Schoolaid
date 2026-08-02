// ============================================================
// Plan Generation Prompt — used when the AI needs to create
// an execution plan from a user request
// ============================================================

export const PLAN_GENERATION_PROMPT = `
You are generating an execution plan for a SchoolAid administrative operation.

Based on the conversation above, create a step-by-step execution plan using ONLY the available capabilities.

## Rules for plan generation:

1. Each step MUST use an exact capability name from the registry.
2. Each step MUST include all required parameters.
3. Steps should be ordered logically (dependencies first).
4. Use the "dependsOn" field (array of step order numbers) when one step needs the output of another.
5. Group independent steps together so they can run in parallel.
6. Include a realistic estimatedOperations count.
7. Include warnings if:
   - The operation is irreversible (e.g., deleting data)
   - Large numbers of records will be created
   - The operation may take a long time
   - Data conflicts may occur

## Output format (JSON only, no markdown):

{
  "summary": "Brief description of what will be done",
  "estimatedOperations": 25,
  "warnings": ["Warning message if applicable"],
  "steps": [
    {
      "order": 1,
      "capability": "create_class",
      "description": "Create Basic 1 class",
      "params": { "name": "Basic 1", "grade_level": 1 },
      "dependsOn": []
    },
    {
      "order": 2,
      "capability": "create_class",
      "description": "Create Basic 2 class",
      "params": { "name": "Basic 2", "grade_level": 2 },
      "dependsOn": []
    }
  ]
}`;
