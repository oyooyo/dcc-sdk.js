# Verifiable QR SDK for EU Digital Covid Certificates

JavaScript Implementation of [EU's Digital Covid Certificates](https://ec.europa.eu/info/live-work-travel-eu/coronavirus-response/safe-covid-19-vaccines-europeans/covid-19-digital-green-certificates_en), a CBOR/COSE-based Verifiable QR Credentials. 

## This is a fork

**This is a fork** of the [original dcc-sdk.js](https://github.com/Path-Check/dcc-sdk.js) by [PathCheck](https://www.pathcheck.org) that basically only differs from the original version by **using synchronous code** whenever possible. **Currently, the API of this fork is fully synchronous**.

While Javascript makes dealing with asynchronous code quite easy, fully synchronous code is still a little more convenient sometimes, for example when used in React components.

When using modern Javascript code with `async/await` (instead of directly dealing with low-level `Promise`s), this fork should also work as a drop-in-replacement for the original version, as `await` works for calling both synchronous and asynchronous functions.

# Install

```sh
npm install @pathcheck/dcc-sdk --save
```

# Setting up CSCA, DCS and Key IDs

```sh
./gen-csca-dsc.sh
```

It will generate a dsc-worker.p8 file like this: 

```
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZgp3uylFeCIIXozb
ZkCkSNr4DcLDxplZ1ax/u7ndXqahRANCAARkJeqyO85dyR+UrQ5Ey8EdgLyf9Nts
CrwORAj6T68/elL19aoISQDbzaNYJjdD77XdHtd+nFGTQVpB88wPTwgb
-----END PRIVATE KEY-----
```

and a dsc-worker.pem certificate as: 

```
-----BEGIN CERTIFICATE-----
MIIBYDCCAQYCEQCAG8uscdLb0ppaneNN5sB7MAoGCCqGSM49BAMCMDIxIzAhBgNV
BAMMGk5hdGlvbmFsIENTQ0Egb2YgRnJpZXNsYW5kMQswCQYDVQQGEwJGUjAeFw0y
MTA0MjcyMDQ3MDVaFw0yNjAzMTIyMDQ3MDVaMDYxJzAlBgNVBAMMHkRTQyBudW1i
ZXIgd29ya2VyIG9mIEZyaWVzbGFuZDELMAkGA1UEBhMCRlIwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAARkJeqyO85dyR+UrQ5Ey8EdgLyf9NtsCrwORAj6T68/elL1
9aoISQDbzaNYJjdD77XdHtd+nFGTQVpB88wPTwgbMAoGCCqGSM49BAMCA0gAMEUC
IQDvDacGFQO3tuATpoqf40CBv09nfglL3wh5wBwA1uA7lAIgZ4sOK2iaaTsFNqEN
AF7zi+d862ePRQ9Lwymr7XfwVm0=
-----END CERTIFICATE-----
```


# Usage

With the keys: 

```js
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgZgp3uylFeCIIXozb
ZkCkSNr4DcLDxplZ1ax/u7ndXqahRANCAARkJeqyO85dyR+UrQ5Ey8EdgLyf9Nts
CrwORAj6T68/elL19aoISQDbzaNYJjdD77XdHtd+nFGTQVpB88wPTwgb
-----END PRIVATE KEY-----`;

const PUB_KEY_ID = `-----BEGIN CERTIFICATE-----
MIIBYDCCAQYCEQCAG8uscdLb0ppaneNN5sB7MAoGCCqGSM49BAMCMDIxIzAhBgNV
BAMMGk5hdGlvbmFsIENTQ0Egb2YgRnJpZXNsYW5kMQswCQYDVQQGEwJGUjAeFw0y
MTA0MjcyMDQ3MDVaFw0yNjAzMTIyMDQ3MDVaMDYxJzAlBgNVBAMMHkRTQyBudW1i
ZXIgd29ya2VyIG9mIEZyaWVzbGFuZDELMAkGA1UEBhMCRlIwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAARkJeqyO85dyR+UrQ5Ey8EdgLyf9NtsCrwORAj6T68/elL1
9aoISQDbzaNYJjdD77XdHtd+nFGTQVpB88wPTwgbMAoGCCqGSM49BAMCA0gAMEUC
IQDvDacGFQO3tuATpoqf40CBv09nfglL3wh5wBwA1uA7lAIgZ4sOK2iaaTsFNqEN
AF7zi+d862ePRQ9Lwymr7XfwVm0=
-----END CERTIFICATE-----`
```

And a Payload 

```js
const TEST_PAYLOAD = {
  "ver": "1.0.0",
  "nam": {
    "fn": "d'Arsøns - van Halen",
    "gn": "François-Joan",
    "fnt": "DARSONS<VAN<HALEN",
    "gnt": "FRANCOIS<JOAN"
  },
  "dob": "2009-02-28",
  "v": [
    {
      "tg": "840539006",
      "vp": "1119349007",
      "mp": "EU/1/20/1528",
      "ma": "ORG-100030215",
      "dn": 2,
      "sd": 2,
      "dt": "2021-04-21",
      "co": "NL",
      "is": "Ministry of Public Health, Welfare and Sport",
      "ci": "urn:uvci:01:NL:PlA8UWS60Z4RZXVALl6GAZ"
    }
  ]
};
```

Call the signAndPack to create the URI for the QR Code: 

```js
const qrUri = signAndPack(makeCWT(TEST_PAYLOAD), PUBLIC_KEY_PEM, PRIVATE_KEY_P8);
```

And call the unpack and verify to convert the URI into the payload: 

```js
const payload = unpackAndVerify(qrUri);
```

# Development

```sh
npm install
``` 

# Test

```sh
npm test
```
