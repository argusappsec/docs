import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

/**
 * Reading a workflow file, for the tests that hold workflows to their rules.
 *
 * Two of them do — `src/deploy/deploy.test.ts` and `src/sync/sync.test.ts` — and
 * both exist because ADR 0009 chose workflows in this repository over a dashboard
 * precisely so their rules could be checked. What they check is different every
 * time; how a workflow is read is the same, and the YAML 1.1 subtlety below is the
 * sort of knowledge that should be wrong in one place at most.
 *
 * Nothing here asserts. It throws instead, so the message names the file rather
 * than the expectation, and so this module stays out of the tests' own vocabulary.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** A trigger's configuration. `workflow_dispatch:` parses to null, `push:` to a
 *  map, `schedule:` to a list of crons. */
export type Trigger = { branches?: readonly string[] } | { cron?: string }[] | null;

export type Step = {
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

export type Job = { steps?: Step[]; permissions?: unknown };

export type Workflow = {
  permissions?: unknown;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, Job>;
} & Record<string, unknown>;

export interface WorkflowFile {
  /** The path it was read from, so a failure names a file and not a variable. */
  readonly path: string;
  /** The text, for the rules that are about what the file says rather than about
   *  what it declares — a secret referenced anywhere, a shell written inline. */
  readonly source: string;
  /** The parsed document. */
  readonly document: Workflow;
  /** `source` with its comment lines blanked, so prose *about* a rule is never
   *  read as the rule. YAML's comments and, inside a `run:` block, the shell's are
   *  the same character. */
  uncommented(): string;
  triggers(): Record<string, Trigger>;
  jobs(): Record<string, Job>;
  /** Every step of every job, in the order they run — which only means something
   *  in a workflow of one job, so the tests that read it that way say so. */
  steps(): Step[];
}

export function readWorkflow(path: string): WorkflowFile {
  const source = readFileSync(join(REPO_ROOT, path), 'utf8');
  const document = parse(source) as Workflow | null;

  if (document === null) throw new Error(`${path} parses to nothing`);

  return {
    path,
    source,
    document,
    uncommented: () => source.replace(/^\s*#.*$/gm, ''),

    triggers() {
      // YAML 1.1 reads a bare `on` as the boolean `true`; this parser follows 1.2,
      // where it stays a string. Both are read, so a change of parser default
      // cannot quietly empty this out and leave every trigger rule passing.
      const found = document['on'] ?? document['true'];

      if (found === undefined) throw new Error(`no trigger block in ${path}`);

      return found as Record<string, Trigger>;
    },

    jobs() {
      if (document.jobs === undefined) throw new Error(`no jobs in ${path}`);

      return document.jobs;
    },

    steps() {
      return Object.values(this.jobs()).flatMap((job) => job.steps ?? []);
    },
  };
}
