"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useCourtOSLocale} from "@/app/contexts/CourtOSLocaleContext";
import {COURTOS_LANGUAGE_NAMES} from "@/app/lib/courtosLocale";
import {EXAMPLE_MATTERS} from "@/app/lib/exampleMatters";
import {exampleMessages as M} from "@/app/lib/exampleMessages";
import {ExampleImportError,importExampleMatter,type ExampleSelection} from "@/app/lib/importExampleMatter";
import styles from "./ExampleMatters.module.css";

export function ExampleMatters({disabled,inWord,onImportingChange,onImported}:{disabled:boolean;inWord:boolean;onImportingChange:(busy:boolean)=>void;onImported:(sources:ExampleSelection[],language:typeof EXAMPLE_MATTERS[number]["language"])=>void}) {
    const {locale,t}=useCourtOSLocale();
    const [id,setId]=useState(EXAMPLE_MATTERS.find(matter=>matter.language===locale)?.id??EXAMPLE_MATTERS[0].id);
    const [status,setStatus]=useState<"idle"|"loading"|"done"|"asset"|"upload">("idle");
    const operation=useRef<AbortController|null>(null);
    const matter=EXAMPLE_MATTERS.find(value=>value.id===id)!;
    useEffect(()=>()=>operation.current?.abort(),[]);
    async function run() {
        if(disabled||operation.current||status==="done"||status==="upload")return;
        const controller=new AbortController();operation.current=controller;setStatus("loading");onImportingChange(true);
        try {
            const sources=await importExampleMatter(matter,controller.signal);
            if(!controller.signal.aborted){onImported(sources,matter.language);setStatus("done");}
        } catch(error){if(!controller.signal.aborted)setStatus(error instanceof ExampleImportError&&error.uploadAttempted?"upload":"asset");}
        finally {if(operation.current===controller)operation.current=null;if(!controller.signal.aborted)onImportingChange(false);}
    }
    return <details className={styles.container}>
        <summary>{t(M.title)}</summary>
        <p>{t(M.intro)}</p>
        <label className={styles.language}>{t(M.language)}<select className="courtos-field" value={id} disabled={status==="loading"||status==="upload"} onChange={event=>{setId(event.target.value);setStatus("idle");}}>{EXAMPLE_MATTERS.map(value=><option key={value.id} value={value.id}>{COURTOS_LANGUAGE_NAMES[value.language]}</option>)}</select></label>
        <h3>{matter.title}</h3>
        {matter.language==="en"&&<p>{t(M.translated)}</p>}
        <a className="courtos-link" href={matter.judgment.url} target="_blank" rel="noopener noreferrer">{t(M.original)} · {matter.judgment.number} · {matter.judgment.date}</a>
        <p className={styles.locators}>{matter.judgment.locators.join("; ")}</p>
        <ol>{matter.documents.map(document=><li key={document.id}><a className="courtos-link" href={document.path} download={document.filename}>{document.id} · {document.title} (PDF)</a></li>)}</ol>
        <p>{t(M.roles)}</p>
        <p>{t(M.effect)}</p>
        <button className="courtos-button" disabled={disabled||status==="loading"||status==="done"||status==="upload"} onClick={()=>void run()}>{t(status==="loading"?M.importing:M.import)}</button>
        {disabled&&status!=="done"&&status!=="loading"&&<p>{t(M.existing)}</p>}
        {status==="done"&&<p role="status">{t(M.imported)}</p>}
        {(status==="asset"||status==="upload")&&<div role="alert"><p>{t(status==="asset"?M.assetError:M.uploadError)}</p>{status==="upload"&&<Link className="courtos-link" href={inWord?"/library?host=word":"/library"}>{t(M.library)}</Link>}</div>}
        <div className={styles.references}><a className="courtos-link" href="/examples/sourcekey.json" download>{t(M.sourcekey)}</a><a className="courtos-link" href="/examples/expected-findings.json" download>{t(M.answers)}</a><small>{t(M.answerHelp)}</small></div>
    </details>;
}
