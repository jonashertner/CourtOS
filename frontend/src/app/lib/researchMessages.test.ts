import { describe, expect, it } from "vitest";
import { researchMessages } from "./researchMessages";
import { reviewMessages } from "./reviewMessages";
import { libraryMessages } from "./libraryMessages";
import { formatCourtOSText } from "./courtosLocale";

describe("core research language catalogs",()=>{
    it.each(Object.entries({research:researchMessages,review:reviewMessages,library:libraryMessages}))("keeps all %s translations and interpolation fields aligned",(_name,catalog)=>{
        for(const [key,message] of Object.entries(catalog)) {
            expect(Object.keys(message).sort(),key).toEqual(["de","en","fr","it"]);
            expect(message.de,key).not.toContain("ß");
            const placeholders=(text:string)=>[...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(match=>match[1]).sort();
            for(const language of ["de","fr","it","en"] as const){
                expect(message[language].trim().length,key).toBeGreaterThan(0);
                expect(placeholders(message[language]),`${key}/${language}`).toEqual(placeholders(message.de));
            }
        }
    });
    it("interpolates a source note literally without recursively translating or interpreting it",()=>{
        const note='<script>alert("texte original")</script> {language}';
        expect(formatCourtOSText("fr",researchMessages.publicSourceNotePrefix,{note})).toBe(`Note d’OpenCaseLaw : ${note}`);
    });
});
