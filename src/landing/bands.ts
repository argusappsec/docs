/**
 * Which of the Landing's sections stand on the raised band.
 *
 * The page alternates: `bg`, then `surface`, then `bg` again, so each section
 * announces itself as a new argument without needing a heading rule. That is a
 * property of the *sequence*, not of any section, and it used to be decided
 * section by section in the markup — which works right up until the page is
 * reordered, and then it silently doesn't. Two raised sections in a row read as
 * one long section and the boundary the design was drawing disappears.
 *
 * So the page declares its order once, at the top, and every section asks. A
 * section moved keeps the band of its new position rather than the band it was
 * written with, which is what makes reordering the Landing an edit to markup
 * instead of a re-decision about every band on the page.
 *
 * The first two sections are both on the ground. The hero is the first, and it
 * closes with a rule rather than with a change of band — raising the section
 * under it would draw that same boundary twice.
 *
 * Asking about a section the order does not name throws, so a typo or a section
 * added to the markup and not to the order fails the build. The alternative is
 * the failure this exists to prevent, arriving silently by another door.
 */
export function raisedIn(order: readonly string[]): (id: string) => boolean {
  const raised = new Map<string, boolean>();

  order.forEach((id, index) => {
    if (raised.has(id)) {
      throw new Error(
        `the Landing names the section \`${id}\` twice — two sections sharing an id cannot sit on different bands`,
      );
    }

    raised.set(id, index >= 2 && index % 2 === 0);
  });

  return (id) => {
    const band = raised.get(id);
    if (band === undefined) {
      throw new Error(
        `the Landing renders a section \`${id}\` its order never names — add it to the order, in the place it is rendered`,
      );
    }

    return band;
  };
}
