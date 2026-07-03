import type { TaskCommentDto } from "@opzava/project-management";

export interface CommentReader {
  readonly userId: string;
  readonly name: string;
}

export interface CommentReadState {
  readonly readers: readonly CommentReader[];
  readonly label: string;
  readonly unread: boolean;
}

export function commentReadState(
  comment: TaskCommentDto,
  input: {
    readonly currentUserId: string;
    readonly userNamesById: Readonly<Record<string, string>>;
  },
): CommentReadState {
  const authorUserId = comment.authorUserId;
  const readerIds = comment.readByUserIds.filter((userId) => userId !== authorUserId);
  const readers = readerIds.map((userId) => ({
    userId,
    name: userId === input.currentUserId ? "You" : (input.userNamesById[userId] ?? userId),
  }));

  if (readers.length === 0) {
    return {
      readers: [],
      label: "Sent · not read yet",
      unread: true,
    };
  }

  return {
    readers,
    label: `Read by ${readers.map((reader) => reader.name).join(", ")}`,
    unread: false,
  };
}

export function upsertComment(
  comments: readonly TaskCommentDto[],
  comment: TaskCommentDto,
): readonly TaskCommentDto[] {
  const existing = comments.findIndex((current) => current.id === comment.id);
  if (existing === -1) {
    return [...comments, comment].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  return comments.map((current) => (current.id === comment.id ? comment : current));
}
