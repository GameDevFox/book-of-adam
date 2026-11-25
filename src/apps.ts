import type { ComponentType } from "react";

import { DeseretApp } from "./deseret/DeseretApp";
import { EventsApp } from "./events/EventsApp";
import { LibraryApp } from "./library/LibraryApp";
import { PeopleApp } from "./people/PeopleApp";
import { TimelineApp } from "./timeline/TimelineApp";

/**
 * Sub-app registry — book-of-adam is a shell hosting many small research apps (the domus
 * mini-app pattern). Register new sub-apps here; the shell derives nav + routes from this list.
 */
export type SubApp = {
  /** Route segment, e.g. "people" → /people. */
  id: string;
  title: string;
  blurb: string;
  component: ComponentType;
};

const library: SubApp = {
  id: "library",
  title: "Library",
  blurb: "Read texts by edition; annotation, linking, and comparison to come.",
  component: LibraryApp,
};

const people: SubApp = {
  id: "people",
  title: "People",
  blurb: "Birth and death dates of Restoration figures, checked against sources.",
  component: PeopleApp,
};

const events: SubApp = {
  id: "events",
  title: "Events",
  blurb:
    "Datable events — ancient, Restoration, and modern — with duration vs. uncertainty encoded.",
  component: EventsApp,
};

const timeline: SubApp = {
  id: "timeline",
  title: "Timeline",
  blurb: "Zoomable canvas timeline — compare event sets and lifespans in parallel lanes.",
  component: TimelineApp,
};

const deseret: SubApp = {
  id: "deseret",
  title: "Deseret",
  blurb: "Write English in the Deseret Alphabet, by way of its Standard American pronunciation.",
  component: DeseretApp,
};

/**
 * The public build (src/mode.ts) ships only the sub-apps ready for readers; the rest stay in
 * the research view until they are. Choosing the list on the compile-time literal (not
 * filtering at runtime) lets the bundler drop the unshipped apps' code entirely — add an app
 * to the public list when it is ready to go out.
 */
export const SUB_APPS: SubApp[] = import.meta.env.PUBLIC_BUILD
  ? [library, deseret]
  : [library, people, events, timeline, deseret];
