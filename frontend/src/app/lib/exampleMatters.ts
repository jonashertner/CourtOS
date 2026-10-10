import type { CaseReviewRole } from "@mike/contracts";
import type { CourtOSLocale } from "./courtosLocale";

type ExampleParty = {label:string;submissions:string;exhibits:string};
export type ExampleMatter = { id: string; caseNumber:string; legacyFiling:{caseNumber:string;parties:readonly ExampleParty[];sharedFolder:string}; caseNumberLabel:string; parties:readonly ExampleParty[]; sharedFolder:string;partyNote:string;language: CourtOSLocale; title: string; judgment: {court:string;number:string;date:string;url:string;original_language:string;locators:readonly string[]}; documents: readonly {id:string;title:string;role:CaseReviewRole;party:string;folders:readonly string[];previousEditions:readonly {sha256:string;bytes:number}[];previousFilenames:readonly string[];filename:string;path:string;sha256:string;bytes:number}[];textBytes:number};

// Generated from the reviewed docs/examples sources. No answer key enters this catalog.
export const EXAMPLE_MATTERS: readonly ExampleMatter[] = [
  {
    "id": "DE-01",
    "caseNumber": "FV.2026.117",
    "legacyFiling": {
      "caseNumber": "CourtOS-UE-2026-001",
      "parties": [
        {
          "label": "A.________ AG · Vermieterin",
          "submissions": "Eingaben",
          "exhibits": "Beilagen"
        },
        {
          "label": "B.B.________ und C.B.________ · Mieter",
          "submissions": "Eingaben",
          "exhibits": "Beilagen"
        }
      ],
      "sharedFolder": "Gemeinsame rekonstruierte Belegauszüge"
    },
    "caseNumberLabel": "Fiktives Aktenzeichen",
    "parties": [
      {
        "label": "Bergtal Immobilien AG · Vermieterin",
        "submissions": "Eingaben",
        "exhibits": "Beilagen"
      },
      {
        "label": "Mara und Lukas Meier · Mieter",
        "submissions": "Eingaben",
        "exhibits": "Beilagen"
      }
    ],
    "sharedFolder": "Gemeinsame rekonstruierte Belegauszüge",
    "partyNote": "Alle Personen- und Firmennamen sind für diese Übung erfunden; die Rollen folgen dem veröffentlichten Urteil.",
    "language": "de",
    "title": "Indexmiete und Herabsetzungsbegehren",
    "judgment": {
      "court": "Schweizerisches Bundesgericht",
      "number": "4A_252/2023",
      "date": "2023-10-24",
      "original_language": "de",
      "url": "https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F24-10-2023-4A_252-2023&lang=de&type=show_document",
      "locators": [
        "Sachverhalt A.a–A.b, B.a–B.d",
        "E. 2",
        "E. 3.1–3.6",
        "Dispositiv 1"
      ]
    },
    "documents": [
      {
        "id": "D01",
        "title": "Standpunkt der Vermieterin",
        "role": "claim",
        "party": "Bergtal Immobilien AG · Vermieterin",
        "folders": [
          "Bergtal Immobilien AG · Vermieterin",
          "Eingaben"
        ],
        "previousEditions": [
          {
            "sha256": "b2b04c04f099e5cc80e209c14410d1fc9b8a7aab38b04314ab2f51c5170268d1",
            "bytes": 35715
          },
          {
            "sha256": "48463b85015d106997cb051cbedf053230c1ead27e5681a0d9d5378634a39745",
            "bytes": 35808
          }
        ],
        "previousFilenames": [
          "CourtOS_DE-01_D01.pdf"
        ],
        "filename": "01 Standpunkt Bergtal Immobilien AG.pdf",
        "path": "/examples/DE-01/D01.pdf",
        "sha256": "a0488cbd6e4137fde15e2a88fb6bbd49e4c5e9099b7a53e9140ae713488e0e06",
        "bytes": 35837
      },
      {
        "id": "D02",
        "title": "Standpunkt der Mieter",
        "role": "response",
        "party": "Mara und Lukas Meier · Mieter",
        "folders": [
          "Mara und Lukas Meier · Mieter",
          "Eingaben"
        ],
        "previousEditions": [
          {
            "sha256": "648169552b0c0b8ebaaeca6e83e58f3191db2531d8bd5430a14836b2f7dea7d0",
            "bytes": 35792
          },
          {
            "sha256": "801225b4e42c3903ba6045cd1b98fda6d5f79d467710123fb50f8528e8e23e75",
            "bytes": 35886
          }
        ],
        "previousFilenames": [
          "CourtOS_DE-01_D02.pdf"
        ],
        "filename": "02 Standpunkt Mara und Lukas Meier.pdf",
        "path": "/examples/DE-01/D02.pdf",
        "sha256": "4697ad530727dfab42dfb950da685a0a0b196e9ae16b5c5bfe781f949f742b92",
        "bytes": 35906
      },
      {
        "id": "D03",
        "title": "Belegauszug: Vertragsdaten",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Gemeinsame rekonstruierte Belegauszüge"
        ],
        "previousEditions": [
          {
            "sha256": "eea02566829566e5f0591563a111ce515316a1100db887e244dba570b84f1703",
            "bytes": 35761
          },
          {
            "sha256": "e7a05de5746fca4c16ff088909ef881f1fe9cc676e84001c22e4193a46721ce5",
            "bytes": 35826
          }
        ],
        "previousFilenames": [
          "CourtOS_DE-01_D03.pdf"
        ],
        "filename": "03 Vertragsdaten - rekonstruierter Auszug.pdf",
        "path": "/examples/DE-01/D03.pdf",
        "sha256": "4e2c11212f96b0e7fe34447fd47bc247be8b9ba2aa670c2451b095e94d2ea926",
        "bytes": 35843
      },
      {
        "id": "D04",
        "title": "Belegauszug: Begehren und Mietzins",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Gemeinsame rekonstruierte Belegauszüge"
        ],
        "previousEditions": [
          {
            "sha256": "c095ff562b94cafc8c22b177434f57934fbc5e4b3ca0d274fe202f05f3bac369",
            "bytes": 35871
          },
          {
            "sha256": "0a9c6d8e9cf6049c0ef15710dcd86aeff5fd473467ca7d0c8a11f3d86965a6c9",
            "bytes": 35936
          }
        ],
        "previousFilenames": [
          "CourtOS_DE-01_D04.pdf"
        ],
        "filename": "04 Herabsetzungsbegehren - rekonstruierter Auszug.pdf",
        "path": "/examples/DE-01/D04.pdf",
        "sha256": "d9b6921862066c4a67523de1f29825de2800f68ecdfd55b590025d8f78d49da7",
        "bytes": 35958
      }
    ],
    "textBytes": 4610
  },
  {
    "id": "FR-01",
    "caseNumber": "C.2026.204",
    "legacyFiling": {
      "caseNumber": "CourtOS-UE-2026-002",
      "parties": [
        {
          "label": "X.________ · Demandeur",
          "submissions": "Écritures",
          "exhibits": "Pièces"
        },
        {
          "label": "A.Z.________ · Successeure de Z.________",
          "submissions": "Écritures",
          "exhibits": "Pièces"
        }
      ],
      "sharedFolder": "Extraits communs reconstruits"
    },
    "caseNumberLabel": "Numéro de cause fictif",
    "parties": [
      {
        "label": "Julien Morel · Demandeur",
        "submissions": "Écritures",
        "exhibits": "Pièces"
      },
      {
        "label": "Claire Aubert · Successeure de Madeleine Aubert",
        "submissions": "Écritures",
        "exhibits": "Pièces"
      }
    ],
    "sharedFolder": "Extraits communs reconstruits",
    "partyNote": "Noms fictifs: Madeleine Aubert désigne la destinataire initiale, décédée le 16.06.2009; Claire Aubert, sa fille et successeure dans la procédure.",
    "language": "fr",
    "title": "Un versement pour acquérir une villa",
    "judgment": {
      "court": "Schweizerisches Bundesgericht",
      "number": "4A_635/2016",
      "date": "2018-01-22",
      "original_language": "fr",
      "url": "https://search.bger.ch/ext/eurospider/live/fr/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F22-01-2018-4A_635-2016&lang=fr&type=show_document",
      "locators": [
        "Faits A, B.a–B.c, C",
        "Consid. 4",
        "Consid. 5.1–5.4",
        "Dispositif 1"
      ]
    },
    "documents": [
      {
        "id": "D01",
        "title": "Position du demandeur",
        "role": "claim",
        "party": "Julien Morel · Demandeur",
        "folders": [
          "Julien Morel · Demandeur",
          "Écritures"
        ],
        "previousEditions": [
          {
            "sha256": "5aac96663761ff916df01e284495cc4aaa5d588fa830387271b1d59d9ec69567",
            "bytes": 35848
          },
          {
            "sha256": "a4fd651fa6192b8178ac2482f31dc5d93baa4c2e136e2e3f8ff08eabd8fca447",
            "bytes": 35945
          }
        ],
        "previousFilenames": [
          "CourtOS_FR-01_D01.pdf"
        ],
        "filename": "01 Position de Julien Morel.pdf",
        "path": "/examples/FR-01/D01.pdf",
        "sha256": "8ab1e9a6e944f560e3e69e2681e1fa15590cd1291b896f3cce373dacfbea3d25",
        "bytes": 35967
      },
      {
        "id": "D02",
        "title": "Position de la défenderesse",
        "role": "response",
        "party": "Claire Aubert · Successeure de Madeleine Aubert",
        "folders": [
          "Claire Aubert · Successeure de Madeleine Aubert",
          "Écritures"
        ],
        "previousEditions": [
          {
            "sha256": "2c8c377f74f9898b2f985e987bee6c4d8eed700514eb7554942878f2de00a85a",
            "bytes": 35813
          },
          {
            "sha256": "2dc4598787b8c8827689e048972df10224e27497a8035152ea9f131431ba39da",
            "bytes": 35988
          }
        ],
        "previousFilenames": [
          "CourtOS_FR-01_D02.pdf"
        ],
        "filename": "02 Position de Claire Aubert.pdf",
        "path": "/examples/FR-01/D02.pdf",
        "sha256": "6c5c4ee72da6dbaa2984d3150a68f49720b18ece1cb42815b46824fba118cbd2",
        "bytes": 36043
      },
      {
        "id": "D03",
        "title": "Relevé reconstruit: acquisition et prévoyance",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Extraits communs reconstruits"
        ],
        "previousEditions": [
          {
            "sha256": "062cce01a30d0e5fa543825866d87e932b3e89361f65848b6c4adc7b89d4abd7",
            "bytes": 35872
          },
          {
            "sha256": "0ded036cf5edf3d6d0f4876f7aaa02bd3758a1b970996a879fbc232415198389",
            "bytes": 35942
          }
        ],
        "previousFilenames": [
          "CourtOS_FR-01_D03.pdf"
        ],
        "filename": "03 Acquisition et prevoyance - extrait reconstruit.pdf",
        "path": "/examples/FR-01/D03.pdf",
        "sha256": "d6a2f8940b1621bd73abb1c4604026a16bff9aa225bd1fcad00a0ec9102a46ec",
        "bytes": 35961
      },
      {
        "id": "D04",
        "title": "Relevé reconstruit: convention et demandes",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Extraits communs reconstruits"
        ],
        "previousEditions": [
          {
            "sha256": "57b320a85ccff173a7b19da1443a92f0918d779ccbdb5e0c7eb92d76484dcfa0",
            "bytes": 35927
          },
          {
            "sha256": "33616846d872799b5753bfcdf7095a0bc49033f31bd04362c9e83bb9ed307c9a",
            "bytes": 35997
          }
        ],
        "previousFilenames": [
          "CourtOS_FR-01_D04.pdf"
        ],
        "filename": "04 Convention et demandes - extrait reconstruit.pdf",
        "path": "/examples/FR-01/D04.pdf",
        "sha256": "a16e0f75a07c436b0bfd725c9a90bdcdf485ca4bb839a1eea076f61cc121a618",
        "bytes": 36021
      }
    ],
    "textBytes": 5259
  },
  {
    "id": "IT-01",
    "caseNumber": "OR.2026.83",
    "legacyFiling": {
      "caseNumber": "CourtOS-UE-2026-003",
      "parties": [
        {
          "label": "B.________ · Creditore",
          "submissions": "Atti",
          "exhibits": "Allegati"
        },
        {
          "label": "A.________ SA · Debitrice",
          "submissions": "Atti",
          "exhibits": "Allegati"
        }
      ],
      "sharedFolder": "Estratti comuni ricostruiti"
    },
    "caseNumberLabel": "Numero di causa fittizio",
    "parties": [
      {
        "label": "Luca Bernasconi · Creditore",
        "submissions": "Atti",
        "exhibits": "Allegati"
      },
      {
        "label": "Officine Riva SA · Debitrice",
        "submissions": "Atti",
        "exhibits": "Allegati"
      }
    ],
    "sharedFolder": "Estratti comuni ricostruiti",
    "partyNote": "Tutti i nomi di persone e società sono inventati per questo esercizio; i ruoli seguono la sentenza pubblicata.",
    "language": "it",
    "title": "La scadenza della prima rata",
    "judgment": {
      "court": "Schweizerisches Bundesgericht",
      "number": "5A_121/2021",
      "date": "2022-04-06",
      "original_language": "it",
      "url": "https://search.bger.ch/ext/eurospider/live/it/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F06-04-2022-5A_121-2021&lang=it&type=show_document",
      "locators": [
        "Fatti A.a–A.b",
        "Consid. 2.1.1–2.2.2",
        "Consid. 3.1–3.3",
        "Dispositivo 1"
      ]
    },
    "documents": [
      {
        "id": "D01",
        "title": "Posizione del creditore",
        "role": "claim",
        "party": "Luca Bernasconi · Creditore",
        "folders": [
          "Luca Bernasconi · Creditore",
          "Atti"
        ],
        "previousEditions": [
          {
            "sha256": "0f10af14c51ba4b41f93b0caf079b5934e7c124f83cee2c89cc18c781726ebd9",
            "bytes": 35410
          },
          {
            "sha256": "f890c2ef7577b70af2eabfc8d7baca7c38cd1604ee9a6659414527a7db7df91c",
            "bytes": 35508
          }
        ],
        "previousFilenames": [
          "CourtOS_IT-01_D01.pdf"
        ],
        "filename": "01 Posizione di Luca Bernasconi.pdf",
        "path": "/examples/IT-01/D01.pdf",
        "sha256": "7281e191995bb4b2226b04795f8ad2be7d5bdeffe857c5432652f2c90dcc3ddc",
        "bytes": 35591
      },
      {
        "id": "D02",
        "title": "Posizione della debitrice",
        "role": "response",
        "party": "Officine Riva SA · Debitrice",
        "folders": [
          "Officine Riva SA · Debitrice",
          "Atti"
        ],
        "previousEditions": [
          {
            "sha256": "faf1ab46308649a6a6bea4098d0ab114f51a5d577badd862fb36c56d15f04109",
            "bytes": 35560
          },
          {
            "sha256": "f515822c24790f71d2c3a7e6f5f28b1c4d7992701617e8f32c45b7500033d93d",
            "bytes": 35661
          }
        ],
        "previousFilenames": [
          "CourtOS_IT-01_D02.pdf"
        ],
        "filename": "02 Posizione di Officine Riva SA.pdf",
        "path": "/examples/IT-01/D02.pdf",
        "sha256": "26abd7443aa62d88206cfe4c53155d641e159593517446b790a6db369a805c25",
        "bytes": 35735
      },
      {
        "id": "D03",
        "title": "Estratto ricostruito: accordo del 2019",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Estratti comuni ricostruiti"
        ],
        "previousEditions": [
          {
            "sha256": "13ff3410fc4f819d88a2e46f3c2601a890d6d8d2e7d1a042ffe5eae6e4386a4b",
            "bytes": 35603
          },
          {
            "sha256": "06e3d7bbc88798aa1cdb0e39845b2baf50e68915e1b95b0f5d356463d3ae542c",
            "bytes": 35665
          }
        ],
        "previousFilenames": [
          "CourtOS_IT-01_D03.pdf"
        ],
        "filename": "03 Accordo del 2019 - estratto ricostruito.pdf",
        "path": "/examples/IT-01/D03.pdf",
        "sha256": "0a4847657fdb5f5e02a0bd671424b057e6462fd5e2a57bd7d1aa859ca984136f",
        "bytes": 35743
      },
      {
        "id": "D04",
        "title": "Estratto ricostruito: rapporti e procedura",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Estratti comuni ricostruiti"
        ],
        "previousEditions": [
          {
            "sha256": "50c91caa88d0e4f3b821b8103a5c0aecbb1fece2842a700923dbda4932d81def",
            "bytes": 35806
          },
          {
            "sha256": "403ee7d307db3c52da23c37b588d9f25933f57a2e447b243248aa6c776d94c15",
            "bytes": 35874
          }
        ],
        "previousFilenames": [
          "CourtOS_IT-01_D04.pdf"
        ],
        "filename": "04 Rapporti e procedura - estratto ricostruito.pdf",
        "path": "/examples/IT-01/D04.pdf",
        "sha256": "83dc0bc7a2ddf9dbd26294590fb805529314d135d271d7429fb798c47c296d43",
        "bytes": 35952
      }
    ],
    "textBytes": 4584
  },
  {
    "id": "EN-01",
    "caseNumber": "HG.2026.42",
    "legacyFiling": {
      "caseNumber": "CourtOS-UE-2026-004",
      "parties": [
        {
          "label": "A.________GmbH · Tenant",
          "submissions": "Submissions",
          "exhibits": "Exhibits"
        },
        {
          "label": "B.________AG · Landlord",
          "submissions": "Submissions",
          "exhibits": "Exhibits"
        }
      ],
      "sharedFolder": "Shared reconstructed exhibit summaries"
    },
    "caseNumberLabel": "Fictitious case number",
    "parties": [
      {
        "label": "Alpine Lodge GmbH · Tenant",
        "submissions": "Submissions",
        "exhibits": "Exhibits"
      },
      {
        "label": "Seeblick Immobilien AG · Landlord",
        "submissions": "Submissions",
        "exhibits": "Exhibits"
      }
    ],
    "sharedFolder": "Shared reconstructed exhibit summaries",
    "partyNote": "All person and company names are invented for this exercise; their roles follow the published judgment.",
    "language": "en",
    "title": "Authority to sign a winter lease",
    "judgment": {
      "court": "Schweizerisches Bundesgericht",
      "number": "4A_421/2015",
      "date": "2016-02-11",
      "original_language": "de",
      "url": "https://search.bger.ch/ext/eurospider/live/de/php/aza/http/index.php?highlight_docid=aza%3A%2F%2F11-02-2016-4A_421-2015&lang=de&type=show_document",
      "locators": [
        "Facts A, B, B.a",
        "Considerations 4–4.3.2",
        "Operative part 1"
      ]
    },
    "documents": [
      {
        "id": "D01",
        "title": "Tenant company’s position",
        "role": "claim",
        "party": "Alpine Lodge GmbH · Tenant",
        "folders": [
          "Alpine Lodge GmbH · Tenant",
          "Submissions"
        ],
        "previousEditions": [
          {
            "sha256": "dbfda59cb7e626368d52739e5c63e44e153ad48de4bf9a5f5cf9d9e9c69940b1",
            "bytes": 35389
          },
          {
            "sha256": "f7749afffa93d7125fdfdaa11a25fe1fdf953fe7a08e87adf1634cbcd283bbcf",
            "bytes": 35495
          }
        ],
        "previousFilenames": [
          "CourtOS_EN-01_D01.pdf"
        ],
        "filename": "01 Position of Alpine Lodge GmbH.pdf",
        "path": "/examples/EN-01/D01.pdf",
        "sha256": "a529686750602e3b496468ea9d48ff6b5b7e545b6ead15b1e3cffa21c7452ddc",
        "bytes": 35514
      },
      {
        "id": "D02",
        "title": "Landlord company’s position",
        "role": "response",
        "party": "Seeblick Immobilien AG · Landlord",
        "folders": [
          "Seeblick Immobilien AG · Landlord",
          "Submissions"
        ],
        "previousEditions": [
          {
            "sha256": "00e20ad6223baab20d49c7ed480f3e425f2b07f577ceed81680b9749936f98ff",
            "bytes": 35399
          },
          {
            "sha256": "587057c7251303f4f95e0ffb05c6b9dc14a4e216c0731588a547f6d071db102f",
            "bytes": 35503
          }
        ],
        "previousFilenames": [
          "CourtOS_EN-01_D02.pdf"
        ],
        "filename": "02 Position of Seeblick Immobilien AG.pdf",
        "path": "/examples/EN-01/D02.pdf",
        "sha256": "2e28e4cda97de2c80a6c19d78d8d3b78890675df848ddcc269cca956fb588067",
        "bytes": 35523
      },
      {
        "id": "D03",
        "title": "Reconstructed exhibit: email sequence",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Shared reconstructed exhibit summaries"
        ],
        "previousEditions": [
          {
            "sha256": "a1548dd518c61c91e93cecaeb5b20437f4a0243d50bf017f2b0fcaa8155a9bba",
            "bytes": 35670
          },
          {
            "sha256": "bb2e6e4edc2d127a5d8970a4cbc1b42beed901cf23100e436ca6599c5f5ba769",
            "bytes": 35733
          }
        ],
        "previousFilenames": [
          "CourtOS_EN-01_D03.pdf"
        ],
        "filename": "03 Email sequence - reconstructed extract.pdf",
        "path": "/examples/EN-01/D03.pdf",
        "sha256": "8d694350bb449769dea840b97ad429fb2c11a3f271c9a37730d018ed306f809b",
        "bytes": 35746
      },
      {
        "id": "D04",
        "title": "Reconstructed exhibit: lease and later events",
        "role": "exhibit",
        "party": "",
        "folders": [
          "Shared reconstructed exhibit summaries"
        ],
        "previousEditions": [
          {
            "sha256": "83593588219a51aa6d22f229218dcf24f76c2c082e7a3556022ad4d3c861f6bc",
            "bytes": 35687
          },
          {
            "sha256": "800698ec9eea100bbaa5e441fa556c9e52a981fbb74a766dc9c92e9a41a92088",
            "bytes": 35745
          }
        ],
        "previousFilenames": [
          "CourtOS_EN-01_D04.pdf"
        ],
        "filename": "04 Lease and later events - reconstructed extract.pdf",
        "path": "/examples/EN-01/D04.pdf",
        "sha256": "48a5669e8c5076d9a6bbe5a4fa1dd611d4fe6a034d81599e8cc40debe4854a0b",
        "bytes": 35760
      }
    ],
    "textBytes": 4953
  }
];
