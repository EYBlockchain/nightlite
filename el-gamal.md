# Use of El-Gamal encryption

Regulatory requirements may mandate that transactions can be made visible to a specific authority
(the Authority). This capability can be provided by encrypting transaction data using an Authority
public key (or keys). It may be enforced by requiring a user to prove in zero knowledge that they
have correctly encrypted transaction data (specifically: the value sent, `value`; the public key of
the sender `pkA`; the public key of the recipient, `pkB`).

El-Gamal encryption over a Baby Jubjub elliptic curve is a snark-friendly way to do the encryption.

## Setup

Firstly, the Authority chooses three random non-zero integer private keys: x1, x2, x3 from the Baby
Jubjub prime field Fq and computes three corresponding public keys Y1, Y2, Y3 where:

```sh
Y = x.G
```

The point `G` is a publicly known generator of the Baby Jubjub curve. The dot product represents
[scalar multiplication](https://en.wikipedia.org/wiki/Elliptic_curve_point_multiplication) over the
curve. A good explanation of arithmetic over this particular curve can be found
[here](https://iden3-docs.readthedocs.io/en/latest/iden3_repos/research/publications/zkproof-standards-workshop-2/baby-jubjub/baby-jubjub.html).

## Encryption by a user (don't know x1, x2, x3)

A regular user of this scheme must encrypt and send the commitment value (`value`), their zkp public
key (`pkA`), and the recipient's zkp public key (`pkB`) such that only the authority can decrypt
them.

El-Gamal encryption works on curve points, so the values to be encrypted need to be mapped using
scalar multiplication:

```sh
M1 = value.G
M2 = pkA.G
M3 = pkB.G
```

(Note: reversing this mapping requires a brute-forcing of the discrete logarithm. This requires us
to restrict the possible values for the inputs. This is not hard to do but, additionally, we can
potentially use this fact to make decryption computationally intensive, which would restrict the
Authority's ability to do general decryption of transactions: adding a small random number would
work.)

Next, choose a random non zero number, `r`, from Fq. This must be a different random number for each
commitment transfer (or burn). Compute shared secrets, S1, S2, S3 where:

```sh
S1 = r.Y1
S2 = r.Y2
S3 = r.Y3
```

Recall that each Y is an authority public key. Then compute the final encryption as a 4-tuple, C0,
C1, C2, C3:

```sh
C0 = r.G
C1 = M1 + S1
C2 = M2 + S2
C3 = M3 + S3
```

Where C1 to C3 are the result of point additions. This 4-tuple is emitted by the shield contract as
part of the transaction.

## Decryption by Authority (knows x1, x2, x3, does not know r)

Only the Authority can find the hidden values `C`, `pkA`, and `pkB`. Using `C0` and the private keys
`x`, each secret `S` can be found:

```sh
x1.C0 = x1.(r.G) = r.(x1.G) = r.(Y1) = S1
```

Similarly for S2 and S3. Then:

```sh
M1 = C1 - S1
M2 = C2 - S2
M3 = C3 - S3
```

Once the original `M` s have been found, they can be brute-forced to reveal the original values.
