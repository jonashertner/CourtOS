OpenCaseLaw Hybrid-Sandbox: feste Demonstrationsdaten
Prüfstand: 9. Oktober 2026

Zweck und Datenvertrag

demo.json enthält vier kurze, vollständig erfundene Dokumente eines einzigen Verwaltungsdossiers. Die Baubehörde Linden, die Gesuchstellerin Nora Beispiel, sämtliche Ereignisse und Datumsangaben sind synthetisch. Sie bezeichnen keine reale Person, Gemeinde oder Akte. Es ist bewusst kein Kanton festgelegt; aus dem Dossier lässt sich keine anwendbare kantonale Verfahrensordnung ableiten. Die Dokumente enthalten einen ununterzeichneten Entwurf, keine nachgewiesene endgültige Verfügung.

documents ist der private Bereich der Demonstration. documents[].paragraphs enthält stabile Absatzkennungen und Text. sources ist ein davon getrennter, ausschliesslich öffentlicher Rechtsquellenbestand. sources[].passages enthält öffentliche Wortlautauszüge und ausdrücklich bezeichnete redaktionelle Kontexte. questions enthält zwei feste abstrakte Fragen. Es gibt in diesem Datensatz keine Benutzereingaben, freien Fragen, Fallimporte oder hochgeladenen Dokumente.

Vertrag mit dem Backend: Ein ausgehendes öffentliches Paket darf nur die fest im Serverbestand hinterlegte ausgewählte Frage und deren in source_ids genannten öffentlichen Quellen enthalten. Die Auswahl über eine ID ist keine Erlaubnis, vom Client angelieferte Quellentexte, eine geänderte Frage oder einen lokalen Entwurf zu übernehmen. Quellen-ID, Titel, URL, Fundstelle und öffentliche Passagen dürfen für prüfbare Nachweise mitgegeben werden. Weder documents noch daraus abgeleitete Zusammenfassungen, Metadaten, Dateien oder Nachrichten dürfen in diesen Ausgangspfad gelangen. Eine vollständige Vorschau muss dieselben Inhalte zeigen, die tatsächlich übertragen werden.

Bei Quellen kennzeichnet kind=quotation einen wörtlich geprüften Auszug; kind=editorial_context ist eine eigene, quellengebundene Paraphrase und ausdrücklich kein Urteilzitat. Die beiden Urteilzitate enden vor der Nachweisparenthese des Originals; die Fundstelle sagt dies ausdrücklich. Die ausgelassenen Nachweisparenthesen werden nicht als Beleg einer anderen Fundstelle ausgegeben. Der Fragenwortlaut verlangt die Unterscheidung und die Benennung von Quellen-/Passagen-IDs. Es existiert bewusst kein zweites sources.text-Feld, das mit passages auseinanderlaufen könnte.

Private Testkennzeichnung

documents[2].paragraphs[2].metadata.isolation_canary enthält eine unverwechselbare, synthetische Kennzeichnung für den Isolationstest. Sie ist kein echtes Geheimnis, keine Anweisung und kein Zugangsschlüssel. Sie gehört zur privaten Absatz-Metadata und darf in keinem öffentlichen Paket und keiner externen Anfrage erscheinen. Die automatischen Grenzprüfungen stehen in ../tests/test_backend.py; insbesondere prüfen test_exact_public_payload_and_one_time_approval und test_actual_demo_matches_independent_public_catalogue die Trennung vom ausgehenden Paket. Testbefunde sind keine vorgegebenen Antworten für das lokale oder externe Modell.

Quellenherkunft und Wortlautprüfung

S01: Bundesverfassung der Schweizerischen Eidgenossenschaft, Art. 29 Abs. 2, SR 101.
Öffentliche Referenz: https://www.fedlex.admin.ch/eli/cc/1999/404/de#art_29
Amtliches XML: https://www.fedlex.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/1999/404/20240303/de/xml/fedlex-data-admin-ch-eli-cc-1999-404-20240303-de-xml.xml
Fassung: 3. März 2024. Amtliches Original am 9. Oktober 2026 abgeglichen; die öffentliche XML-Adresse und die Prüfsumme bezeichnen die verwendete Quelle.
SHA-256 des XML-Originals: 4dda9c5f9121594214bce34bb8a3549c289d778fb4f6d0d769176d7950dfe328
Erneute Prüfung für diese Demonstration: Artikel mit eId art_29 aus dem XML gelesen; Wortlaut von Abs. 2 als exakte Teilzeichenfolge nach Vereinheitlichung der Leerzeichen geprüft. Der Datensatz gibt Abs. 2 vollständig wieder. Es handelt sich nicht um eine Aussage zu einer bestimmten kantonalen Verfahrensordnung.

