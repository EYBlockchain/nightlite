# Use of El-Gamal encryption

Regulatory requirements may mandate that transactions can be made visible to a specific authority
(the Authority). This capability can be provided by encrypting transaction data using an Authority
public key (or keys). It may be enforced by requiring a user to prove in zero knowledge that they
have correctly encrypted transaction data (specifically: the value sent, C; the public key of the
sender pkA; the public key of the recipient, pkB).

El-Gamal encryption over a Babyjubjub elliptic curve is a snark-friendly way to do the encryption.

## Setup

Firstly, the Authority chooses three random private keys: x1, x2, x3 from the Babyjubjub prime field
Fq (expecting q) and computes public keys y1, y2, y3 where, generally:

```
y = g.x
```

`g` is a generator of the Babyjubjub curve points and the dot product represents scalar
multiplication over the Babyjubjub curve.

## Encryption by a user (don't know x1, x2, x3)

El-Gamal encryption works on curve points so the values to be encrypted need to be mapped to curve
points:

```
m1 = g.C
m2 = g.pkA
m3 = g.pkB
```

(Note: reversing this mapping requires a brute-forcing of the discrete logarithm. This requires us
to restrict the possible values for the inputs. This is not hard to do but, additionally, we can
potentially use this fact to make decryption computationally intensive, which would restrict the
Authority's ability to do general decryption of transactions: adding a small random number would
work.)

Next, choose a random number, `r`, from Fq (excluding q). This should be a different random number
for each encryption. Compute shared secrets s1, s2, s3 where, generally:

```
s = y.r
```

Then compute the encryption as a vector:

```
c0 = g.r
c1 = m1 + s1
c2 = m2 + s2
c3 = m3 + s3
```

This is stored by the shield contract as part of the transaction.

## Decryption by Authority (knows x1, x2, x3, does not know r)

Compute: `c0.x1 = (g.r).x1 = (g.x1).r = y1.r = s1`, and similarly for s2, s3. Then:

```
m1 = c1 - s1
m2 = c2 - s2
m3 = c3 - s2
```

Once m1, m2, m3 are decrypted, they can be brute-forced to reveal the original values.
