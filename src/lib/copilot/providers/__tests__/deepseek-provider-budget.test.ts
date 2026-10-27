import { describe, it, expect, vi, afterEach } from "vitest";
import { DeepSeekProvider } from "../deepseek-provider";

/**
 * Output budget — a reply must not be cut off by our own 4000-token cap, and if
 * the provider does stop at its limit, that is reported rather than hidden.
 */

const provider = () =>
  new DeepSeekProvider("test-key", { connectTimeoutMs: 50, idleTimeoutMs: 25, maxAttempts: 1 });

const encoder = new TextEncoder();

function sse(lines: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeepSeek output budget", () => {
  it("asks for 8192 tokens by default, not 4000", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBe(8192);
      return new Response(
        JSON.stringify({ model: "m", choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().chat([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("ok");
  });

  it("appends a cut-off notice when the provider stops at the token limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "m",
            choices: [{ message: { content: "partial answer" }, finish_reason: "length" }],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await provider().chat([{ role: "user", content: "hi" }]);
    expect(result.content).toContain("partial answer");
    expect(result.content).toContain("cut off");
  });

  it("streams a cut-off notice when the stream ends at the token limit", async () => {
    const chunk = (text: string, finish?: string) =>
      `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, ...(finish ? { finish_reason: finish } : {}) }],
      })}\n\n`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse([chunk("partial answer"), chunk("", "length"), "data: [DONE]\n\n"])),
    );

    const out: string[] = [];
    for await (const piece of provider().streamChat([{ role: "user", content: "hi" }])) {
      out.push(piece);
    }

    expect(out.join("")).toContain("partial answer");
    expect(out.join("")).toContain("cut off");
  });
});
