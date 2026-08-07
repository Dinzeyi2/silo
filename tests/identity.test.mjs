import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createIdentityProvider } from "../src/identity.mjs";

const b64=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
test("OIDC provider verifies issuer, audience, expiry, and asymmetric signature",async()=>{
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});const jwk=publicKey.export({format:"jwk"});jwk.kid="key-1";jwk.use="sig";
  const fetcher=async url=>({ok:true,json:async()=>url.endsWith("openid-configuration")?{issuer:"https://identity.example",jwks_uri:"https://identity.example/keys"}:{keys:[jwk]}});
  const provider=createIdentityProvider({issuer:"https://identity.example",audience:"silo-api",fetcher,clock:()=>1_700_000_000_000});
  const header=b64({alg:"RS256",kid:"key-1"}),payload=b64({iss:"https://identity.example",aud:"silo-api",sub:"user-1",exp:1_700_000_100,email:"user@example.com"});const signature=sign("RSA-SHA256",Buffer.from(`${header}.${payload}`),privateKey).toString("base64url");
  const identity=await provider.verify(`${header}.${payload}.${signature}`);assert.equal(identity.subject,"user-1");assert.equal(identity.email,"user@example.com");
});
