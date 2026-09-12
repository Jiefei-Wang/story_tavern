export interface ParsedOpenAIResponse {
  content: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Validates and extracts content and usage from an OpenAI-compatible completion response.
 * Fails fast on API errors, missing choices, or null content.
 */
export function parseOpenAIResponse(rawResponse: unknown): ParsedOpenAIResponse {
  if (typeof rawResponse !== "object" || rawResponse === null) {
    throw new Error("Invalid OpenAI response: body must be a non-null JSON object");
  }

  const res = rawResponse as Record<string, any>;

  // 1. Check for API error payload
  if (res.error) {
    const errMsg =
      typeof res.error === "string"
        ? res.error
        : res.error.message || JSON.stringify(res.error);
    throw new Error(`OpenAI API returned error: ${errMsg}`);
  }

  // 2. Check choices array
  if (!Array.isArray(res.choices) || res.choices.length === 0) {
    throw new Error("OpenAI API response contains empty choices array");
  }

  const firstChoice = res.choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new Error("OpenAI API response choices[0] is invalid");
  }

  const message = firstChoice.message;
  if (!message || typeof message !== "object") {
    throw new Error("OpenAI API response choices[0].message is missing or invalid");
  }

  if (typeof message.content !== "string") {
    throw new Error("OpenAI API response choices[0].message.content is missing or null");
  }

  const content = message.content;

  // 3. Extract usage if present, without fabricating 0-tokens when absent
  let tokenUsage: ParsedOpenAIResponse["tokenUsage"] = undefined;
  if (res.usage && typeof res.usage === "object") {
    tokenUsage = {
      prompt: typeof res.usage.prompt_tokens === "number" ? res.usage.prompt_tokens : 0,
      completion: typeof res.usage.completion_tokens === "number" ? res.usage.completion_tokens : 0,
      total: typeof res.usage.total_tokens === "number" ? res.usage.total_tokens : 0,
    };
  }

  return {
    content,
    tokenUsage,
  };
}
