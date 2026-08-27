import { describe, expect, it } from 'vitest';

import { raisedIn } from './bands';

/**
 * The alternation is the page's rhythm, and a broken rhythm is the kind of
 * failure nobody notices in review: two raised sections in a row read as one
 * long section, and the reader loses the boundary the design was using to say
 * "new argument". Nothing turns red, and the page looks almost right.
 */
describe('the raised band', () => {
  const isRaised = raisedIn(['hero', 'one', 'two', 'three', 'four', 'five']);

  it('leaves the hero on the ground', () => {
    // It closes with a rule instead of a change of band, so raising it would
    // give it two endings.
    expect(isRaised('hero')).toBe(false);
  });

  it('leaves the section under the hero on the ground too', () => {
    // The hero's own rule is the boundary there; a band as well would draw the
    // same line twice.
    expect(isRaised('one')).toBe(false);
  });

  it('alternates from the second section down', () => {
    expect(['two', 'three', 'four', 'five'].map(isRaised)).toEqual([true, false, true, false]);
  });

  it('holds the alternation whatever the section is called', () => {
    // The rule is positional. A section renamed keeps its band, which is what
    // lets the page be reordered by moving markup rather than by re-deciding
    // every band by hand.
    expect(['hero', 'a', 'b'].map(raisedIn(['hero', 'a', 'b']))).toEqual([false, false, true]);
  });

  it('refuses a section the page never declared', () => {
    // Which is what makes this a build failure rather than a silent one: a
    // typo in a section's id, or a section added to the markup and not to the
    // order, stops the page being rendered at all.
    expect(() => isRaised('your-editor')).toThrow(/your-editor/);
  });

  it('refuses an order that names a section twice', () => {
    // Two sections sharing an id would each ask the same question and get the
    // same answer, so one of them lands on the wrong band. A duplicate is a
    // mistake in the page, not an input to interpret.
    expect(() => raisedIn(['hero', 'one', 'one'])).toThrow(/one/);
  });
});
