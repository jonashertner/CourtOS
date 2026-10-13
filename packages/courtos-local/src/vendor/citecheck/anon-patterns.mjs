// The patterns of the anonymization check, shared with its Python twin
// (build/anon_engine.py reads the JSON between the two markers below, so this
// block must stay strict JSON: double quotes, no comments, no trailing commas).
//
// Macros, replaced per language before compiling:
//   {L}   one letter          JS [\p{L}\p{Nl}\p{No}]    Python [^\W\d_]
//   {W}   a letter or digit   JS [\p{L}\p{N}_]          Python \w
//   {w}   the same, inside [] JS \p{L}\p{N}_             Python \w
//   {<W}  not after {W}       JS (?<![\p{L}\p{N}_])     Python (?<!\w)
//   {W>}  not before {W}      JS (?![\p{L}\p{N}_])      Python (?!\w)
// Digits are written [0-9]: JavaScript's \d is ASCII, Python's is not.
// Flags: "i" = case-insensitive. Every pattern is global and Unicode-aware.

/* patterns:begin */
export const PATTERNS = {
  "placeholder": ["(?:{<W}[A-Z]{1,3}(?:\\.[A-Z]{1,2})?\\.?_{2,}|{<W}[A-Z]_{2,}|\\[(?:\\.\\.\\.|…)\\]|{<W}X{3,}{W>}|\\*{3,}|{<W}(?:AO|AP|RA|CC|AI|AC|PC|CO|TE)\\s[0-9]{1,2}{W>})", ""],
  "initial": ["{<W}[A-Z]\\.(?:[A-Z]\\.)?(?=[\\s,;)])", ""],
  "word": ["{L}{2,}", ""],
  "code": ["{<W}(?:{W}|[.'’/\\-])*[0-9](?:{W}|[.'’/\\-])*", ""],

  "ahv": ["(?<![0-9])(?<![0-9]\\.)756[.\\s]?[0-9]{4}[.\\s]?[0-9]{4}[.\\s]?[0-9]{2}(?![0-9])", ""],
  "ahv_old": ["(?:AHV|AVS|AVS/AI)(?:[\\s\\-]?(?:Nr\\.?|n[°o]\\.?|num[ée]ro))?\\s*:?\\s*([0-9]{3}\\.[0-9]{2}\\.[0-9]{3}\\.[0-9]{3})(?![0-9])", "i"],
  "iban": ["{<W}[A-Z]{2}[0-9]{2}(?:\\s?[A-Z0-9]{4}){3,7}(?:\\s?[A-Z0-9]{1,3})?{W>}", ""],
  "phone": ["(?<![0-9.'’/])(?:(?:\\+|00)[0-9]{2,3}[\\s.\\-]?\\(?0?\\)?[\\s.\\-]?[0-9]{2}[\\s.\\-]?[0-9]{3}[\\s.\\-]?[0-9]{2}[\\s.\\-]?[0-9]{2}|0[0-9]{2}[\\s.\\-][0-9]{3}[\\s.\\-][0-9]{2}[\\s.\\-][0-9]{2}|0[0-9]{2}/[0-9]{3}[\\s.\\-]?[0-9]{2}[\\s.\\-]?[0-9]{2})(?![0-9])", ""],
  "email": ["[{w}.%+\\-]+@[{w}.\\-]+\\.{L}{2,}", ""],
  "url": ["(?:https?://|www\\.|(?:facebook|fb|instagram|tiktok|linkedin|twitter|x|youtube|snapchat)\\.com/|t\\.me/)[^\\s<>\"«»]+", "i"],
  "address": ["{<W}(?:(?:(?!(?:wohnhaft|whft|wohnt|an|der|die|in|im|am|bei|von|zur|zum|domicilié|domiciliée|à|au|via|à la){W>})[A-ZÄÖÜ][a-zäöüéè]+[\\s\\-])?{L}+(?:strasse|straße|str\\.|gasse|weg|platz|rain|halde|ring|allee|matt|hof)|(?:rue|avenue|av\\.|chemin|ch\\.|route|rte|boulevard|bd|place|ruelle|impasse|quai|via|viale|vicolo|piazza|corso|strada)\\s+(?:(?:de|du|des|de la|de l'|de l’|della|del|dei|delle|ai|al|alla)\\s+)?{L}{3}[{w}\\-'’]*(?:\\s+{L}[{w}\\-'’]*)?)\\s+[0-9]{1,4}[a-z]?(?:,?\\s+(?:CH-)?[0-9]{4}\\s+{L}{3,})?{W>}", "i"],
  "plate": ["{<W}(?:AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH|FL)[\\s\\-]?[0-9]{1,6}(?![0-9])", ""],
  "plate_context": ["(?:kontrollschild|kennzeichen|nummernschild|fahrzeug|personenwagen|lieferwagen|motorrad|lastwagen|immatricul|plaques?|véhicule|voiture|camion|targa|veicolo|automobile)", "i"],
  "parcel": ["(?:Parzelle|Parz\\.|Kat\\.?-?Nr\\.?|Kataster(?:-?Nr\\.?|nummer)|Grundstück(?:e)?(?:-?Nr\\.?|\\s+Nr\\.?)?|GB[\\s\\-]?Nr\\.?|Grundbuchblatt|Liegenschaft(?:-?Nr\\.?|\\s+Nr\\.?)|parcelles?|biens?-fonds|art\\.\\s?RF|feuillet|fondo|mappale|particella)\\s*(?:n[°o]s?\\.?\\s*|Nr\\.?\\s*)?([0-9][0-9'’.]*[0-9]|[0-9])", "i"],
  "birthdate": ["{<W}(?:geb(?:oren)?\\.?(?:\\s+am)?|Geburtsdatum:?|n[ée]e?\\s+le|date\\s+de\\s+naissance:?|nat[oa]\\s+il|data\\s+di\\s+nascita:?)\\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}|[0-9]{1,2}(?:\\.|er|°)?\\s*(?:[0-9]{1,2}\\.|{L}+)\\s*[0-9]{2,4})", "i"],
  "birthdate_after": ["{<W}am\\s+([0-9]{1,2}\\.\\s*(?:[0-9]{1,2}\\.|{L}+)\\s*[0-9]{4})\\s+(?:in\\s+{L}+\\s+)?geboren", "i"],
  "insured": ["(?:Versicherten-?(?:nummer|Nr\\.?)|Vers\\.-Nr\\.?|Polic(?:e|en)-?(?:nummer|Nr\\.?)|Polizzen?-?Nr\\.?|n[°o]\\s+d['’]assur[ée]e?|num[ée]ro\\s+d['’]assur[ée]e?|police\\s+n[°o]|polizza\\s+n\\.?|Kunden(?:nummer|-Nr\\.?)|Patienten(?:nummer|-Nr\\.?)|Patienten-?ID|n[°o]\\s+de\\s+patient|num[ée]ro\\s+de\\s+patient|numero\\s+(?:del\\s+)?paziente|n\\.\\s+paziente)\\s*:?\\s*([A-Z0-9][A-Z0-9.\\-/]{2,24}[0-9])", "i"],
  "zemis": ["(?:ZEMIS(?:-?Nr\\.?)?\\s*:?\\s*|(?<![A-Za-z])N\\s(?=[0-9]{3}\\s[0-9]{3}))([0-9]{3}\\s?[0-9]{3}(?:\\s?[0-9]{3})?)(?![0-9])", ""],
  "document_no": ["(?:Pass(?:-?Nr\\.?|nummer)|Reisepass\\s+Nr\\.?|passeport\\s+n[°o]|ID-?Nr\\.?|Identitätskarte\\s+Nr\\.?|carte\\s+d['’]identité\\s+n[°o]|passaporto\\s+n\\.?)\\s*:?\\s*([A-Z0-9]{6,12})", "i"],
  "account": ["(?:Konto(?:-?Nr\\.?|\\s+Nr\\.?|nummer)|PC-Konto|Postkonto|compte\\s+(?:n[°o]|postal|CCP)|CCP|conto\\s+n\\.?)\\s*:?\\s*([0-9][0-9\\-. ]{4,20}[0-9])", "i"],

  "not_a_person": ["(?:liquidation|vormals|z\\.\\s?h\\.|zuhanden|kommando|armee|direkt(?:or|ion)|departement|département|verwaltung|administration|pouvoir judiciaire|staatskasse|gerichtskasse|beratungsstelle|hotline|zentrale|permanence|fondation|stiftung|fondazione|caisse|kasse{W>}|cassa|versicherung|assurance|association|verein|société|firma|{<W}AG{W>}|{<W}SA{W>}|GmbH|S[àa]rl|{<W}Me\\s|ma[îi]tre|rechtsanw|avocat|advokat|f[üu]rsprech|notai?r|[ÉE]tude|kanzlei|tribunal|gericht|office|amt{W>}|ufficio|police|polizei|commune|gemeinde|comune|kanton|canton|bund{W>}|minist[èe]re|sekretariat|secr[ée]tariat|spital|hôpital|klinik|clinique|bank|banque|post{W>}|poste{W>}|postfach|case postale|casella postale|fax|telefax|www\\.|@justice|gefängnis|prison|carcere|strafanstalt|justizvollzug|haftanstalt|pénitencier|penitenziario|établissement|anstalt|stelle{W>}|dienst{W>}|service{W>}|servizio|behörde|autorité|autorità|kesb|apea|vertreten|représenté|rappresentat|beratung|conseil{W>}|consulenza|heim{W>}|foyer|spitex)", "i"],
  "letterhead": ["^[\\s,;]*(?:Postfach|case postale|casella postale|Telefon|Tel\\.|téléphone|telefono|Fax|Telefax|www\\.|[A-Za-z0-9.]+@)", "i"],
  "public_mail": ["(?:admin\\.ch|gerichte?|justiz|justice|tribunal|court|{<W}(?:ag|ai|ar|be|bl|bs|fr|ge|gl|gr|ju|lu|ne|nw|ow|sg|sh|so|sz|tg|ti|ur|vd|vs|zg|zh)\\.ch)$", "i"],
  "freemail": ["(?:^|\\.)(?:gmail|googlemail|bluewin|gmx|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|protonmail|proton|pm|sunrise|hispeed|swissonline|sunrisemail|web|aol|mail|vtx|netplus|citycable|ticino|orange|free|laposte|libero|tiscali|alice|virgilio)\\.[a-z]{2,3}$", "i"],
  "mobile": ["^(?:(?:\\+|00)41[\\s.\\-]?\\(?0?\\)?[\\s.\\-]?7[5-9]|07[5-9])", ""],
  "masked_domain": ["^[A-Z]\\.(?:[a-z]{2,3})?$|_{2,}", ""],
  "masked_local": ["(?:_{2,}|\\.{2,}|^x+$|^y+$|^xyz$|^abc$|^[a-z]{1,2}\\.$|vorname|nachname|^name$|pr[ée]nom|^nom$)", "i"],
  "social": ["(?:facebook\\.com|fb\\.com|instagram\\.com|tiktok\\.com|linkedin\\.com|twitter\\.com|x\\.com|youtube\\.com|snapchat\\.com|t\\.me)/", "i"],

  "short": ["^[0-9]{1,4}$", ""],
  "date": ["^(?:[0-9]{1,2}\\.[0-9]{1,2}\\.(?:[0-9]{2}|[0-9]{4})|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/(?:[0-9]{2}|[0-9]{4}))$", ""],
  "amount": ["^(?:[0-9]{1,3}(?:['’][0-9]{3})+(?:\\.(?:[0-9]{1,2}|[\\-–]{1,2}))?|[0-9]+\\.(?:[0-9]{2}|[\\-–]{1,2}))$", ""],
  "section": ["^[0-9]{1,3}(?:\\.[0-9]{1,3})+[a-z]?\\.?$", ""],
  "span": ["^[0-9]{1,4}\\s?[\\-–]\\s?[0-9]{1,4}$", ""],
  "reference": ["^(?:[0-9]{1,6}(?:\\.[0-9]{1,6})*(?:/[0-9]{1,6}(?:\\.[0-9]{1,6})*)+(?:[\\-–][0-9]{1,6})?|(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]+(?:[._/\\-][A-Za-z0-9]+)+|[A-Z]{1,4}[0-9]{5,8}(?:-[A-Z0-9_]+)?|[0-9]{1,4}[.\\-](?:19|20)[0-9]{2}[.\\-][0-9]{1,6}|[0-9]{1,3}(?:[\\-/][0-9]{1,3}){2,})$", ""],
  "ref_before": ["(?:Art|Artt|Abs|al|cpv|lit|let|Ziff|ch|cifra|n|N|Nr|nr|no|n°|Rz|Rn|S|p|pp|pag|E|Erw|consid|cons|c|SR|RS|AS|RO|BBl|FF|BGE|ATF|DTF|Bd|Vol|Aufl|éd|ed|act|Urk|pce|pièce|pièces|Beilage|Bel|KB|BB|doc|Anh|Anhang|annexe|§|pages?|Seiten?)\\.?\\s*(?:(?:[A-Z]{1,3}|[IVX]{1,4})[\\s\\-]+)?(?:[0-9][0-9.]*\\s*(?:[,;]|und|et|e|bis|-|–)\\s*)*$", ""],
  "docket_before": ["{<W}[A-Z]{1,4}\\s?[0-9]{2,4}\\s$", ""],
  "party_before": ["{<W}(?:Herrn?|Frau|Kläger(?:in)?|Beklagten?|Beklagter|Beschwerdeführer(?:in)?|Beschwerdegegner(?:in)?|Berufungskläger(?:in)?|Berufungsbeklagten?|Gesuchsteller(?:in)?|Gesuchsgegner(?:in)?|Angeklagten?|Angeklagter|Beschuldigten?|Beschuldigter|Ehemann|Ehefrau|Zeugin|Zeuge|Monsieur|Madame|M\\.|Mme|[Rr]ecourante?|[Ii]ntimée?|[Dd]emandeur|[Dd]emanderesse|[Dd]éfendeur|[Dd]éfenderesse|[Pp]révenue?|[Ss]ignor[ae]?|[Rr]icorrente|[Cc]onvenut[oa]|[Aa]ttore|[Aa]ttrice|[Ii]mputat[oa])\\s+$", ""],
  "postcode": ["(?:(?<=,[ \\u00a0])|(?<=\\n)|^)(?:(?:CH|F|D|A|I|FL)-)?[0-9]{4,5}(?=[ \\u00a0]+[A-ZÄÖÜ]{1,2}\\.(?:_{2,}|[,;)]|[ \\u00a0]*(?:\\n(?!\\s*[0-9])|$)))", ""],
  "date_before": ["(?:januar|jänner|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|dicembre|january|february|march|may|june|july|october|december|jahr|jahres|année|anno|year|vom|du|del|seit|depuis|dal|since|bis|jusqu'en|fino al|until|im|en|nel|in)\\s*$", "i"],
  "lang_de": ["{<W}(?:der|die|das|und|ist|nicht|mit|von|den|dem|ein|eine|einer|im|auf|für|sich|wird|wurde|werden|sei|sind|hat|auch|bei|nach|zur|zum|vom|gegen|über|oder|dass|wie|kann|nur|noch|wenn|durch|unter|zu){W>}", "i"],
  "lang_other": ["{<W}(?:le|la|les|et|est|une|que|qui|pour|dans|sur|par|pas|au|aux|en|ne|sont|avec|ce|cette|il|elle|du|lo|gli|della|delle|dei|che|per|con|non|sono|nel|nella|alla|the|and|of|is|that|with|for|this|was|are|be|by|from){W>}", "i"],
  "residence_before": ["(?:wohnhaft|whft\\.?|wohnt|wohnte|wohnend|wohnhafte[nrm]?|Wohnsitz|Wohnort|Wohnadresse|Privatadresse|Privatanschrift|domiciliée?|demeurant|résidant|réside|domiciliat[oa]|residente|risiede|abitante|abita)(?:\\s+(?:an der|an|in der|in|im|bei|à la|à|au|in via|via|a))?[\\s,:]*$", "i"],
  "title_before": ["{<W}(?:Herrn?|Frau|Fräulein|Mr|Mrs|Ms|Miss|Monsieur|Madame|Mademoiselle|M\\.|Mme|Mlle|Signora?|Sig\\.(?:ra)?)\\.?[ \\u00a0]+(?:[A-Z]\\.[ \\u00a0]?)*$", ""],
  "det_before": ["{<W}(?:der|die|das|dem|den|des|ein|eine|einem|einen|einer|eines|im|am|zum|zur|vom|beim|ins|ans|mit|von|nach|bei|auf|aus|für|ohne|um|gegen|kein|keine|keinem|keinen|seinem|seiner|seine|ihrem|ihrer|ihre|jede[mnrs]?|diese[mnrs]?|le|la|les|du|au|aux|un|une|il|lo|gli|del|della|nel|nella|al|alla)\\s+$", "i"],
  "sentence_end": ["(?:^|[.!?:;]|(?:^|\\s)[0-9]{1,3}(?:\\.[0-9]{1,3})*[.)]?|(?:^|\\s)[a-z]\\)|[«»\"„“(\\[])\\s*$", ""],
  "abbreviation_end": ["(?:{<W}{L}{1,3}|{<W}(?:Dr|Prof|lic|iur|vgl|bzw|usw|ca|Nr|Art|Abs|lit|Ziff|Hr|Fr|St|cf|etc|al|ff|vol|éd|Bd|Rz|N|S|p|Me|Mme|MM|Mlle|Sig|avv))\\.\\s*$", ""],
  "unit_after": ["^\\s*(?:%|‰|Prozent|pour\\s?cent|per\\s?cento|Fr\\.|CHF|EUR|USD|Franken|francs|franchi|Tage|Tagen|jours|giorni|Wochen|semaines|settimane|Monate|Monaten|mois|mesi|Jahre|Jahren|ans|anni|Stunden|heures|ore|Minuten|minutes|km|m2|m²|m3|m|cm|kg|g|mg|ml|l|Punkte|points|punti|Seiten|pages)(?![A-Za-z])", ""],

  "bench_open": ["{<W}(?:Besetzung|Composition|Composizione|Siégeant|Siégeaient|Mitwirkende|Mitwirkend|Présidence|Presidenza|Vorsitz|Le juge|La juge|Le président|La présidente|Il giudice|Il presidente|composta dei giudici|composto dei giudici|composta da|composto da)(?:\\s*:)?{W>}", ""],
  "bench_close": ["{<W}(?:Parteien|Parties|Parti|Participants|Verfahrensbeteiligte|Prozessbeteiligte|en la cause|dans la cause|in Sachen|nella causa|in re|gegen|contre|contro|entre|tra|Beschwerdeführer(?:in)?|recourante?|ricorrente)\\b|[A-Z]{1,3}\\.?_{2,}", ""],
  "literature": ["^[^\\n;]{0,180}?(?:[0-9]+\\.?\\s?(?:Aufl|Auflage|éd|ed|ediz|édition)\\.?|{<W}(?:Aufl\\.|Auflage|éd\\.|ediz\\.|vol\\.|Bd\\.|tome|Hrsg\\.|Hrsg|éds?\\.|ed\\]|eds\\.|in\\s?:|Kommentar|Commentaire|Commentario|Handkommentar|Praxiskommentar|Handbuch|Lehrbuch)|{<W}(?:N|n|Rz|Rn|nos?)\\.?\\s?[0-9]|(?:19|20)[0-9]{2},?\\s+(?:S|p|pag)\\.\\s?[0-9])", ""],
  "file_reference": ["{<W}(?:act|Urk|pce|pièces?|Beilagen?|Bel|KB|BB|doc|Dok|Akten)\\.?\\s?[0-9]", "i"],
  "citation_start": ["(?:\\(|\\[|;|,|vgl\\.|cf\\.|siehe|voir|v\\.|in\\s?:|/|{<W}[A-Z][A-Za-z]+-)\\s*(?:{L}[{w}\\-'’.]*\\s+){0,2}$", "i"],
  "role": ["{<W}(?:(?<court>Besetzung|{L}*[Rr]ichter(?:in|innen)?|Gerichtsschreiber(?:in|innen)?|Gerichtspräsident(?:in)?|Vizepräsident(?:in)?|Präsident(?:in)?|Vorsitz(?:ende[rn]?)?|Referent(?:in)?|Composition|[Pp]résidente?|[Vv]ice-présidente?|[Jj]uges?(?:\\s+(?:suppléante?s?|fédéra(?:l|ux|les?)|d’appel|d'appel|cantona(?:l|ux)))?|[Gg]reffi(?:er|ère)s?|Composizione|[Pp]residente|[Gg]iudic[ei](?:\\s+federal[ei])?|[Cc]ancellier[ea]|[Vv]ice-?[Cc]ancellier[ea]|[Ss]egretari[oa]|[Rr]edat(?:tore|trice))|(?<counsel>Rechtsanw[äa]lt(?:in|innen|e)?|RA(?:in)?|F[üu]rspr\\.|Advokat(?:in)?|F[üu]rsprecher(?:in)?|Me|Maître|Mes|avv\\.|avvocat[oa]|avocate?s?|lic\\.\\s?iur\\.|Dr\\.\\s?iur\\.|MLaw|BLaw)|(?<official>Staatsanw[äa]lt(?:in)?|Oberstaatsanw[äa]lt(?:in)?|Untersuchungsrichter(?:in)?|procureure?|procuratore|procuratrice|Bundesrat|Bundesrätin|Regierungsrat|Regierungsrätin|Gemeindepräsident(?:in)?|Stadtpräsident(?:in)?|conseill(?:er|ère)\\s+fédéral(?:e)?|conseill(?:er|ère)\\s+d['’]État|syndic|sindac[oa]|juge\\s+d['’]instruction))(?:\\s*:)?\\s+", ""],
  "name_run": ["(?:(?:Dr|Prof|PD|lic|iur|med|phil|rer|pol|oec|MLaw|LL\\.M)\\.?[ \\t\\u00a0]+|[A-Z]\\.\\s?)*(?:(?:von|van|de|da|di|del|della|du|des|der|le|la|zur|zum)[ \\t\\u00a0]+)?{L}[{w}\\-'’]*(?:[ \\t\\u00a0]+(?:(?:von|van|de|da|di|del|della|du|des|der|le|la|zur|zum)[ \\t\\u00a0]+)?{L}[{w}\\-'’]*){0,3}", ""],
  "run_join": ["^\\s*(?:,|und|et|e|sowie|ainsi que)\\s+", "i"],
  "author_after": ["^(?:(?:\\s*/\\s*|\\s+){L}[{w}\\-'’]*){0,3}\\s*(?:et\\s+al\\.|u\\.a\\.)?\\s*(?:,|\\()\\s*(?:{L}+\\.?\\s+){0,3}?(?:in\\s?:|Commentaire|Kommentar|Komm\\.|BSK|CR{W>}|CPra|Basler|Zürcher|Berner|Handkommentar|Praxiskommentar|N\\.?\\s?[0-9]|n\\.\\s?[0-9]|Rz\\.?\\s?[0-9]|Rn\\.?\\s?[0-9]|op\\.\\s?cit|a\\.a\\.O|loc\\.\\s?cit)", ""],
  "case_after": ["^\\s*(?:c\\.|v\\.|vs\\.?)\\s+", ""]
};
/* patterns:end */

export const MACROS = {
  '{<W}': '(?<![\\p{L}\\p{N}_])',
  '{W>}': '(?![\\p{L}\\p{N}_])',
  '{L}': '[\\p{L}\\p{Nl}\\p{No}]',
  '{W}': '[\\p{L}\\p{N}_]',
  '{w}': '\\p{L}\\p{N}_',
};
