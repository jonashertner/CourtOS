import type { CaseReviewRole } from "@mike/contracts";
import type { CourtOSLocale } from "./courtosLocale";

export type ExampleMatter = { id: string; caseNumber:string; caseNumberLabel:string; parties:readonly {label:string;submissions:string;exhibits:string}[]; sharedFolder:string;partyNote:string;language: CourtOSLocale; title: string; judgment: {court:string;number:string;date:string;url:string;original_language:string;locators:readonly string[]}; documents: readonly {id:string;title:string;role:CaseReviewRole;party:string;folders:readonly string[];previousEditions:readonly {sha256:string;bytes:number}[];filename:string;path:string;sha256:string;bytes:number}[];textBytes:number};

// Generated from the reviewed docs/examples sources. No answer key enters this catalog.
export const EXAMPLE_MATTERS: readonly ExampleMatter[] = [
  {
    "id": "DE-01",
    "caseNumber": "CourtOS-UE-2026-001",
    "caseNumberLabel": "Fiktives Aktenzeichen",
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
    "sharedFolder": "Gemeinsame rekonstruierte Belegauszüge",
    "partyNote": "",
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
        "party": "A.________ AG · Vermieterin",
        "folders": [
          "A.________ AG · Vermieterin",
          "Eingaben"
        ],
        "previousEditions": [
          {
            "sha256": "b2b04c04f099e5cc80e209c14410d1fc9b8a7aab38b04314ab2f51c5170268d1",
            "bytes": 35715
          }
        ],
        "filename": "CourtOS_DE-01_D01.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D01.pdf",
        "sha256": "48463b85015d106997cb051cbedf053230c1ead27e5681a0d9d5378634a39745",
        "bytes": 35808
      },
      {
        "id": "D02",
        "title": "Standpunkt der Mieter",
        "role": "response",
        "party": "B.B.________ und C.B.________ · Mieter",
        "folders": [
          "B.B.________ und C.B.________ · Mieter",
          "Eingaben"
        ],
        "previousEditions": [
          {
            "sha256": "648169552b0c0b8ebaaeca6e83e58f3191db2531d8bd5430a14836b2f7dea7d0",
            "bytes": 35792
          }
        ],
        "filename": "CourtOS_DE-01_D02.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D02.pdf",
        "sha256": "801225b4e42c3903ba6045cd1b98fda6d5f79d467710123fb50f8528e8e23e75",
        "bytes": 35886
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
          }
        ],
        "filename": "CourtOS_DE-01_D03.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D03.pdf",
        "sha256": "e7a05de5746fca4c16ff088909ef881f1fe9cc676e84001c22e4193a46721ce5",
        "bytes": 35826
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
          }
        ],
        "filename": "CourtOS_DE-01_D04.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D04.pdf",
        "sha256": "0a9c6d8e9cf6049c0ef15710dcd86aeff5fd473467ca7d0c8a11f3d86965a6c9",
        "bytes": 35936
      }
    ],
    "textBytes": 4459
  },
  {
    "id": "FR-01",
    "caseNumber": "CourtOS-UE-2026-002",
    "caseNumberLabel": "Numéro de cause fictif",
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
    "sharedFolder": "Extraits communs reconstruits",
    "partyNote": "Z.________: destinataire initiale, décédée le 16.06.2009. A.Z.________: fille et successeure dans la procédure.",
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
        "party": "X.________ · Demandeur",
        "folders": [
          "X.________ · Demandeur",
          "Écritures"
        ],
        "previousEditions": [
          {
            "sha256": "5aac96663761ff916df01e284495cc4aaa5d588fa830387271b1d59d9ec69567",
            "bytes": 35848
          }
        ],
        "filename": "CourtOS_FR-01_D01.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D01.pdf",
        "sha256": "a4fd651fa6192b8178ac2482f31dc5d93baa4c2e136e2e3f8ff08eabd8fca447",
        "bytes": 35945
      },
      {
        "id": "D02",
        "title": "Position de la défenderesse",
        "role": "response",
        "party": "A.Z.________ · Successeure de Z.________",
        "folders": [
          "A.Z.________ · Successeure de Z.________",
          "Écritures"
        ],
        "previousEditions": [
          {
            "sha256": "2c8c377f74f9898b2f985e987bee6c4d8eed700514eb7554942878f2de00a85a",
            "bytes": 35813
          }
        ],
        "filename": "CourtOS_FR-01_D02.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D02.pdf",
        "sha256": "2dc4598787b8c8827689e048972df10224e27497a8035152ea9f131431ba39da",
        "bytes": 35988
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
          }
        ],
        "filename": "CourtOS_FR-01_D03.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D03.pdf",
        "sha256": "0ded036cf5edf3d6d0f4876f7aaa02bd3758a1b970996a879fbc232415198389",
        "bytes": 35942
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
          }
        ],
        "filename": "CourtOS_FR-01_D04.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D04.pdf",
        "sha256": "33616846d872799b5753bfcdf7095a0bc49033f31bd04362c9e83bb9ed307c9a",
        "bytes": 35997
      }
    ],
    "textBytes": 5023
  },
  {
    "id": "IT-01",
    "caseNumber": "CourtOS-UE-2026-003",
    "caseNumberLabel": "Numero di causa fittizio",
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
    "sharedFolder": "Estratti comuni ricostruiti",
    "partyNote": "",
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
        "party": "B.________ · Creditore",
        "folders": [
          "B.________ · Creditore",
          "Atti"
        ],
        "previousEditions": [
          {
            "sha256": "0f10af14c51ba4b41f93b0caf079b5934e7c124f83cee2c89cc18c781726ebd9",
            "bytes": 35410
          }
        ],
        "filename": "CourtOS_IT-01_D01.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D01.pdf",
        "sha256": "f890c2ef7577b70af2eabfc8d7baca7c38cd1604ee9a6659414527a7db7df91c",
        "bytes": 35508
      },
      {
        "id": "D02",
        "title": "Posizione della debitrice",
        "role": "response",
        "party": "A.________ SA · Debitrice",
        "folders": [
          "A.________ SA · Debitrice",
          "Atti"
        ],
        "previousEditions": [
          {
            "sha256": "faf1ab46308649a6a6bea4098d0ab114f51a5d577badd862fb36c56d15f04109",
            "bytes": 35560
          }
        ],
        "filename": "CourtOS_IT-01_D02.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D02.pdf",
        "sha256": "f515822c24790f71d2c3a7e6f5f28b1c4d7992701617e8f32c45b7500033d93d",
        "bytes": 35661
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
          }
        ],
        "filename": "CourtOS_IT-01_D03.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D03.pdf",
        "sha256": "06e3d7bbc88798aa1cdb0e39845b2baf50e68915e1b95b0f5d356463d3ae542c",
        "bytes": 35665
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
          }
        ],
        "filename": "CourtOS_IT-01_D04.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D04.pdf",
        "sha256": "403ee7d307db3c52da23c37b588d9f25933f57a2e447b243248aa6c776d94c15",
        "bytes": 35874
      }
    ],
    "textBytes": 4416
  },
  {
    "id": "EN-01",
    "caseNumber": "CourtOS-UE-2026-004",
    "caseNumberLabel": "Fictitious case number",
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
    "sharedFolder": "Shared reconstructed exhibit summaries",
    "partyNote": "",
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
        "party": "A.________GmbH · Tenant",
        "folders": [
          "A.________GmbH · Tenant",
          "Submissions"
        ],
        "previousEditions": [
          {
            "sha256": "dbfda59cb7e626368d52739e5c63e44e153ad48de4bf9a5f5cf9d9e9c69940b1",
            "bytes": 35389
          }
        ],
        "filename": "CourtOS_EN-01_D01.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D01.pdf",
        "sha256": "f7749afffa93d7125fdfdaa11a25fe1fdf953fe7a08e87adf1634cbcd283bbcf",
        "bytes": 35495
      },
      {
        "id": "D02",
        "title": "Landlord company’s position",
        "role": "response",
        "party": "B.________AG · Landlord",
        "folders": [
          "B.________AG · Landlord",
          "Submissions"
        ],
        "previousEditions": [
          {
            "sha256": "00e20ad6223baab20d49c7ed480f3e425f2b07f577ceed81680b9749936f98ff",
            "bytes": 35399
          }
        ],
        "filename": "CourtOS_EN-01_D02.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D02.pdf",
        "sha256": "587057c7251303f4f95e0ffb05c6b9dc14a4e216c0731588a547f6d071db102f",
        "bytes": 35503
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
          }
        ],
        "filename": "CourtOS_EN-01_D03.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D03.pdf",
        "sha256": "bb2e6e4edc2d127a5d8970a4cbc1b42beed901cf23100e436ca6599c5f5ba769",
        "bytes": 35733
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
          }
        ],
        "filename": "CourtOS_EN-01_D04.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D04.pdf",
        "sha256": "800698ec9eea100bbaa5e441fa556c9e52a981fbb74a766dc9c92e9a41a92088",
        "bytes": 35745
      }
    ],
    "textBytes": 4796
  }
];
