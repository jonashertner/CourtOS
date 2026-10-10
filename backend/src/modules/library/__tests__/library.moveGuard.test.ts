import {describe,expect,it} from "vitest";
import {scriptedDb} from "../../../__tests__/helpers/scriptedDb";
import {moveLibraryDocument} from "../library.service";
const expected={version_id:"11111111-1111-4111-8111-111111111111",content_sha256:"a".repeat(64),updated_at:"2026-10-10T14:00:00Z"};
const document={id:"doc",current_version_id:expected.version_id,updated_at:expected.updated_at,status:"ready"};
describe("conditional personal-library filing",()=>{
 it("checks ownership before version metadata, then atomically repeats version and metadata revision on the move",async()=>{
  const fake=scriptedDb([{table:"library_folders",data:{id:"folder"}},{table:"documents",data:document},{table:"document_versions",data:{id:expected.version_id,content_sha256:expected.content_sha256}},{table:"documents",op:"update",data:{...document,library_folder_id:"folder"}}]);
  expect((await moveLibraryDocument(fake.db,"owner","file","doc","folder",expected)).ok).toBe(true);
  expect(fake.calls[0].filters).toContainEqual(["eq","user_id","owner"]);
  expect(fake.calls[1].filters).toContainEqual(["eq","user_id","owner"]);
  expect(fake.calls[2].filters).toContainEqual(["eq","document_id","doc"]);
  const update=fake.calls[3];expect(update.payload).toEqual({library_folder_id:"folder",updated_at:expect.any(String)});
  for(const filter of [["eq","user_id","owner"],["is","project_id",null],["eq","current_version_id",expected.version_id],["eq","updated_at",expected.updated_at],["eq","status","ready"]])expect(update.filters).toContainEqual(filter);
 });
 it("does not access a foreign document's version or mutate it",async()=>{
  const fake=scriptedDb([{table:"documents",data:null}]);expect(await moveLibraryDocument(fake.db,"other","file","doc",null,expected)).toMatchObject({ok:false,status:404});expect(fake.calls).toHaveLength(1);
 });
 it.each([{...document,current_version_id:"changed"},{...document,updated_at:"2026-10-10T14:01:00Z"},{...document,status:"processing"}])("rejects a stale document before reading the version",async(value)=>{
  const fake=scriptedDb([{table:"documents",data:value}]);expect(await moveLibraryDocument(fake.db,"owner","file","doc",null,expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(1);
 });
 it.each([null,{id:expected.version_id,content_sha256:"b".repeat(64)}])("rejects a missing or changed version hash before mutation",async(version)=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:version}]);expect(await moveLibraryDocument(fake.db,"owner","file","doc",null,expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(2);
 });
 it("reports a concurrent revision change with409 and never falls back to an unconditional update",async()=>{
  const fake=scriptedDb([{table:"documents",data:document},{table:"document_versions",data:{content_sha256:expected.content_sha256}},{table:"documents",op:"update",data:null}]);expect(await moveLibraryDocument(fake.db,"owner","file","doc",null,expected)).toMatchObject({ok:false,status:409});expect(fake.calls).toHaveLength(3);
 });
 it.each([null,{},[],{...expected,content_sha256:"bad"},{...expected,updated_at:"bad"},{...expected,owner:"other"}])("rejects malformed supplied preconditions",async(value)=>{
  const fake=scriptedDb([]);expect(await moveLibraryDocument(fake.db,"owner","file","doc",null,value)).toMatchObject({ok:false,status:400});expect(fake.calls).toHaveLength(0);
 });
 it("preserves ordinary native moves when no precondition was supplied",async()=>{
  const fake=scriptedDb([{table:"documents",op:"update",data:{id:"doc",library_folder_id:null}}]);expect((await moveLibraryDocument(fake.db,"owner","file","doc",null)).ok).toBe(true);expect(fake.calls).toHaveLength(1);
 });
});
