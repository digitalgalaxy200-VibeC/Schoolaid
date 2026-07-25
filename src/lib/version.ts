import { BUILD_ID } from "./build-id";

/** Major bumped manually. Minor = git commit count, auto-incremented every deploy. */
export const APP_VERSION = `v1.${BUILD_ID}`;
