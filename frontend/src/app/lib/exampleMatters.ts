import type { CaseReviewRole } from "@mike/contracts";
import type { CourtOSLocale } from "./courtosLocale";

export type ExampleMatter = { id: string; language: CourtOSLocale; title: string; judgment: {court:string;number:string;date:string;url:string;original_language:string;locators:readonly string[]}; documents: readonly {id:string;title:string;role:CaseReviewRole;party:string;filename:string;path:string;sha256:string;bytes:number}[];textBytes:number};

// Generated from the reviewed docs/examples sources. No answer key enters this catalog.
export const EXAMPLE_MATTERS: readonly ExampleMatter[] = [
  {
    "id": "DE-01",
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
        "party": "Vermieterin",
        "filename": "CourtOS_DE-01_D01.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D01.pdf",
        "sha256": "b2b04c04f099e5cc80e209c14410d1fc9b8a7aab38b04314ab2f51c5170268d1",
        "bytes": 35715
      },
      {
        "id": "D02",
        "title": "Standpunkt der Mieter",
        "role": "response",
        "party": "Mieter",
        "filename": "CourtOS_DE-01_D02.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D02.pdf",
        "sha256": "648169552b0c0b8ebaaeca6e83e58f3191db2531d8bd5430a14836b2f7dea7d0",
        "bytes": 35792
      },
      {
        "id": "D03",
        "title": "Belegauszug: Vertragsdaten",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_DE-01_D03.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D03.pdf",
        "sha256": "eea02566829566e5f0591563a111ce515316a1100db887e244dba570b84f1703",
        "bytes": 35761
      },
      {
        "id": "D04",
        "title": "Belegauszug: Begehren und Mietzins",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_DE-01_D04.pdf",
        "path": "/examples/DE-01/CourtOS_DE-01_D04.pdf",
        "sha256": "c095ff562b94cafc8c22b177434f57934fbc5e4b3ca0d274fe202f05f3bac369",
        "bytes": 35871
      }
    ],
    "textBytes": 4138
  },
  {
    "id": "FR-01",
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
        "party": "Demandeur",
        "filename": "CourtOS_FR-01_D01.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D01.pdf",
        "sha256": "5aac96663761ff916df01e284495cc4aaa5d588fa830387271b1d59d9ec69567",
        "bytes": 35848
      },
      {
        "id": "D02",
        "title": "Position de la défenderesse",
        "role": "response",
        "party": "Défenderesse",
        "filename": "CourtOS_FR-01_D02.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D02.pdf",
        "sha256": "2c8c377f74f9898b2f985e987bee6c4d8eed700514eb7554942878f2de00a85a",
        "bytes": 35813
      },
      {
        "id": "D03",
        "title": "Relevé reconstruit: acquisition et prévoyance",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_FR-01_D03.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D03.pdf",
        "sha256": "062cce01a30d0e5fa543825866d87e932b3e89361f65848b6c4adc7b89d4abd7",
        "bytes": 35872
      },
      {
        "id": "D04",
        "title": "Relevé reconstruit: convention et demandes",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_FR-01_D04.pdf",
        "path": "/examples/FR-01/CourtOS_FR-01_D04.pdf",
        "sha256": "57b320a85ccff173a7b19da1443a92f0918d779ccbdb5e0c7eb92d76484dcfa0",
        "bytes": 35927
      }
    ],
    "textBytes": 4601
  },
  {
    "id": "IT-01",
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
        "party": "Creditore",
        "filename": "CourtOS_IT-01_D01.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D01.pdf",
        "sha256": "0f10af14c51ba4b41f93b0caf079b5934e7c124f83cee2c89cc18c781726ebd9",
        "bytes": 35410
      },
      {
        "id": "D02",
        "title": "Posizione della debitrice",
        "role": "response",
        "party": "Debitrice",
        "filename": "CourtOS_IT-01_D02.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D02.pdf",
        "sha256": "faf1ab46308649a6a6bea4098d0ab114f51a5d577badd862fb36c56d15f04109",
        "bytes": 35560
      },
      {
        "id": "D03",
        "title": "Estratto ricostruito: accordo del 2019",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_IT-01_D03.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D03.pdf",
        "sha256": "13ff3410fc4f819d88a2e46f3c2601a890d6d8d2e7d1a042ffe5eae6e4386a4b",
        "bytes": 35603
      },
      {
        "id": "D04",
        "title": "Estratto ricostruito: rapporti e procedura",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_IT-01_D04.pdf",
        "path": "/examples/IT-01/CourtOS_IT-01_D04.pdf",
        "sha256": "50c91caa88d0e4f3b821b8103a5c0aecbb1fece2842a700923dbda4932d81def",
        "bytes": 35806
      }
    ],
    "textBytes": 4125
  },
  {
    "id": "EN-01",
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
        "party": "Tenant company",
        "filename": "CourtOS_EN-01_D01.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D01.pdf",
        "sha256": "dbfda59cb7e626368d52739e5c63e44e153ad48de4bf9a5f5cf9d9e9c69940b1",
        "bytes": 35389
      },
      {
        "id": "D02",
        "title": "Landlord company’s position",
        "role": "response",
        "party": "Landlord company",
        "filename": "CourtOS_EN-01_D02.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D02.pdf",
        "sha256": "00e20ad6223baab20d49c7ed480f3e425f2b07f577ceed81680b9749936f98ff",
        "bytes": 35399
      },
      {
        "id": "D03",
        "title": "Reconstructed exhibit: email sequence",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_EN-01_D03.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D03.pdf",
        "sha256": "a1548dd518c61c91e93cecaeb5b20437f4a0243d50bf017f2b0fcaa8155a9bba",
        "bytes": 35670
      },
      {
        "id": "D04",
        "title": "Reconstructed exhibit: lease and later events",
        "role": "exhibit",
        "party": "",
        "filename": "CourtOS_EN-01_D04.pdf",
        "path": "/examples/EN-01/CourtOS_EN-01_D04.pdf",
        "sha256": "83593588219a51aa6d22f229218dcf24f76c2c082e7a3556022ad4d3c861f6bc",
        "bytes": 35687
      }
    ],
    "textBytes": 4492
  }
];
