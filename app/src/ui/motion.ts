/**
 * The tool icons tell their tool's story (scenes/*.css) and the family icons
 * move (motion.css), but only while they are on screen: an icon scrolled away costs nothing, and a page of
 * forty cards on a cheap phone moves only the few in view. Nothing moves for
 * anyone who has asked their phone for less motion; without this script the
 * icons are simply still.
 */
export function liveIcons(): void {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-live', entry.isIntersecting);
    },
    { rootMargin: '40px' },
  );
  const watched = new WeakSet<Element>();
  // Stories need room to be read: the cards, a tool page's own icon and the families. The small
  // chips and crumbs show the still picture.
  const watch = (root: ParentNode) => {
    for (const drawing of root.querySelectorAll(':is(.tool-card__icon, .drop-zone__icon, .family__icon, .family-jump) g.act')) {
      const svg = drawing.parentElement;
      if (svg === null || watched.has(svg)) continue;
      watched.add(svg);
      seen.observe(svg);
    }
  };
  watch(document);
  // Icons drawn later (Open a file's suggestions) move too.
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) watch(node);
  }).observe(document.body, { childList: true, subtree: true });
}
