/**
 * Ask-the-hosts routes (logic in services/ask). Everything answers 404 ask_disabled unless ASK_HOSTS_ENABLED is on.
 */
import { createAskRouter } from '../services/ask/ask.router';
import { readAskConfig } from '../services/ask/ask';
import { getAskRuntime } from '../services/ask/ask.runtime';

export default createAskRouter({
  config: () => readAskConfig(),
  runtime: () => getAskRuntime(),
});
