import { fileURLToPath } from 'node:url';
import { main } from './src/relay/main.mjs';
import { realpathSync } from 'node:fs';
export { startAuthenticatedSocksRelay } from './src/relay/start-authenticated-socks-relay.mjs';
export { startAuthenticatedHttpRelay } from './src/relay/start-authenticated-http-relay.mjs';
export { readUpstreams } from './src/relay/read-upstreams.mjs';

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
