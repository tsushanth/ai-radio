/** Import first in an entry point: every later console line is masked (lib/log-privacy.ts). */
import { installLogRedaction } from './log-privacy';

installLogRedaction();
