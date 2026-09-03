import { readFile } from "node:fs/promises"
import path from "node:path"
import { tool } from "@opencode-ai/plugin"

import { isInstalledProject } from "../codegen/lib/cli.mjs"
import { ROLES, selectModel } from "../codegen/lib/model-selection.mjs"

export default tool({
  description:
    "Select a configuration certified for one role and work class, preferring OpenCode Go and using Zen-only capacity when Go is insufficient. This does not check live provider availability.",
  args: {
    role: tool.schema.string().describe(`Role requesting the model: ${ROLES.join(", ")}`),
    workClass: tool.schema.string().describe("Work class declared in config/model-pools.json"),
    risk: tool.schema.string().optional().describe("low, medium, or high; defaults to low"),
    minimumStatus: tool.schema
      .string()
      .optional()
      .describe("Admission level; production always uses qualified. Lower levels exist only for certification inside the harness repository."),
    requiredContext: tool.schema
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Minimum context tokens required by the work"),
    requiresTools: tool.schema.boolean().optional().describe("Require tool calling; defaults to true"),
    requiresCodeEditing: tool.schema
      .boolean()
      .optional()
      .describe("Require demonstrated code-editing capability"),
    excludeFamily: tool.schema
      .string()
      .optional()
      .describe("Exclude a model family to preserve independent review"),
  },
  async execute(args, context) {
    const minimumStatus = args.minimumStatus ?? "qualified"
    if (minimumStatus !== "qualified" && (await isInstalledProject(context.directory))) {
      throw new Error(
        "MAINTENANCE_ONLY: this project runs only qualified configurations; lower admission levels belong to the harness repository",
      )
    }
    const registryPath = path.join(
      context.directory,
      ".opencode",
      "codegen",
      "config",
      "model-pools.json",
    )
    const registry = JSON.parse(await readFile(registryPath, "utf8"))
    return JSON.stringify(selectModel(registry, { ...args, minimumStatus }), null, 2)
  },
})
