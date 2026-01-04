"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatRequestBody } from "@/modules/chat/types";

export class AxiosChatTransport extends DefaultChatTransport<UIMessage> {
  constructor(config: { api: string; body?: () => Partial<ChatRequestBody> }) {
    super({
      api: config.api,
      body: config.body
        ? () => {
            const bodyData = config.body!();
            return bodyData;
          }
        : () => {
            return { frontendToolCallRes: null };
          },
    });
  }
}
