import type { z } from "zod";
import type { AIOperation } from "@skyarc/shared";

export interface AICompleteInput<T extends z.ZodTypeAny> {
  operation: AIOperation;
  schema: T;
  input: unknown;
}

export interface AICompleteResult<T> {
  data: T;
  confidence: number;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface AIProvider {
  completeStructured<T extends z.ZodTypeAny>(
    params: AICompleteInput<T>
  ): Promise<AICompleteResult<z.infer<T>>>;
}
