export interface ScrollPosition {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** Includes short conversations and Safari's elastic scroll positions. */
export function isNearConversationEnd(
  { scrollHeight, scrollTop, clientHeight }: ScrollPosition,
  threshold = 80,
): boolean {
  return scrollHeight - clientHeight - Math.max(0, scrollTop) <= threshold;
}
