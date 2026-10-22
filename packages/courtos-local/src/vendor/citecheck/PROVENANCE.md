Vendored from https://github.com/jonashertner/citecheck (MIT licence, see MIT-LICENSE).

| file | upstream | transform |
|---|---|---|
| keys.mjs, parser.mjs | addin/js/keys.js, parser.js (commit 534ef7f91fda72d62650d6b8d626260e89110a84, unchanged since ae73c86e706f45c75f1e58561304dbea5ff4cbf9; first vendored via frontend/src/app/lib/localCitecheck/vendor) | TypeScript no-check line removed, import extension .mjs |
| anon.mjs | addin/js/anon.js @ 534ef7f91fda72d62650d6b8d626260e89110a84 | import path anon-patterns.js → anon-patterns.mjs |
| anon-patterns.mjs, vocabulary.mjs | addin/js/anon-patterns.js, vocabulary.js @ 534ef7f91fda72d62650d6b8d626260e89110a84 | none |
| data/vocabulary*.{json,txt.gz} | addin/data @ 534ef7f91fda72d62650d6b8d626260e89110a84 | none (sources listed in vocabulary.json) |

The anonymisation check is citecheck's: CourtOS feeds it the extracted page
text of the case folder and turns its people and identifier entries into the
private pseudonym register.

The vocabulary (`data/vocabulary-*.txt.gz`) is a list of lower-case words that
the check accepts as unable to identify anyone. `data/vocabulary.json` records
how it was built: words drawn from 959,038 published rulings of 120 courts in
the OpenCaseLaw corpus, with the family and given names of the Federal
Statistical Office's resident statistics and of Wikidata used to keep names
out. Lines starting with `!` are such names, kept so that a compound such as
Hof+mann is not accepted as two ordinary words. The file holds no text of the
rulings and links no name to a person or a case.
