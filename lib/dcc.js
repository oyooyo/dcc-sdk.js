// Needs to import only the sign and verify functions, not the encrypt and decrypt due to additional dependencies. 
import {createSync as cose_create, verifySync as cose_verify} from './cose-sign.js';
import {createHash as rawHash} from "sha256-uint8array";
import { Certificate, PrivateKey } from '@fidm/x509';
import zlib from 'pako';
import cbor from 'cbor';

import * as Base32URL from 'base32url';
import * as base64 from 'base64-js';

import base45 from 'base45';

import { resolveKey } from './resolver'; 

const URI_SCHEMA = 'HC1';

const CWT_ISSUER = 1;
const CWT_SUBJECT = 2;
const CWT_AUDIENCE = 3;
const CWT_EXPIRATION = 4;
const CWT_NOT_BEFORE = 5;
const CWT_ISSUED_AT = 6;
const CWT_ID = 7;
const CWT_HCERT = -260;
const CWT_HCERT_V1 = 1;

const COSE_ALG_TAG = 1;
const COSE_KID_TAG = 4;

const RSA_IOD = "1.2.840.113549.1.1.1";

function getParamsFromPEM(publicKeyPem) {
  const cert = Certificate.fromPEM(publicKeyPem);
  const fingerprint = rawHash().update(cert.raw).digest();
  const keyID = fingerprint.slice(0,8);

  // if RSA
  if (cert.publicKey.oid === RSA_IOD) {
    let pk = cert.publicKey.keyRaw
    const keyMod = Buffer.from(pk.slice(9, pk.length - 5));
    const keyExp = Buffer.from(pk.slice(pk.length - 3,pk.length));
    return {alg: 'PS256', keyID: keyID, keyMod:keyMod, keyExp:keyExp, pk: pk};
  } else {
    let pk = cert.publicKey.keyRaw
    const keyB = Buffer.from(pk.slice(0, 1));
    const keyX = Buffer.from(pk.slice(1, 1+32));
    const keyY = Buffer.from(pk.slice(33,33+32));
    return {alg: 'ES256',  keyID: keyID, keyB: keyB, keyX: keyX, keyY: keyY};
  }
}

function getPrivateKeyFromP8(privateKeyP8) {
  // Highly ES256 specific - extract the 'D' (private key) for signing.
  return Buffer.from(PrivateKey.fromPEM(privateKeyP8).keyRaw.slice(7,7+32))
}

function isBase32(payload) {
  let b32_regex = /^[A-Z2-7]+=*$/;
  return b32_regex.exec(payload);
}

function isBase45(payload) {
  let b45_regex = /^[A-Z0-9 $%*+./:-]+$/;
  return b45_regex.exec(payload);
}

export function sign(payload, publicKeyPem, privateKeyP8) {
  const keyParams = getParamsFromPEM(publicKeyPem);

  const headers = {
    'p': { 
      'alg': keyParams.alg, 
      'kid': keyParams.keyID 
    }, 
    'u': {}
  };

  const signer = {
    'key': {
      'd': getPrivateKeyFromP8(privateKeyP8) 
    }
  };

  const cborPayload = cbor.encode(payload);
  return cose_create(headers, cborPayload, signer);
}

/*
 * I am not sure if I should build this by hand. 
 */
export function makeCWT(payload, monthsToExpire, issuer) {
  let cwt = new Map();

  let iss = new Date();
  cwt.set(CWT_ISSUED_AT, Math.round(iss.getTime()/1000));

  if (monthsToExpire) {
    let exp = new Date(iss);
    exp.setMonth(exp.getMonth()+monthsToExpire);
    cwt.set(CWT_EXPIRATION, Math.round(exp.getTime()/1000));
  }
  
  if (issuer) {
    cwt.set(CWT_ISSUER, issuer);
  }

  cwt.set(CWT_HCERT, new Map()); 
  cwt.get(CWT_HCERT).set(CWT_HCERT_V1, payload);  
  return cwt;
}

export function parseCWT(cwt) {
  return cwt.get(CWT_HCERT).get(CWT_HCERT_V1);
}

function toBase64(bytes) {
  return base64.fromByteArray(bytes);
}

function toBase64URL(bytes) {
  return toBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/\=+$/m,'');
}

function getCOSEHeaderParams(header) {
  let headerObj;
  // Sometimes the header has to be decoded. 
  if (header instanceof Buffer || header  instanceof Uint8Array) {
    if (header.length == 0) {
      return {};
    }
    headerObj = cbor.decode(header);
  } 

  // Sometimes the header is already decoded. 
  if (header instanceof Map) {
    headerObj = header;
  }

  if (headerObj) {
    let algorithm;
    let kid; 

    if (headerObj.get(COSE_ALG_TAG))
      algorithm = headerObj.get(COSE_ALG_TAG);
    if (headerObj.get(COSE_KID_TAG))
      kid = new Uint8Array(headerObj.get(COSE_KID_TAG));

    return {alg: algorithm, kid: kid};
  }
  return {};
} 

