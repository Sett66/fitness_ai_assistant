export type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | {
      role: 'user';
      content: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      >;
    };

export type LlmUsage = {
  tokenIn: number;
  tokenOut: number;
  costCny: number;
};

export type JsonChatInput = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
};

export type JsonChatOutput = {
  text: string;
  usage: LlmUsage;
};

export type JsonChatClient = {
  generateJson(input: JsonChatInput): Promise<JsonChatOutput>;
};
