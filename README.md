# nightfall-sdk

A library for interacting with Nightfall.

## Core

## Fungible Token Commitments (ERC20)

These functions manage fungible token (ft) commitments

I'm open to suggestions on the names. For example, mintErc20Commitment?

### checkFtCorrectness()

### mintFtCommitment()

Gets fTokenShield

Gets vkId from the stored JSON file. (See `loadVk()` for more information).

Does some math

Calls `zokrates.computeProof()`.

Approves fTokenShield to withdraw ERC20 from the FToken.

Calls `zkp.mint()`

### transferFtCommitment()

Gets vkId from the stored JSON file. (See `loadVk()` for more information).

Does a bunch of math

Calls `zokrates.computeProof()`

Calls `zkp.transfer()`

### burnFtCommitment()

## Nonfungible Token Commitments (ERC-721)

These functions manage nonfungible token (nft) commitments.

Open to suggestions on the names.

### checkNftCommitment()

Calls `zkpUtils.recursiveHashConcat()`, then checks if that's correct.

Then calls `zkpUtils.getLeafIndexFromZCount()` and checks if that's correct.

Returns:

```js
{
    z_correct, // bool on whether or not recursiveHashConcat was correct
    z_onchain_correct, // bool on whether or not getLeafIndexFromZCount was correct.
}
```

### mintNftCommitment()

Grabs the nfTokenShield, Verifier and VerifierRegistry contracts.

Gets vkId from the stored JSON file. (See `loadVk()` for more information).

Calls `zkpUtils.recursiveHashConcat()`, then `cv.computeVectors()`.

Uses result from `zkpUtils.recursiveHashConcat()` to call `zokrates.computeProof()`.

Adds the NFTokenShield contract as an approver for the NFToken, then calls `zkp.mint()`.

Returns:

```js
{
    z_A, // recursiveHashConcat result
    z_A_index, // zkp.mint() result
}
```

### transferNftCommitment()

Grabs nfTokenShield, Verifier, and VerifierRegistry contracts.

Gets vkId from the stored JSON file. (See `loadVk()` for more information).

Calls some `zkpUtils.recursiveHashConcat()`, then `cv.computePath()`.

Calls `zokrates.computeProof`, then `zkp.transfer()`.

### burn NftCommitment()

Grabs nfTokenShield

Gets vkId from the stored JSON file. (See `loadVk()` for more information).

Calls some zkpUtils

Calls `zokrates.computeProof()`

Calls `zkp.burn()`.

## ZKP

### loadVk()

Current implementation: `zkp/src/vk-controller.loadVk()` Given the Verifying Key (vk) in JSON
format, it massages the data in a way that the VerifierRegistry contract can accept with its
`registerVk()` function.

The current implementation writes vkIds into a JSON file, but we can probably just return it and
expect the user to save the vkIds themselves.

### recursiveHashConcat()

Lift right out of ZKP.

# Zokrates Microservice

This microservice will handle any calls that require information from Zokrates.

### compile()

### computeWitness()

### setup()

### generateProof()
