import {describe,expect,it} from "vitest";
import {scriptedDb} from "../../../__tests__/helpers/scriptedDb";
import {renameLibraryDocument,updateLibraryFolder} from "../library.service";
const expected={version_id:"11111111-1111-4111-8111-111111111111",content_sha256:"a".repeat(64),updated_at:"2026-10-10T14:00:00Z",filename:"old.pdf"};
const document={id:"doc",current_version_id:expected.version_id,updated_at:expected.updated_at,status:"ready"};
describe("conditional metadata-only sample rename",()=>{
 it("binds owner/revision before the separately conditional exact-version rename without touching bytes",async()=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:expected},{table:"documents",op:"update",data:document},{table:"document_versions",op:"update",data:{filename:"new.pdf"}},{table:"document_versions",data:{...expected,filename:"new.pdf"}},{table:"documents",data:document}]);
  expect((await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).ok).toBe(true);
  for(const index of [0,2])for(const filter of [["eq","user_id","owner"],["is","project_id",null],["is","workflow_id",null]])expect(fake.calls[index].filters).toContainEqual(filter);
  for(const filter of [["eq","current_version_id",expected.version_id],["eq","updated_at",expected.updated_at],["eq","status","ready"]])expect(fake.calls[2].filters).toContainEqual(filter);
  expect(fake.calls[2].payload).toEqual({updated_at:expect.any(String)});
  expect(fake.calls[3].payload).toEqual({filename:"new.pdf"});
  for(const filter of [["eq","id",expected.version_id],["eq","document_id","doc"],["eq","filename","old.pdf"],["eq","content_sha256",expected.content_sha256],["is","deleted_at",null]])expect(fake.calls[3].filters).toContainEqual(filter);
 });
 it("does not read a foreign document version",async()=>{
  const fake=scriptedDb([{table:"documents",data:null}]);expect(await renameLibraryDocument(fake.db,"other","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:404});expect(fake.calls).toHaveLength(1);
 });
 it.each([{...document,current_version_id:"changed"},{...document,updated_at:"2026-10-10T14:01:00Z"},{...document,status:"processing"}])("refuses changed document before version reads",async(value)=>{
  const fake=scriptedDb([{table:"documents",data:value}]);expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(1);
 });
 it.each([{...expected,filename:"edited.pdf"},{...expected,content_sha256:"b".repeat(64)},null])("refuses changed filename/hash without mutations",async(version)=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:version}]);expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:409});expect(fake.calls.every(call=>call.op==="select")).toBe(true);
 });
 it("refuses a lost parent CAS without renaming any version",async()=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:expected},{table:"documents",op:"update",data:null}]);expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(3);
 });
 it.each([null,{...document,current_version_id:"new-version"},{...document,status:"processing"},{...document,updated_at:"2026-10-10T14:02:00Z"}])("withholds success on final ownership/version/state/revision drift",async(finalDoc)=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:expected},{table:"documents",op:"update",data:document},{table:"document_versions",op:"update",data:{filename:"new.pdf"}},{table:"document_versions",data:{...expected,filename:"new.pdf"}},{table:"documents",data:finalDoc}]);
  expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(6);expect(fake.calls[5].filters).toContainEqual(["eq","user_id","owner"]);
 });
 it("reports version CAS failure without an unconditional retry",async()=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:expected},{table:"documents",op:"update",data:document},{table:"document_versions",op:"update",data:null}]);expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(4);
 });
 it.each([null,{},[],{...expected,owner:"other"},{...expected,content_sha256:"bad"}])("refuses malformed supplied guards",async(value)=>{
  const fake=scriptedDb([]);expect(await renameLibraryDocument(fake.db,"owner","file","doc","new.pdf",value)).toMatchObject({ok:false,status:400});expect(fake.calls).toHaveLength(0);
 });
 it("guards folder name, revision, parent and owner in the same UPDATE",async()=>{
  const guard={name:"old",updated_at:expected.updated_at,parent_folder_id:null};
  const fake=scriptedDb([{table:"library_folders",data:{id:"folder",parent_folder_id:null}},{table:"library_folders",data:[]},{table:"library_folders",op:"update",data:{id:"folder",name:"new"}}]);
  expect((await updateLibraryFolder(fake.db,"owner","file","folder",{name:"new",expected:guard})).ok).toBe(true);
  for(const filter of [["eq","id","folder"],["eq","user_id","owner"],["eq","name","old"],["eq","updated_at",expected.updated_at],["is","parent_folder_id",null]])expect(fake.calls[2].filters).toContainEqual(filter);
 });
 it("does not merge a folder into an existing target name",async()=>{
  const fake=scriptedDb([{table:"library_folders",data:{id:"folder"}},{table:"library_folders",data:[{id:"other"}]}]);
  expect(await updateLibraryFolder(fake.db,"owner","file","folder",{name:"new",expected:{name:"old",updated_at:expected.updated_at,parent_folder_id:null}})).toMatchObject({ok:false,status:409});expect(fake.calls.every(call=>call.op==="select")).toBe(true);
 });
 it("keeps ordinary unguarded folder rename behavior",async()=>{
  const fake=scriptedDb([{table:"library_folders",data:{id:"folder"}},{table:"library_folders",op:"update",data:{id:"folder",name:"new"}}]);expect((await updateLibraryFolder(fake.db,"owner","file","folder",{name:"new"})).ok).toBe(true);expect(fake.calls).toHaveLength(2);
 });
});
