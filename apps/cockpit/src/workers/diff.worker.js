import { expose } from 'comlink';
import { createTwoFilesPatch } from 'diff';
const api = {
    computeDiff(left, right, options = {}) {
        let a = left;
        let b = right;
        if (options.jsonMode) {
            try {
                a = JSON.stringify(JSON.parse(a), null, 2);
                b = JSON.stringify(JSON.parse(b), null, 2);
            }
            catch {
                // If not valid JSON, diff as-is
            }
        }
        return createTwoFilesPatch('left', 'right', a, b, undefined, undefined, {
            ignoreWhitespace: options.ignoreWhitespace,
        });
    },
};
expose(api);
