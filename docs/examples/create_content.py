from pathlib import Path
import json

ROOT=Path(__file__).resolve().parent

def paragraph(id,text,locator): return {'id':id,'text':text,'judgment_locator':locator}
def doc(id,title,role,party,sections):
 return {'id':id,'title':title,'role':role,'party_label':party,'paragraphs':[paragraph(f'{id}-P{i:02}',*s) for i,s in enumerate(sections,1)]}
def case(id,lang,title,number,date,source_lang,sections,documents):
 day='-'.join(reversed(date.split('-')))
 url=f'https://search.bger.ch/ext/eurospider/live/{source_lang}/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F{day}-{number.replace("/","-")}&lang={source_lang}&type=show_document'
 return {'id':id,'language':lang,'title':title,'judgment':{'court':'Schweizerisches Bundesgericht','number':number,'date':date,'original_language':source_lang,'url':url,'locators':sections},'documents':documents}

cases=[
case('DE-01','de','Indexmiete und Herabsetzungsbegehren','4A_252/2023','2023-10-24','de',
 ['Sachverhalt A.a–A.b, B.a–B.d','E. 2','E. 3.1–3.6','Dispositiv 1'],[
 doc('D01','Standpunkt der Vermieterin','claim','Vermieterin',[
 ('Die Vermieterin beantragt, das Begehren um eine weitergehende Herabsetzung des Nettomietzinses abzuweisen. Sie hat den monatlichen Nettomietzins bereits ab 1. Juli 2020 von CHF 3’500 auf CHF 3’393 reduziert.','Sachverhalt B.b–B.c'),
 ('Die fünfjährige Indexdauer endete am 31. März 2020. Eine Anpassung auf diesen Zeitpunkt hätte unter Einhaltung der dreimonatigen Kündigungsfrist verlangt werden müssen. Das Begehren vom 4. März 2020 sei dafür zu spät.','E. 2'),
 ('Für eine spätere Anpassung sei der Referenzzinssatz im Dezember 2019 massgebend: 1,5 Prozent. Die Senkung auf 1,25 Prozent im März 2020 sei mit der gewährten Reduktion berücksichtigt. Ein Vergleich mit 2 Prozent bei Vertragsschluss sei nicht mehr zulässig.','E. 2')]),
 doc('D02','Standpunkt der Mieter','response','Mieter',[
 ('Die Mieter verlangen eine Herabsetzung des monatlichen Nettomietzinses auf CHF 3’215. In ihrer Klageantwort und Widerklage verlangen sie die Änderung ab 1. April 2020, eventualiter ab 1. Juli 2020.','Sachverhalt B.c'),
 ('Sie hatten am 2. Juni 2017 wegen des gesunkenen Referenzzinssatzes eine Reduktion verlangt. Die Vermieterin lehnte sie unter Hinweis auf die Indexklausel ab. Am 4. März 2020 verlangten die Mieter erneut eine Herabsetzung auf den nächsten Kündigungstermin.','Sachverhalt A.b'),
 ('Die geltend gemachte Reduktion beruht auf dem Vergleich des Referenzzinssatzes bei Vertragsschluss von 2 Prozent mit 1,25 Prozent im März 2020. Ob frühere Senkungen nach Ablauf der Indexdauer noch berücksichtigt werden dürfen, ist zwischen den Parteien streitig.','E. 2; E. 3.4.1')]),
 doc('D03','Belegauszug: Vertragsdaten','exhibit',None,[
 ('Der Mietvertrag wurde am 6. Februar 2015 geschlossen. Mietbeginn war der 1. April 2015. Vereinbart wurden ein monatlicher Nettomietzins von CHF 3’500, eine Bindung an den Landesindex der Konsumentenpreise und eine fünfjährige Mindestmietdauer bis 31. März 2020.','Sachverhalt A.a'),
 ('Ein Nachtrag vom 13. September 2019 konkretisierte die Kündigung: drei Monate Frist auf jedes Monatsende ausser Dezember, frühestens auf Ablauf der Mindestmietdauer am 31. März 2020.','Sachverhalt A.a'),
 ('Diese Angaben geben den im Urteil beschriebenen Vertragsinhalt wieder. Das vollständige unterschriebene Vertragsdokument und der Nachtrag liegen diesem Übungsdossier nicht bei.','Didaktische Abgrenzung; keine zusätzliche Falltatsache')]),
 doc('D04','Belegauszug: Begehren und Mietzins','exhibit',None,[
 ('2. Juni 2017: Die Mieter begehren wegen des gesunkenen Referenzzinssatzes eine Herabsetzung. Die Vermieterin gibt dem Begehren wegen der Indexklausel nicht statt. Das Urteil nennt hier kein genaues Datum der Antwort.','Sachverhalt A.b'),
 ('4. März 2020: Die Mieter verlangen wegen einer weiteren Senkung des Referenzzinssatzes eine Herabsetzung auf den nächsten Kündigungstermin. Am 17. April 2020 beantragen sie bei der Schlichtungsstelle eine Reduktion ab 1. Juli 2020 auf mindestens CHF 3’215, eventualiter CHF 3’402.','Sachverhalt A.b, B.a'),
 ('Nach der Schlichtungsverhandlung setzt die Vermieterin den Nettomietzins ab 1. Juli 2020 auf CHF 3’393 herab. Das genaue Datum dieser Erklärung wird im Urteil nicht genannt.','Sachverhalt B.b'),
 ('Die Übersicht ist eine Rekonstruktion nach dem Urteil, keine Sammlung der Originalschreiben. Eine Zahlung, ein Zustelldatum oder eine zusätzliche Kündigung wird damit nicht belegt.','Didaktische Abgrenzung; keine zusätzliche Falltatsache')])]),
case('FR-01','fr','Un versement pour acquérir une villa','4A_635/2016','2018-01-22','fr',
 ['Faits A, B.a–B.c, C','Consid. 4','Consid. 5.1–5.4','Dispositif 1'],[
 doc('D01','Position du demandeur','claim','Demandeur',[
 ('Le demandeur réclame la restitution des fonds remis à son ancienne compagne pour acquérir une villa à Mougins. Il soutient que le versement de 2’222’000 FF constituait un prêt et non une donation.','Consid. 5'),
 ('Il invoque une convention manuscrite datée du 30 septembre 1997, selon laquelle son investissement devait lui être remboursé et le bénéfice partagé en cas de vente. Il estime que ce document étaye son droit à restitution.','Consid. 5.3.1'),
 ('Il affirme également avoir versé 509’285 FF pour des travaux de rénovation. La participation à certains frais et le montant exact revendiqué doivent être examinés séparément.','Faits B.a; consid. 4'),
 ('Il fait valoir l’importance de la somme versée. Le montant global de sa fortune au moment du versement n’est toutefois pas documenté dans les pièces de cet exercice.','Consid. 5.3.2; délimitation didactique')]),
 doc('D02','Position de la défenderesse','response','Défenderesse',[
 ('La défenderesse, qui a succédé à sa mère dans la procédure, conteste une obligation de restitution. Elle soutient que les fonds destinés à la villa ont été donnés pour compenser la perte de prévoyance liée à la retraite anticipée souhaitée par le compagnon.','Faits C; consid. 5 et 5.4.2'),
 ('Le versement de fonds pour l’acquisition n’est pas contesté. La divergence porte sur sa cause: prêt remboursable selon le demandeur, donation selon la défenderesse.','Faits B.c; consid. 5'),
 ('L’authenticité de la convention manuscrite est contestée. La défenderesse a requis une instruction pénale. Le classement de cette procédure n’a établi ni que la pièce était fausse, ni qu’elle était authentique.','Faits C'),
 ('La participation à des frais de rénovation ne suffit pas, à elle seule, à établir le montant de 509’285 FF allégué par le demandeur.','Faits B.a; consid. 4')]),
 doc('D03','Relevé reconstruit: acquisition et prévoyance','exhibit',None,[
 ('Le jugement rapporte deux transferts, les 25 juin et 25 août 1997, par l’intermédiaire du notaire, pour un total de 2’222’000 FF destiné à l’acquisition. Il ne ventile pas ce total entre les deux dates.','Faits B.a'),
 ('La villa a été achetée le 2 septembre 1997 au prix de 2’000’000 FF. Elle a été revendue le 12 juin 2002 au prix de 403’989,90 euros. Le prix d’achat, le total transféré et le prix de revente sont des montants distincts.','Faits B.a'),
 ('La bénéficiaire a emménagé avec son compagnon le 15 janvier 1999 et pris sa retraite anticipée le 1er février 1999. Sa rente mensuelle était de CHF 4’815, au lieu de CHF 6’990 si elle avait travaillé jusqu’à 62 ans.','Faits A'),
 ('Ce relevé est établi à partir du jugement. Ce n’est ni un relevé bancaire, ni un acte notarié, ni une attestation de la caisse de pension.','Délimitation didactique; aucun fait supplémentaire')]),
 doc('D04','Relevé reconstruit: convention et demandes','exhibit',None,[
 ('Une convention manuscrite porte la date du 30 septembre 1997. Elle a été remise à la juridiction civile par un inconnu en 2012. La date portée sur la pièce et la date de son apparition en procédure ne doivent pas être confondues.','Faits C'),
 ('La procédure pénale s’est terminée par un classement: le caractère faux de la pièce n’a pas pu être prouvé; son authenticité n’a pas non plus été démontrée. Aucune copie de la convention ou de l’expertise n’est jointe à cet exercice.','Faits C; délimitation didactique'),
 ('Le 31 juillet 2003, après avoir appris la vente, le demandeur a réclamé CHF 412’500, correspondant à 1’650’000 FF, avec réserve du solde. Les 28 janvier et 26 juillet 2005, il a demandé 2’650’000 FF.','Faits B.b'),
 ('Le présent relevé décrit les pièces et démarches telles que rapportées dans le jugement. Il ne certifie ni leur authenticité ni une obligation de remboursement.','Délimitation didactique; aucun fait supplémentaire')])]),
case('IT-01','it','La scadenza della prima rata','5A_121/2021','2022-04-06','it',
 ['Fatti A.a–A.b','Consid. 2.1.1–2.2.2','Consid. 3.1–3.3','Dispositivo 1'],[
 doc('D01','Posizione del creditore','claim','Creditore',[
 ('Il creditore chiede il rigetto provvisorio dell’opposizione per CHF 435’000, corrispondenti alla prima rata prevista dal contratto del 14 ottobre 2019. La scadenza indicata è il 31 dicembre 2019.','Fatti A.b; consid. 3.1'),
 ('Sostiene che l’obbligo e la scadenza emergano dal contratto. Il titolo prevede quattro rate e una clausola relativa all’eventuale proroga dell’ultima data di rimborso.','Fatti A.a; consid. 3.1'),
 ('Secondo questa posizione, la denominazione di prestito mezzanino postergato non introduce nel testo una condizione inespressa per il pagamento della prima rata.','Consid. 3.1, 3.3')]),
 doc('D02','Posizione della debitrice','response','Debitrice',[
 ('La società debitrice non contesta di avere ricevuto la somma prestata e non mette in dubbio di dover rimborsare CHF 435’000. Contesta il momento dell’esigibilità.','Consid. 3.2–3.3'),
 ('Sostiene che la natura del prestito mezzanino postergato renda il rimborso subordinato alla revoca della postergazione, la quale dipenderebbe dall’assenza di sovraindebitamento.','Consid. 3.2'),
 ('Secondo la debitrice tutte le date di rimborso sarebbero state prorogate, non soltanto l’ultima. Si tratta della sua interpretazione del contratto; non di una dichiarazione aggiuntiva del creditore riportata nel testo.','Consid. 3.2; distinzione redazionale'),
 ('La controversia riguarda il rigetto provvisorio dell’opposizione. L’esercizio non contiene gli atti di un’eventuale causa ordinaria sul credito.','Consid. 2.1.1, 3.3; delimitazione didattica')]),
 doc('D03','Estratto ricostruito: accordo del 2019','exhibit',None,[
 ('Il 14 ottobre 2019 le parti hanno concluso un contratto di prestito mezzanino postergato per CHF 2’415’000, destinato a regolarizzare le rispettive posizioni e a stabilire nuove condizioni e termini.','Fatti A.a'),
 ('Il punto 4 indica le rate: CHF 435’000 al 31 dicembre 2019; CHF 660’000 al 31 dicembre 2020; CHF 660’000 al 31 dicembre 2021; CHF 660’000 al 31 dicembre 2022.','Fatti A.a'),
 ('La clausola successiva riguarda l’eventuale proroga dell’ultima data di rimborso. In tale caso prevede la disdetta alle scadenze semestrali del 30 giugno e del 31 dicembre, con tre mesi di preavviso mediante lettera raccomandata.','Fatti A.a'),
 ('Questa è una sintesi del contenuto contrattuale riportato nella sentenza, non una trascrizione integrale né una copia firmata del contratto.','Delimitazione didattica; nessun fatto aggiunto')]),
 doc('D04','Estratto ricostruito: rapporti e procedura','exhibit',None,[
 ('16 dicembre 2015: è concluso un precedente prestito di CHF 1’500’000, con due rate di CHF 750’000 al 31 dicembre 2018 e al 31 dicembre 2019.','Fatti A.a'),
 ('7 ottobre 2019: mediante novazione la debitrice subentra a un’altra società in un prestito di CHF 1’215’000 accordato il 1° febbraio 2019. Segue il nuovo accordo del 14 ottobre 2019 per CHF 2’415’000. Il presente estratto non ricostruisce i movimenti di liquidazione fra i contratti.','Fatti A.a; delimitazione didattica'),
 ('8 gennaio 2020: il creditore avvia l’esecuzione per CHF 435’000 oltre interessi e per ulteriori CHF 180’000 oltre interessi a titolo di partecipazione agli utili per gli anni 2017 e 2018. La debitrice interpone opposizione.','Fatti A.b'),
 ('L’esercizio è limitato alla prima rata di CHF 435’000. Non contiene un bilancio della debitrice, una revoca della postergazione o le ricevute bancarie originali. L’assenza da questo fascicolo non prova che tali documenti non esistano.','Perimetro: consid. 1.1, 3; delimitazione didattica')])]),
case('EN-01','en','Authority to sign a winter lease','4A_421/2015','2016-02-11','de',
 ['Facts A, B, B.a','Considerations 4–4.3.2','Operative part 1'],[
 doc('D01','Tenant company’s position','claim','Tenant company',[
 ('The tenant company denies that it owes the CHF 10,000 covered by the provisional debt-enforcement ruling. It maintains that its employee signed the winter lease without authority binding the company.','Facts B–B.a; consideration 4.2'),
 ('The managing director acknowledges an internal authorisation in an email but says she withdrew it in a subsequent telephone call. The company relies on that alleged withdrawal to dispute the employee’s authority.','Consideration 4.3.1'),
 ('The company also argues that the employee acted for her own benefit rather than for the company. The employee’s later dismissal and the director’s cancellation request are part of its account of the dispute.','Facts A; consideration 4.2, 4.3.2')]),
 doc('D02','Landlord company’s position','response','Landlord company',[
 ('The landlord treats the winter lease as binding on the tenant company. It had sent a countersigned contract and received it back with a covering letter dated 20 November 2013, signed by the employee.','Facts A; consideration 4.1'),
 ('The landlord relies on the email exchange of 13 November 2013 as evidence that the managing director authorised the employee to sign. Its position is that the employee signed for the company, even though she used the director’s name.','Consideration 4.1, 4.3.1–4.3.2'),
 ('After receiving a cancellation request, the landlord stated that a fixed-term lease had been concluded and could not be terminated in that way. The scope of authority and the effect of the later communication remain separate questions.','Facts A; editorial separation of issues')]),
 doc('D03','Reconstructed exhibit: email sequence','exhibit',None,[
 ('13 November 2013, 12:00: the employee tells the managing director that the landlord needs the signed lease by the end of that week and asks whether changes are needed.','Consideration 4.3.1'),
 ('Nineteen minutes later, the director replies: “Ok just sign it please”. At 13:20 the subsequent conversation ends with the director’s message: “There’s no problem. Just asked”. These short English phrases are quoted in the German judgment; the surrounding account is an English reconstruction.','Consideration 4.3.1; two original English quotations'),
 ('The director later alleged a telephone withdrawal of authority. This exercise contains no recording, telephone log or separate contemporaneous written withdrawal. The judgment reports that the other exhibits relied on did not even mention the calls.','Consideration 4.3.1; exercise-file limitation'),
 ('This page is not an original email export. It preserves the reported sequence without inventing email addresses, headers, attachments or a transcript of the alleged call.','Didactic boundary; no additional case fact')]),
 doc('D04','Reconstructed exhibit: lease and later events','exhibit',None,[
 ('23 October 2013: the director negotiates a new lease of the same holiday apartment for 15 December 2013 to 15 March 2014. She intends to make it available to her employee for part of the winter season.','Facts A'),
 ('The returned lease bears a signature readable as the director’s name. It is accepted in the appeal that the employee made that signature. The covering letter is dated 20 November 2013. The evidence does not equate the covering-letter date with a separately established signing time.','Facts A; consideration 4; editorial distinction'),
 ('29 November 2013: the director asks for cancellation and dismisses the employee. On 13 December 2013 the landlord sends an invoice. The director refers to her earlier cancellation and says that the employee signed and no longer works for her.','Facts A'),
 ('The landlord sought provisional enforcement of CHF 20,000. On 28 February 2014 the court allowed CHF 10,000 plus interest because the remaining CHF 10,000 was not yet due when enforcement began. The two amounts must not be merged into a finding that the full claim was already due.','Facts B')])])
]

