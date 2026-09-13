/** Incremental SSE decoder shared by browser fetch and native IPC streaming. */
export class OpenAIStream {
  private buffer = "";
  private data: string[] = [];
  private content = "";
  private usage: unknown;
  private reasoning = "";
  private finished = false;
  private done = false;
  constructor(private onContent: (text: string) => void) {}

  push(text: string) {
    this.buffer += text;
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end).replace(/\r$/, "");
      this.buffer = this.buffer.slice(end + 1);
      if (line === "") this.event();
      else if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
    }
  }

  private event() {
    if (!this.data.length) return;
    const text = this.data.join("\n");
    this.data = [];
    if (text === "[DONE]") { this.done = true; return; }
    const chunk = JSON.parse(text);
    if (chunk.error) throw new Error(chunk.error.message || String(chunk.error));
    if (chunk.usage) this.usage = chunk.usage;
    const choice = chunk.choices?.find((c: any) => c.index === 0) ?? chunk.choices?.[0];
    const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
    if (typeof reasoning === "string") this.reasoning += reasoning;
    if (typeof choice?.delta?.content === "string") {
      this.content += choice.delta.content;
      this.onContent(this.content);
    }
    if (choice?.finish_reason) {
      if (!["stop", "length"].includes(choice.finish_reason)) throw new Error(`Generation stopped: ${choice.finish_reason}`);
      if (choice.finish_reason === "length") throw new Error("生成内容达到输出上限，请提高该 Agent 的最大输出 Token 数后重试");
      this.finished = true;
    }
  }

  finish() {
    this.push("\n\n");
    if (!this.done && !this.finished) throw new Error("模型流式响应意外中断，请重试");
    if (!this.content.trim()) throw new Error("模型未返回正文内容");
    return { choices: [{ message: { content: this.content, ...(this.reasoning ? { reasoning_content: this.reasoning } : {}) } }], usage: this.usage };
  }
}
