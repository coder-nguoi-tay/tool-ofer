import { enqueueExclusively } from '../actions/enqueue-exclusively.mjs';
const runExclusively = handler => requestBody => enqueueExclusively(handler, requestBody);
export { runExclusively };
