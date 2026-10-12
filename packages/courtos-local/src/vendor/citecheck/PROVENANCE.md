Vendored from https://github.com/jonashertner/citecheck (MIT licence, see MIT-LICENSE).

| file | upstream | transform |
|---|---|---|
| keys.mjs, parser.mjs | addin/js/keys.js, parser.js (commit ae73c86e706f45c75f1e58561304dbea5ff4cbf9, via frontend/src/app/lib/localCitecheck/vendor) | TypeScript no-check line removed, import extension .mjs |
| anon.mjs | addin/js/anon.js @ ae73c86e706f45c75f1e58561304dbea5ff4cbf9 | import path anon-patterns.js → anon-patterns.mjs |
| anon-patterns.mjs, vocabulary.mjs | addin/js/anon-patterns.js, vocabulary.js @ ae73c86e706f45c75f1e58561304dbea5ff4cbf9 | none |
| data/vocabulary*.{json,txt.gz} | addin/data @ ae73c86e706f45c75f1e58561304dbea5ff4cbf9 | none (sources listed in vocabulary.json) |

The anonymisation check is citecheck's: CourtOS feeds it the extracted page
text of the case folder and turns its people and identifier entries into the
private pseudonym register.
