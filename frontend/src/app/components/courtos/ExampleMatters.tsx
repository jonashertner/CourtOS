"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useCourtOSLocale} from "@/app/contexts/CourtOSLocaleContext";
import {COURTOS_LANGUAGE_NAMES} from "@/app/lib/courtosLocale";
import {EXAMPLE_MATTERS,type ExampleMatter} from "@/app/lib/exampleMatters";
import {exampleMessages as M} from "@/app/lib/exampleMessages";
import {ExampleImportError,importExampleMatter,type ExampleSelection,type ExampleImportResult} from "@/app/lib/importExampleMatter";
import styles from "./ExampleMatters.module.css";

type State={status:"loading"|"done"|"asset"|"upload"|"existing";result?:ExampleImportResult};
export function ExampleMatters({disabled,inWord,onImportingChange,onImported}:{disabled:boolean;inWord:boolean;onImportingChange:(busy:boolean)=>void;onImported:(sources:ExampleSelection[],language:typeof EXAMPLE_MATTERS[number]["language"])=>void}) {
    const {t}=useCourtOSLocale();
    const [states,setStates]=useState<Record<string,State>>({});
    const operation=useRef<AbortController|null>(null);
    const pending=Object.values(states).some(value=>value.status==="loading");
    useEffect(()=>()=>operation.current?.abort(),[]);
    async function run(matter:ExampleMatter) {
        if(disabled||operation.current||states[matter.id]?.status==="upload")return;
        const controller=new AbortController();operation.current=controller;setStates(previous=>({...previous,[matter.id]:{status:"loading"}}));onImportingChange(true);
        try {
            const result=await importExampleMatter(matter,controller.signal);
            if(!controller.signal.aborted){onImported(result.sources,matter.language);setStates(previous=>({...previous,[matter.id]:{status:"done",result}}));}
        } catch(error){if(!controller.signal.aborted)setStates(previous=>({...previous,[matter.id]:{status:error instanceof ExampleImportError?error.code:"asset"}}));}
        finally {if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)onImportingChange(false);}
    }
    return <details className={styles.container}>
        <summary>{t(M.title)}</summary>
        <p>{t(M.intro)}</p>
        <p>{t(M.effect)}</p>
        {disabled&&!pending&&<p>{t(M.existing)}</p>}
        <div className={styles.matters}>{EXAMPLE_MATTERS.map(matter=>{
            const state=states[matter.id],status=state?.status,result=state?.result;
            return <section className={styles.matter} key={matter.id} aria-labelledby={`example-${matter.id}`}>
                <p className={styles.caseNumber}>{t(M.fictitious)} · {matter.caseNumber} <span>{COURTOS_LANGUAGE_NAMES[matter.language]}</span></p>
                <h3 id={`example-${matter.id}`}>{matter.title}</h3>
                <p>{matter.parties.map(party=>party.label).join(" / ")}</p>
                {matter.partyNote&&<p>{matter.partyNote}</p>}
                {matter.language==="en"&&<p>{t(M.translated)}</p>}
                <a className="courtos-link" href={matter.judgment.url} target="_blank" rel="noopener noreferrer">{t(M.original)} · {matter.judgment.number} · {matter.judgment.date}</a>
                <details className={styles.documents}><summary>{t(M.contents)}</summary>
                    <p className={styles.locators}>{matter.judgment.locators.join("; ")}</p>
                    <p className={styles.path}>{matter.caseNumber}</p>
                    <ol>{matter.documents.map(document=><li key={document.id}><span className={styles.path}>{document.folders.join(" / ")}</span><a className="courtos-link" href={document.path} download={document.filename}>{document.id} · {document.title} (PDF)</a></li>)}</ol>
                    <p>{t(M.shared)}</p>
                    <p>{t(M.roles)}</p>
                </details>
                <button className="courtos-button" disabled={disabled||pending||status==="upload"} aria-label={`${t(M.import)} · ${matter.caseNumber}`} onClick={()=>void run(matter)}>{t(status==="loading"?M.importing:M.import)}</button>
                {status==="done"&&result&&<div role="status"><p>{t(M.imported)}</p>{result.reusedCount>0&&<p>{t(M.reused,{count:result.reusedCount})}</p>}{result.previousEditionCount>0&&<p>{t(M.previous,{count:result.previousEditionCount})}</p>}<Link className="courtos-link" href={`/library/folders/${result.folderId}${inWord?"?host=word":""}`}>{t(M.caseFolder)}</Link></div>}
                {(status==="asset"||status==="upload"||status==="existing")&&<div role="alert"><p>{t(status==="asset"?M.assetError:status==="existing"?M.existingError:M.uploadError)}</p>{status!=="asset"&&<Link className="courtos-link" href={inWord?"/library?host=word":"/library"}>{t(M.library)}</Link>}</div>}
            </section>;
        })}</div>
        <div className={styles.references}><a className="courtos-link" href="/examples/sourcekey.json" download>{t(M.sourcekey)}</a><a className="courtos-link" href="/examples/expected-findings.json" download>{t(M.answers)}</a><small>{t(M.answerHelp)}</small></div>
    </details>;
}
