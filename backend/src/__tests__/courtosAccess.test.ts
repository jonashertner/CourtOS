import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyCourtOSAccess, courtosIdentityMatches } from '../lib/courtosAccess';
import { establishCloudflareSession } from '../modules/auth/auth.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const claims = { iss: 'https://access.example', aud: ['pilot'], exp: 2000, iat: 900, sub: 'person-1', email: 'tester@example.org' };
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function token(payload: object = claims, header: object = { alg: 'RS256', kid: 'key-1' }) {
 const body = `${encode(header)}.${encode(payload)}`;
 return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
let dir: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
 dir = mkdtempSync(join(tmpdir(), 'courtos-jwks-'));
 const file = join(dir, 'jwks.json');
 writeFileSync(file, JSON.stringify({keys:[{...publicKey.export({format:'jwk'}),kid:'key-1'}]}));
 env = { COURTOS_ACCESS_ISSUER: claims.iss, COURTOS_ACCESS_AUDIENCE:'pilot', COURTOS_ACCESS_EMAILS:claims.email, COURTOS_ACCESS_JWKS_FILE:file };
});
afterEach(() => rmSync(dir,{recursive:true,force:true}));
describe('CourtOS verified Access identity', () => {
 it('accepts the signed, allowlisted identity', () => expect(verifyCourtOSAccess(token(),env,1000)).toEqual({email:claims.email,subject:claims.sub}));
 it.each([
  {exp:999}, {aud:['other']}, {iss:'https://evil.example'}, {email:'outsider@example.org'}, {sub:''}, {iat:2000}, {nbf:2000}, {exp:'2000'},
 ])('rejects invalid claims %o', patch => expect(()=>verifyCourtOSAccess(token({...claims,...patch}),env,1000)).toThrow());
 it('rejects missing, changed or incorrectly signed assertions', () => {
  for(const v of [undefined,'raw-email-header',token().slice(0,-15)+'abcdefghijklmn',token(claims,{alg:'HS256',kid:'key-1'}),token(claims,{alg:'RS256',kid:'other'})]) expect(()=>verifyCourtOSAccess(v,env,1000)).toThrow();
 });
 it('fails closed without configured allowlist or unreadable keys', () => {
  expect(()=>verifyCourtOSAccess(token(),{...env,COURTOS_ACCESS_EMAILS:''},1000)).toThrow();
  expect(()=>verifyCourtOSAccess(token(),{...env,COURTOS_ACCESS_JWKS_FILE:'/not-here'},1000)).toThrow();
 });
 it('permits a new verified email only with explicit pilot self-registration', () => {
  const outsider=token({...claims,email:'new-tester@example.org'});
  for (const patch of [{}, {COURTOS_ACCESS_SELF_REGISTRATION:'true'}, {COURTOS_PILOT_MODE:'true'}, {COURTOS_PILOT_MODE:'true',COURTOS_ACCESS_SELF_REGISTRATION:'1'}]) {
   expect(()=>verifyCourtOSAccess(outsider,{...env,...patch},1000)).toThrow();
  }
  const publicEnv={...env,COURTOS_PILOT_MODE:'true',COURTOS_ACCESS_SELF_REGISTRATION:'true',COURTOS_ACCESS_EMAILS:''};
  expect(verifyCourtOSAccess(outsider,publicEnv,1000).email).toBe('new-tester@example.org');
  expect(()=>verifyCourtOSAccess(outsider,{...publicEnv,COURTOS_ACCESS_DENY_EMAILS:'NEW-TESTER@example.org'},1000)).toThrow();
  for(const patch of [{aud:['wrong']},{iss:'https://evil.example'},{exp:999},{email:''},{email:'not-an-email'}]) expect(()=>verifyCourtOSAccess(token({...claims,...patch}),publicEnv,1000)).toThrow();
  expect(()=>verifyCourtOSAccess(outsider.slice(0,-15)+'abcdefghijklmn',publicEnv,1000)).toThrow();
 });
 it('honours the denylist even for an explicitly allowlisted identity', () => {
  expect(()=>verifyCourtOSAccess(token(),{...env,COURTOS_ACCESS_DENY_EMAILS:claims.email},1000)).toThrow();
 });
 it('does not override a GoTrue ban or failed OTP verification', async () => {
  const admin={auth:{admin:{generateLink:async()=>({data:{properties:{hashed_token:'single-use',verification_type:'magiclink'},user:{email:claims.email}},error:null})}}};
  const client={auth:{verifyOtp:async()=>({data:{user:null,session:null},error:{status:403}})}};
  await expect(establishCloudflareSession(admin as never,client as never,{email:claims.email,subject:'id'})).rejects.toThrow();
 });
 it('rejects a Supabase session belonging to another Access user', () => {
  expect(courtosIdentityMatches({email:claims.email,subject:'id'},'other@example.org')).toBe(false);
  expect(courtosIdentityMatches(undefined,claims.email)).toBe(false);
  expect(courtosIdentityMatches({email:claims.email,subject:'id'},claims.email.toUpperCase())).toBe(true);
 });
 it.each(['magiclink', 'signup'] as const)('exchanges the server-returned %s token without emailing it', async (verificationType) => {
  const user={id:'user-1',email:claims.email};
  // GoTrue converts the requested magiclink to signup when creating a new
  // user; verification must use its returned type, not the requested type.
  const admin={auth:{admin:{generateLink:async(input:unknown)=>{expect(input).toEqual({type:'magiclink',email:claims.email});return {data:{properties:{hashed_token:'single-use',verification_type:verificationType},user},error:null};}}}};
  const client={auth:{verifyOtp:async(input:unknown)=>{expect(input).toEqual({type:verificationType,token_hash:'single-use'});return {data:{user,session:{access_token:'not-returned'}},error:null};}}};
  expect(await establishCloudflareSession(admin as never,client as never,{email:claims.email,subject:'id'})).toEqual(user);
 });
 it.each([undefined, null, '', 'recovery', 'invite', 'email_change_current', 'email_change_new', 'email', 'MAGICLINK'])('rejects unexpected verification type %s before verifying a token', async (verificationType) => {
  const user={id:'user-1',email:claims.email};
  const admin={auth:{admin:{generateLink:async()=>({data:{properties:{hashed_token:'single-use',verification_type:verificationType},user},error:null})}}};
  const verifyOtp=vi.fn();
  await expect(establishCloudflareSession(admin as never,{auth:{verifyOtp}} as never,{email:claims.email,subject:'id'})).rejects.toThrow();
  expect(verifyOtp).not.toHaveBeenCalled();
 });
 it('refuses a provider response with a different user', async () => {
  const admin={auth:{admin:{generateLink:async()=>({data:{properties:{hashed_token:'single-use',verification_type:'magiclink'},user:{email:'other@example.org'}},error:null})}}};
  await expect(establishCloudflareSession(admin as never,{} as never,{email:claims.email,subject:'id'})).rejects.toThrow();
 });
 it.each(['magiclink', 'signup'] as const)('refuses a different user after %s verification', async (verificationType) => {
  const admin={auth:{admin:{generateLink:async()=>({data:{properties:{hashed_token:'single-use',verification_type:verificationType},user:{email:claims.email}},error:null})}}};
  const client={auth:{verifyOtp:async()=>({data:{user:{email:'other@example.org'},session:{access_token:'not-returned'}},error:null})}};
  await expect(establishCloudflareSession(admin as never,client as never,{email:claims.email,subject:'id'})).rejects.toThrow();
 });
});