function getIssuerKeyId(coseContent) {
  let cborObj = cbor.decode(new Uint8Array(coseContent));

  if (!cborObj) { 
    console.log("Not a readable COSE");
    return undefined;
  }

  let cborObjValue = cborObj.value;

  if (!cborObjValue) { 
    if (Array.isArray(cborObj)) {
      console.warn("COSE object with no Value field", cborObj);
      cborObjValue = cborObj;
    } else { 
      console.log("COSE object with no Value field and no array", cborObj);
      return undefined;
    }
  }  

  let [protec, unprotec, payload, signature] = cborObjValue;

  let cwtIssuer;

  try {
    let decodedPayload = cbor.decode(payload); 
    if (decodedPayload instanceof Map) {
      cwtIssuer = decodedPayload.get(CWT_ISSUER);
    }
  } catch (err) {
    console.log(payload, err);
  }

  let protectedData = getCOSEHeaderParams(protec);
  let unProtectedData = getCOSEHeaderParams(unprotec);

  return {
    alg: protectedData.alg ? protectedData.alg : unProtectedData.alg, 
    kid: protectedData.kid ? protectedData.kid : unProtectedData.kid, 
    iss: cwtIssuer
  };
}

function verifyAndReturnPayload(coseContent, addPublicKeyPem) {
  const keyID = getIssuerKeyId(coseContent);

  if (!keyID) {
    console.log("Could not find keyID");
    return;
  }

  // Tries B64URL First
  let publicKeyPem = resolveKey(toBase64(keyID.kid));

  // if not then use the key passed on the parameter. 
  if (!publicKeyPem) {
    publicKeyPem = addPublicKeyPem;
  }

  if (!publicKeyPem) {
    console.log("Public key not found");
    return;
  }

  let keyParams = getParamsFromPEM(publicKeyPem);

  const verifier = keyParams.keyX ? { //ECDSA
    'key': { 
      'x': keyParams.keyX, 
      'y': keyParams.keyY,  
      'kid': keyParams.keyID,
    } 
  } : {  //RSA
    'key': { 
      'n': keyParams.keyMod, 
      'e': keyParams.keyExp,  
      'kid': keyParams.keyID,
    } 
  };

  const verified = cose_verify(coseContent, verifier);
  const jsonPayload = cbor.decode(verified);

  return jsonPayload; 
}

export function verify(coseContent, publicKeyPem) {
  try {
    verifyAndReturnPayload(coseContent, publicKeyPem);
    return true;
  } catch (err) {
    console.log(err);
    return false;
  }
}

export function unpack(uri) {
  let data = uri;

  // Backwards compatibility.
  if (data.startsWith(URI_SCHEMA)) {
    data = data.substring(3)
    if (data.startsWith(':')) {
      data = data.substring(1)
    } else {
      console.warn("Warning: unsafe HC1: header from older versions");
    };
  } else {
      console.warn("Warning: no HC1: header from older versions");
  };

  let unencodedData;

  if (isBase32(data)) {
    unencodedData = Buffer.from(Base32URL.decode(data));
  } else if (isBase45(data)) {
    unencodedData = base45.decode(data);
  } else {
    console.warn("Warning: Payload was not encoded correctly", data);
  }

  // Check if it was zipped (Backwards compatibility.)
  if (unencodedData[0] == 0x78) {
    unencodedData = zlib.inflate(unencodedData);
  }

  return unencodedData;
}

function decodeCbor(cborObj) {
  if (cborObj instanceof Buffer || cborObj instanceof Uint8Array) {
    try {  
      cborObj = cbor.decode(cborObj);
      for (var key in cborObj) {
        cborObj[key] = decodeCbor(cborObj[key]);
      }
    } catch {
      // If it is not CBOR then encode Base64
      if (cborObj.length == 8) // key ID: 
        cborObj = toBase64URL(cborObj)
      else
        cborObj = cborObj.toString('base64');
    }
  } 

  if (Array.isArray(cborObj)) {
    for (let i=0; i<cborObj.length; i++) {
      cborObj[i] = decodeCbor(cborObj[i])
    }
  }

  if (cborObj instanceof Map) {
    for (const [key, value] of cborObj.entries()) {
      cborObj.set(key, decodeCbor(cborObj.get(key)));
    }
  }

  return cborObj;
}

export function debug(uri) {
  return decodeCbor(unpack(uri));
}

export function unpackAndVerify(uri, publicKeyPem) {
  try {
    return verifyAndReturnPayload(unpack(uri), publicKeyPem);
  } catch (err) {
    console.log(err);
    return undefined;
  }
}

function pack32(payload) {
  const zipped = zlib.deflate(payload);
  return URI_SCHEMA + ':' + Base32URL.encode(zipped);
}

function pack45(payload) {
  const zipped = zlib.deflate(payload);
  return URI_SCHEMA + ':' + base45.encode(zipped);
}

export function pack(payload) {
  return pack45(payload);
}

export function signAndPack32(payload, publicKeyPem, privateKeyP8) {
  return pack32(sign(payload, publicKeyPem, privateKeyP8));
}

export function signAndPack45(payload, publicKeyPem, privateKeyP8) {
  return pack45(sign(payload, publicKeyPem, privateKeyP8));
}

export function signAndPack(payload, publicKeyPem, privateKeyP8) {
  return pack45(sign(payload, publicKeyPem, privateKeyP8));
}
