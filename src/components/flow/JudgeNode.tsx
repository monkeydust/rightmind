"use client";

/**
 * Judge node — re-exports AgentNode, which renders the dashed outer ring when
 * `data.isJudge` is true. Kept as a separate module so the ReactFlow node-type
 * registry can register a dedicated "judge" type if desired.
 */

export { AgentNode as JudgeNode } from "./AgentNode";
