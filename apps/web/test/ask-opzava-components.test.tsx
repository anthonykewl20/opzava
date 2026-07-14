import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  AskOpzavaChat,
  AskOpzavaDraftMessage,
  AskOpzavaTurn,
  shouldSubmitAskOpzavaComposerKey,
} from "../components/ask-opzava/ask-opzava-chat";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Bubble, BubbleContent } from "../components/ui/bubble";
import { Marker, MarkerContent } from "../components/ui/marker";
import { Message, MessageContent } from "../components/ui/message";
import { Textarea } from "../components/ui/textarea";
import { emptyAskAdminDraft } from "../lib/ask-admin-stream";
import type { AskAdminTurnView } from "../lib/ask-admin-history";

function turn(overrides: Partial<AskAdminTurnView> = {}): AskAdminTurnView {
  return {
    id: "turn-1",
    role: "assistant",
    status: "final",
    text: "Ready to help.",
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-07-03T00:00:00.000Z",
    finalizedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("official shadcn conversation primitives", () => {
  it("renders the primitive slots and variants used by the chat", () => {
    const markup = renderToStaticMarkup(
      <Message align="end">
        <Avatar>
          <AvatarFallback>OO</AvatarFallback>
        </Avatar>
        <MessageContent>
          <Bubble variant="destructive" align="end">
            <BubbleContent>Failed</BubbleContent>
          </Bubble>
          <Marker variant="separator">
            <MarkerContent>Working</MarkerContent>
          </Marker>
          <Textarea aria-label="Prompt" />
        </MessageContent>
      </Message>,
    );

    expect(markup).toContain('data-slot="message"');
    expect(markup).toContain('data-align="end"');
    expect(markup).toContain('data-slot="avatar"');
    expect(markup).toContain('data-slot="bubble"');
    expect(markup).toContain('data-variant="destructive"');
    expect(markup).toContain('data-slot="marker"');
    expect(markup).toContain('data-slot="textarea"');
  });
});

describe("Ask Admin Opzava chat rendering", () => {
  it("aligns user and assistant messages and gives failures explicit accessible meaning", () => {
    const user = renderToStaticMarkup(
      <AskOpzavaTurn
        turn={turn({ role: "user", text: "What changed?" })}
        currentUserName="Owner One"
        timeZone="UTC"
      />,
    );
    const assistant = renderToStaticMarkup(
      <AskOpzavaTurn turn={turn()} currentUserName="Owner One" timeZone="UTC" />,
    );
    const failed = renderToStaticMarkup(
      <AskOpzavaTurn
        turn={turn({
          status: "failed",
          text: "",
          errorCode: "askAdmin.failed",
          errorMessage: "The response was interrupted.",
        })}
        currentUserName="Owner One"
        timeZone="UTC"
      />,
    );

    expect(user).toContain('data-align="end"');
    expect(user).toContain('aria-label="You"');
    expect(assistant).toContain('data-align="start"');
    expect(assistant).toContain('aria-label="Opzava"');
    expect(failed).toContain('aria-label="Opzava, failed"');
    expect(failed).toContain('data-variant="destructive"');
    expect(failed).toContain("Failed.");
    expect(failed).toContain("The response was interrupted.");
  });

  it("renders one accessible loading Bubble while keeping decorative dots silent", () => {
    const markup = renderToStaticMarkup(
      <AskOpzavaDraftMessage draft={{ ...emptyAskAdminDraft(), status: "queued" }} />,
    );
    const streamingMarkup = renderToStaticMarkup(
      <AskOpzavaDraftMessage
        draft={{ ...emptyAskAdminDraft(), status: "working", text: "A streamed answer" }}
      />,
    );

    expect(markup).toContain('data-slot="bubble"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Queued:');
    expect(markup).toContain('data-loading-dots="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(streamingMarkup).toContain('data-slot="bubble-content"');
    expect(streamingMarkup).toContain("A streamed answer");
    expect(streamingMarkup.match(/role="status"/g)).toHaveLength(1);
  });

  it("renders one transcript log with stable item ids, anchors only user turns, and an accessible composer", () => {
    const markup = renderToStaticMarkup(
      <AskOpzavaChat
        conversationId="conversation-1"
        initialTurns={[
          turn({ id: "user-1", role: "user", text: "Hello" }),
          turn({ id: "assistant-1", role: "assistant", text: "Hi" }),
        ]}
        currentUserName="Owner One"
        organizationName="Opzava"
        workspaceName="Main"
      />,
    );

    expect(markup.match(/role="log"/g)).toHaveLength(1);
    expect(markup).toContain('aria-busy="false"');
    expect(markup).toContain('data-message-id="ask-opzava-turn-user-1"');
    expect(markup).toContain('data-message-id="ask-opzava-turn-user-1" data-scroll-anchor="true"');
    expect(markup).toContain('data-message-id="ask-opzava-turn-assistant-1"');
    expect(markup).toContain(
      'data-message-id="ask-opzava-turn-assistant-1" data-scroll-anchor="false"',
    );
    expect(markup).toContain('data-slot="message-scroller-button"');
    expect(markup).toContain('data-slot="textarea"');
    expect(markup).toContain('maxLength="4000"');
    expect(markup).toContain('aria-label="Send message"');
    expect(markup).toContain("Ask Admin Opzava");
    expect(markup).not.toContain("OpenClaw");
  });

  it("sends on Enter but preserves Shift+Enter and IME composition", () => {
    expect(
      shouldSubmitAskOpzavaComposerKey({ key: "Enter", shiftKey: false, isComposing: false }),
    ).toBe(true);
    expect(
      shouldSubmitAskOpzavaComposerKey({ key: "Enter", shiftKey: true, isComposing: false }),
    ).toBe(false);
    expect(
      shouldSubmitAskOpzavaComposerKey({ key: "Enter", shiftKey: false, isComposing: true }),
    ).toBe(false);
  });
});