S02: Schweizerisches Bundesgericht, II. öffentlich-rechtliche Abteilung, Urteil 2C_109/2025 vom 20. März 2025.
Primäradresse: https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F20-03-2025-2C_109-2025&lang=de&type=show_document
Wortlautauszug: E. 4.1, Satz zum Äusserungsrecht vor einem belastenden Entscheid; ohne die anschliessende Nachweisparenthese. 21 Wörter.
Kontext: E. 4.1–4.4. Der Fall betrifft eine Kostenauflage an Rechtsvertreterinnen in einem Haftverfahren. Das Bundesgericht bejahte die im konkreten Verfahren gewährte Äusserungsmöglichkeit. Diese Verfahrenslage darf nicht als baurechtliche Sachentscheidung oder als Regel über jede rechtliche Vorankündigung dargestellt werden.
Prüfung am 9. Oktober 2026: amtlichen Volltext im Webwerkzeug gelesen, anschliessend amtliches HTML unmittelbar abgerufen; HTTP-Zeichensatz iso-8859-1; HTML-Auszeichnung entfernt, Leerzeichen vereinheitlicht. Der JSON-Wortlaut ist in der so gelesenen Quelle exakt enthalten.
Abgerufene HTML-Bytes: 63583; SHA-256: 1d633855533dd002e5e95f4e7f9dcad4020820c0665a0e680e11e8ef2dca6397

S03: Schweizerisches Bundesgericht, I. öffentlich-rechtliche Abteilung, Urteil 1C_381/2022 vom 8. September 2023.
Primäradresse: https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F08-09-2023-1C_381-2022&lang=de&type=show_document&zoom=
Wortlautauszug: E. 2.1, erster Satz ohne anschliessende Nachweisparenthese. 20 Wörter.
Kontext: E. 2.1 und 2.3. Gegenstand war die Feststellung der Nichtigkeit eines nicht angefochtenen Widerrufs des Kantonsbürgerrechts. Trotz bestätigter Gehörsverletzung verneinte das Bundesgericht die Nichtigkeit im konkreten Fall und erörterte eine mögliche Heilung im ordentlichen Rechtsmittelverfahren. Daraus wird keine allgemeine Heilbarkeit und keine allgemeine Folgenlosigkeit von Gehörsfehlern abgeleitet. Die drei qualifizierten Voraussetzungen der Nichtigkeit werden im Auszug nicht vollständig wiedergegeben; der redaktionelle Kontext weist auf E. 2.1 zurück.
Prüfung am 9. Oktober 2026: amtlichen Volltext im Webwerkzeug gelesen, anschliessend amtliches HTML unmittelbar abgerufen; HTTP-Zeichensatz iso-8859-1; HTML-Auszeichnung entfernt, Leerzeichen vereinheitlicht. Der JSON-Wortlaut ist in der so gelesenen Quelle exakt enthalten.
Abgerufene HTML-Bytes: 57485; SHA-256: 35bbc9ab0d53ad354f497eb7de25704ad520b7c338a6a8bb06cd8593d0adba92

Die beiden neuen HTML-Volltexte wurden für die Prüfung im Arbeitsspeicher verarbeitet. Dieser begrenzte Implementierungsauftrag speichert nur die freigegebenen öffentlichen Auszüge und diesen Herkunftsvermerk, keine zusätzlichen vollständigen Urteilsdateien im Anwendungspaket. Die HTML-Hashes bezeichnen den Abruf und sind keine Behauptung, dass die vollständigen HTML-Dateien im Paket liegen. Die amtlichen URLs bleiben die vollständigen Primärquellen.

Grenzen des Beispiels

Die öffentlichen Quellen belegen allgemeine verfassungsrechtliche Aussagen und die beschriebenen Verfahrenskontexte. Sie klären weder eine kantonale Zuständigkeitsregel noch eine Rechtsmittelfrist, den rechtlichen Status eines bestimmten Entwurfs oder die konkrete Rechtsfolge im synthetischen Dossier. Die externe Frage enthält keine Datumsfolge oder andere Tatsachen des Dossiers. Erst die Verarbeitung innerhalb der Sandbox darf öffentliche Ergebnisse mit den synthetischen Dokumenten verbinden. Auch diese Zusammenführung ist eine zu überprüfende Arbeitshilfe.
