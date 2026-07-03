export type MentionTargetKind = "human" | "assistant";

export interface MentionTarget {
  readonly key: string;
  readonly label: string;
  readonly kind: MentionTargetKind;
  readonly userId?: string;
  readonly assistantKey?: string;
}

export interface MentionDispatchRecord {
  readonly messageHash: string;
}

export type AssistantMentionGuardResult =
  | {
      readonly action: "none";
      readonly mentions: readonly MentionTarget[];
    }
  | {
      readonly action: "dispatch";
      readonly assistant: MentionTarget & { readonly kind: "assistant" };
      readonly messageHash: string;
      readonly mentions: readonly MentionTarget[];
    }
  | {
      readonly action: "blocked";
      readonly code:
        | "assistant_self_mention"
        | "mention_depth_exceeded"
        | "mention_loop_limit"
        | "mention_duplicate";
      readonly message: string;
      readonly mentions: readonly MentionTarget[];
    };

const assistantMentionLoopLimit = 3;
const maxAssistantMentionChainDepth = 1;

function mentionKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function targetMentionKey(target: Pick<MentionTarget, "key" | "label">): string {
  return mentionKey(target.key || target.label);
}

export function parseMentions(
  body: string,
  targets: readonly MentionTarget[],
): readonly MentionTarget[] {
  const normalizedBody = body.toLowerCase();
  const matched = targets.filter((target) => {
    const keys = [
      targetMentionKey(target),
      mentionKey(target.label),
      ...(target.assistantKey === undefined ? [] : [mentionKey(target.assistantKey)]),
    ].filter(Boolean);

    return keys.some((key) =>
      new RegExp(
        `(^|\\s)@${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\s|[.,;:!?])`,
        "i",
      ).test(normalizedBody),
    );
  });

  return [...new Map(matched.map((target) => [target.key, target])).values()];
}

export function stableMentionMessageHash(input: {
  readonly cardTaskId: string;
  readonly body: string;
}): string {
  const normalized = `${input.cardTaskId}:${input.body.trim().replace(/\s+/g, " ").toLowerCase()}`;
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(index);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function evaluateAssistantMentionGuard(input: {
  readonly body: string;
  readonly cardTaskId: string;
  readonly authorKind: MentionTargetKind;
  readonly authorAssistantKey?: string | null;
  readonly targets: readonly MentionTarget[];
  readonly chainDepth: number;
  readonly previousAssistantMentionCount: number;
  readonly previousDispatches: readonly MentionDispatchRecord[];
}): AssistantMentionGuardResult {
  const mentions = parseMentions(input.body, input.targets);
  const assistant = mentions.find(
    (mention): mention is MentionTarget & { readonly kind: "assistant" } =>
      mention.kind === "assistant",
  );

  if (assistant === undefined) {
    return {
      action: "none",
      mentions,
    };
  }

  if (
    input.authorKind === "assistant" &&
    input.authorAssistantKey !== null &&
    input.authorAssistantKey !== undefined &&
    input.authorAssistantKey === assistant.assistantKey
  ) {
    return {
      action: "blocked",
      code: "assistant_self_mention",
      message: "Assistant-authored comments cannot mention themselves.",
      mentions,
    };
  }

  if (input.chainDepth >= maxAssistantMentionChainDepth) {
    return {
      action: "blocked",
      code: "mention_depth_exceeded",
      message: "Assistant mention chain depth has been reached for this card.",
      mentions,
    };
  }

  if (input.previousAssistantMentionCount >= assistantMentionLoopLimit) {
    return {
      action: "blocked",
      code: "mention_loop_limit",
      message: "Assistant mention loop limit has been reached for this card.",
      mentions,
    };
  }

  const messageHash = stableMentionMessageHash({
    cardTaskId: input.cardTaskId,
    body: input.body,
  });

  if (input.previousDispatches.some((record) => record.messageHash === messageHash)) {
    return {
      action: "blocked",
      code: "mention_duplicate",
      message: "This assistant mention was already dispatched for this card.",
      mentions,
    };
  }

  return {
    action: "dispatch",
    assistant,
    messageHash,
    mentions,
  };
}
