import { createPublicKey, verify as verifySignature } from "node:crypto";

const decode = value => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const parse = value => JSON.parse(decode(value).toString("utf8"));

export function createIdentityProvider({ issuer=process.env.SILO_OIDC_ISSUER, audience=process.env.SILO_OIDC_AUDIENCE, fetcher=fetch, clock=()=>Date.now() }={}) {
  let configuration, keys, expires=0;
  async function metadata() {
    if(configuration&&clock()<expires)return {configuration,keys};
    if(!issuer||!audience)return null;
    const discovery=await fetcher(`${issuer.replace(/\/$/,"")}/.well-known/openid-configuration`);
    if(!discovery.ok)throw Object.assign(new Error("Identity provider discovery failed"),{status:503,code:"OIDC_UNAVAILABLE"});
    configuration=await discovery.json();
    if(configuration.issuer!==issuer)throw Object.assign(new Error("Identity issuer mismatch"),{status:503,code:"OIDC_CONFIGURATION_INVALID"});
    const jwks=await fetcher(configuration.jwks_uri);if(!jwks.ok)throw Object.assign(new Error("Identity signing keys unavailable"),{status:503,code:"OIDC_UNAVAILABLE"});keys=(await jwks.json()).keys;expires=clock()+300_000;return {configuration,keys};
  }
  return {
    configured:Boolean(issuer&&audience),
    async verify(token) {
      const state=await metadata();if(!state)return null;
      const parts=String(token||"").split(".");if(parts.length!==3)throw Object.assign(new Error("Invalid identity token"),{status:401,code:"INVALID_TOKEN"});
      const header=parse(parts[0]),claims=parse(parts[1]);
      if(!["RS256","ES256"].includes(header.alg))throw Object.assign(new Error("Unsupported token algorithm"),{status:401,code:"INVALID_TOKEN"});
      const jwk=state.keys.find(item=>item.kid===header.kid&&item.use!=="enc");if(!jwk)throw Object.assign(new Error("Unknown token signing key"),{status:401,code:"INVALID_TOKEN"});
      const algorithm=header.alg==="RS256"?"RSA-SHA256":"sha256";const valid=verifySignature(algorithm,Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:"jwk"}),decode(parts[2]));
      const now=Math.floor(clock()/1000),acceptedAudience=Array.isArray(claims.aud)?claims.aud.includes(audience):claims.aud===audience;
      if(!valid||claims.iss!==issuer||!acceptedAudience||claims.exp<=now||claims.nbf&&claims.nbf>now||!claims.sub)throw Object.assign(new Error("Identity token validation failed"),{status:401,code:"INVALID_TOKEN"});
      return {subject:claims.sub,email:claims.email,name:claims.name||claims.preferred_username||claims.email,claims};
    },
  };
}
