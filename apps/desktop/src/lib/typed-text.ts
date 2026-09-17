/**
 * Is this event target a control the user types into?
 *
 * A global shortcut must never fire while someone is typing: `Ctrl+N` in a
 * search box means "new line", not "new request". The board's own `Ctrl+A` guard
 * and the menubar's accelerators both read this one implementation so they
 * cannot drift apart.
 */
export function acceptsTypedText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
