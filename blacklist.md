# Blacklist

We require the ability to blacklist certain people or, more specifically, certain Ethereum addresses
from transacting under our KYC-regulated solution

## Data structures

Two data structures are used for this purpose:

- a Merkle Tree whose leaves are the zkp public keys of people who have not been blacklisted. This
  is called the Public Key Tree
- a hash-table list of blacklisted zkp public keys. This can be edited only by the owner of the
  shield contract (this is called the Blacklist).

## Protocol

### Mint

Alice, who is not blacklisted, makes a mint transaction. This is done in the same way as normal
Nightfall mint, although the zkp public key is a public parameter so that the shield contract can
check the correct key (the one associated with Alice) has been used.

The shield contract, as well as carrying out its normal mint actions, checks whether Alice's her
Ethereum Address (msg.sender) has a zkp public key associated with it. If does, the smart contract
checks whether her zkp public key is in the Blacklist. Finding that she isn't, it adds her zkp
public key to the Public Key Tree. It also stores an Ethereum Address -> Public key lookup, for ease
of blacklisting (this could be avoided by working directly with the Ethereum address but that would
require computation of a keccak hash in the proof, which is problematic)

### Transfer or Burn

Later, Alice wishes to transfer funds to Bob. She creates a conventional Nightfall transfer proof
(which may include KYC encryption) but she includes in the proof a stanza to prove that her zkp
public key is in the Address Tree, and therefore not blacklisted, and that it is indeed her public
key (by proving knowledge of the secret key). Note that nothing here reveals her public key, so her
identity is still secret.

The smart contract then proceeds as it would for a conventional transfer or burn.

### Blacklisting

To blacklist an address (only owner can do this) a lookup of the zkp public key corresponding to the
Ethereum address to be blacklisted is done, using the list created during mint (if creating the list
uses too much gas, it could be left as calldata and the logs searched). The Ethereum public key is
then removed from the Public Key Tree (which will entail re-computation of part of the tree) and
added to the Blacklist. This will have the effect of preventing any further transactions using that
key. If blacklisted Alice attempts to transact with a new zkp public key, this will fail because it
won't be in the Public Key Tree and the smart contract won't add it because it will have associated
a different public key with her address. Of course, she could use a new Ethereum address but that is
no different from conventional (non-ZKP) blacklisting and therefore sufficient.
