import crypto from 'crypto';

// Pure JS SHA-256 implementation for fast synchronous client-side hashing
// to avoid async Web Crypto API overhead in the tight search loop.
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i: number, j: number; // Used in loops

  const result = '';
  const words: number[] = [];
  const asciiLength = ascii[lengthProperty];
  
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let asciiBitLength = asciiLength * 8;
  
  words[asciiLength >> 2] |= 0x80 << (24 - ((asciiLength & 3) << 3));
  words[(((asciiLength + 8) >> 6) << 4) + 15] = asciiBitLength;

  for (i = 0; i < asciiLength; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - ((i & 3) << 3));
  }

  for (i = 0; i < words[lengthProperty]; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0);

    for (j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t1 = hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[j] + (w[j] || 0);
      const t2 = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }

    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  let finalHex = '';
  for (i = 0; i < 8; i++) {
    const wordHex = (hash[i] >>> 0).toString(16);
    finalHex += '00000000'.slice(wordHex.length) + wordHex;
  }
  return finalHex;
}

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'decoshop-superadmin-secret-2026';
const DIFFICULTY = 5; // Difficulty: hash must start with 5 hexadecimal zeroes (20 bits of difficulty)
const EXPIRATION_MS = 2 * 60 * 1000; // 2 minutes challenge validity

export interface PowChallenge {
  salt: string;
  timestamp: number;
  difficulty: number;
  signature: string;
}

export interface PowSolution {
  salt: string;
  timestamp: number;
  signature: string;
  nonce: number;
}

/**
 * Server action helper to generate a secure challenge token
 */
export function generateChallenge(): PowChallenge {
  const salt = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  
  // Create signature
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(`${salt}:${timestamp}:${DIFFICULTY}`);
  const signature = hmac.digest('hex');

  return {
    salt,
    timestamp,
    difficulty: DIFFICULTY,
    signature
  };
}

/**
 * Server-side validation of the challenge solution
 */
export function verifySolution(sol: PowSolution): boolean {
  const { salt, timestamp, signature, nonce } = sol;

  // 1. Check expiration
  if (Date.now() - timestamp > EXPIRATION_MS) {
    return false;
  }

  // 2. Validate signature
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(`${salt}:${timestamp}:${DIFFICULTY}`);
  const expectedSignature = hmac.digest('hex');
  if (signature !== expectedSignature) {
    return false;
  }

  // 3. Verify hash starts with DIFFICULTY number of zeroes
  const data = `${salt}:${timestamp}:${nonce}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  const prefix = '0'.repeat(DIFFICULTY);
  
  return hash.startsWith(prefix);
}

/**
 * Client-side solver. Searches for a nonce satisfying the difficulty.
 * Yields progress periodically to avoid UI freezing.
 */
export function solveChallengeSync(
  challenge: PowChallenge,
  onProgress?: (attempts: number) => void
): number {
  const { salt, timestamp, difficulty } = challenge;
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  
  while (true) {
    const data = `${salt}:${timestamp}:${nonce}`;
    const hash = sha256Sync(data);
    
    if (hash.startsWith(prefix)) {
      return nonce;
    }
    
    nonce++;
    if (nonce % 20000 === 0 && onProgress) {
      onProgress(nonce);
    }
  }
}