filing=json.loads((ROOT/'filing.json').read_text())
for item in cases:
 arrangement=next(value for value in filing['cases'] if value['id']==item['id'])
 for index,document in enumerate(item['documents']):
  if index<2:document['party_label']=arrangement['parties'][index]['label']

labels={
 'de':{'notice':'Rekonstruierte Übungsunterlage. Kein Originalakt.','sub':'Nach einem veröffentlichten Schweizer Urteil','source':'Grundlage','paragraph':'Absatz','footer':'Nur für die freiwillige Fallübung'},
 'fr':{'notice':'Document d’exercice reconstruit. Ce n’est pas une pièce originale.','sub':'D’après un arrêt suisse publié','source':'Source','paragraph':'Paragraphe','footer':'Dossier facultatif d’exercice'},
 'it':{'notice':'Documento didattico ricostruito. Non è un atto originale.','sub':'Da una sentenza svizzera pubblicata','source':'Fonte','paragraph':'Paragrafo','footer':'Fascicolo facoltativo di esercitazione'},
 'en':{'notice':'Reconstructed exercise document. Not an original case record.','sub':'Unofficial English reconstruction of a Swiss judgment in German','source':'Source','paragraph':'Paragraph','footer':'Optional case exercise'}
}
for language,notice in {'de':' Personen- und Firmennamen sind erfunden.','fr':' Les noms de personnes et de sociétés sont fictifs.','it':' I nomi di persone e società sono inventati.','en':' Person and company names are fictitious.'}.items():labels[language]['sub']=labels[language]['sub'].rstrip('.')+'.'+notice
payload={'version':1,'created':'2026-10-10','author':'Jonas Hertner / CourtOS','cases':cases,'labels':labels,'source_policy':'Published judgments only. No original party pleadings or underlying exhibits were obtained. All four input documents per matter are expressly reconstructed exercise documents. Quoted English phrases are separately marked. No signatures, letterheads or fabricated evidence images.'}
(ROOT/'content.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(cases),'cases and',sum(len(c['documents']) for c in cases),'documents')
