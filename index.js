/**
Hashes a concatenation of items by
breaking the items up into 432 bit chunks, hashing those, plus any remainder
and then repeating the process until you end up with a single hash.  That way
we can generate a hash without needing to use more than a single sha round.  It's
not the same value as we'd get using rounds but it's at least doable.
*/
function recursiveHashConcat(...items) {
  const conc = items // run all the items together in a string
    .map(item => Buffer.from(strip0x(item), 'hex'))
    .reduce((acc, item) => concat(acc, item))
    .toString('hex');

  let hsh = hashC(conc);
  while (hsh.length > hashLength * 2) hsh = hashC(hsh); // have we reduced it to a single 216 bit hash?
  return ensure0x(hsh);
}
