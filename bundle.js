class EventEmitter {
    #listeners = {
    };
    #globalWriters = [];
    #onWriters = {
    };
    #limit;
    constructor(maxListenersPerEvent){
        this.#limit = maxListenersPerEvent ?? 10;
    }
    on(eventName, listener) {
        if (listener) {
            if (!this.#listeners[eventName]) {
                this.#listeners[eventName] = [];
            }
            if (this.#limit !== 0 && this.#listeners[eventName].length >= this.#limit) {
                throw new TypeError("Listeners limit reached: limit is " + this.#limit);
            }
            this.#listeners[eventName].push({
                once: false,
                cb: listener
            });
            return this;
        } else {
            if (!this.#onWriters[eventName]) {
                this.#onWriters[eventName] = [];
            }
            if (this.#limit !== 0 && this.#onWriters[eventName].length >= this.#limit) {
                throw new TypeError("Listeners limit reached: limit is " + this.#limit);
            }
            const { readable , writable  } = new TransformStream();
            this.#onWriters[eventName].push(writable.getWriter());
            return readable[Symbol.asyncIterator]();
        }
    }
    once(eventName, listener) {
        if (!this.#listeners[eventName]) {
            this.#listeners[eventName] = [];
        }
        if (this.#limit !== 0 && this.#listeners[eventName].length >= this.#limit) {
            throw new TypeError("Listeners limit reached: limit is " + this.#limit);
        }
        this.#listeners[eventName].push({
            once: true,
            cb: listener
        });
        return this;
    }
    off(eventName, listener) {
        if (eventName) {
            if (listener) {
                this.#listeners[eventName] = this.#listeners[eventName]?.filter(({ cb  })=>cb !== listener
                );
            } else {
                delete this.#listeners[eventName];
            }
        } else {
            this.#listeners = {
            };
        }
        return this;
    }
    async emit(eventName, ...args) {
        const listeners = this.#listeners[eventName]?.slice() ?? [];
        for (const { cb , once  } of listeners){
            cb(...args);
            if (once) {
                this.off(eventName, cb);
            }
        }
        if (this.#onWriters[eventName]) {
            for (const writer of this.#onWriters[eventName]){
                await writer.write(args);
            }
        }
        for (const writer of this.#globalWriters){
            await writer.write({
                name: eventName,
                value: args
            });
        }
    }
    async close(eventName) {
        this.off(eventName);
        if (eventName) {
            if (this.#onWriters[eventName]) {
                for (const writer of this.#onWriters[eventName]){
                    await writer.close();
                }
                delete this.#onWriters[eventName];
            }
        } else {
            for (const writers of Object.values(this.#onWriters)){
                for (const writer of writers){
                    await writer.close();
                }
            }
            this.#onWriters = {
            };
            for (const writer of this.#globalWriters){
                await writer.close();
            }
            this.#globalWriters = [];
        }
    }
    [Symbol.asyncIterator]() {
        if (this.#limit !== 0 && this.#globalWriters.length >= this.#limit) {
            throw new TypeError("Listeners limit reached: limit is " + this.#limit);
        }
        const { readable , writable  } = new TransformStream();
        this.#globalWriters.push(writable.getWriter());
        return readable[Symbol.asyncIterator]();
    }
}
class RawBinary extends Uint8Array {
    hex() {
        return [
            ...this
        ].map((x)=>x.toString(16).padStart(2, "0")
        ).join("");
    }
    binary() {
        return this;
    }
    base64() {
        return btoa(String.fromCharCode.apply(null, [
            ...this
        ]));
    }
    base64url() {
        let a = btoa(String.fromCharCode.apply(null, [
            ...this
        ])).replace(/=/g, "");
        a = a.replace(/\+/g, "-");
        a = a.replace(/\//g, "_");
        return a;
    }
    base32() {
        const lookup = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        const trim = [
            0,
            1,
            3,
            7,
            15,
            31,
            63,
            127,
            255
        ];
        let output = "";
        let bits = 0;
        let current = 0;
        for(let i = 0; i < this.length; i++){
            current = (current << 8) + this[i];
            bits += 8;
            while(bits >= 5){
                bits -= 5;
                output += lookup[current >> bits];
                current = current & trim[bits];
            }
        }
        if (bits > 0) {
            output += lookup[current << 5 - bits];
        }
        return output;
    }
    toString() {
        return new TextDecoder().decode(this);
    }
}
function base64(m) {
    return btoa(String.fromCharCode.apply(null, [
        ...m
    ])).replace(/=/g, "");
}
class WebCryptoAES {
    key;
    config;
    wkey = null;
    constructor(key4, config1){
        this.key = key4;
        this.config = config1;
    }
    async loadKey() {
        if (this.wkey === null) {
            this.wkey = await crypto.subtle.importKey("jwk", {
                kty: "oct",
                k: base64(this.key)
            }, "AES-CBC", true, [
                "encrypt",
                "decrypt"
            ]);
        }
        return this.wkey;
    }
    async encrypt(m) {
        const key1 = await this.loadKey();
        const option = {
            name: "AES-CBC",
            iv: this.config.iv
        };
        const data = await crypto.subtle.encrypt(option, key1, m);
        return new Uint8Array(data);
    }
    async decrypt(m) {
        const key1 = await this.loadKey();
        const option = {
            name: "AES-CBC",
            iv: this.config.iv
        };
        const data = await crypto.subtle.decrypt(option, key1, m);
        return new Uint8Array(data);
    }
}
function xor(a, b) {
    const c = new Uint8Array(a.length);
    for(let i = 0; i < c.length; i++){
        c[i] = a[i] ^ b[i % b.length];
    }
    return c;
}
class ECB {
    static encrypt(m, ciper, blockSize) {
        if (m.length % blockSize !== 0) throw "Message is not properly padded";
        const output = new Uint8Array(m.length);
        for(let i = 0; i < m.length; i += blockSize){
            output.set(ciper.encrypt(m.slice(i, i + blockSize)), i);
        }
        return output;
    }
    static decrypt(m, ciper, blockSize) {
        if (m.length % blockSize !== 0) throw "Message is not properly padded";
        const output = new Uint8Array(m.length);
        for(let i = 0; i < m.length; i += blockSize){
            output.set(ciper.decrypt(m.slice(i, i + blockSize)), i);
        }
        return output;
    }
}
class CFB {
    static encrypt(m, ciper, blockSize, iv) {
        const output = new Uint8Array(m.length);
        let prev = iv;
        for(let i = 0; i < m.length; i += blockSize){
            prev = xor(m.slice(i, i + blockSize), ciper.encrypt(prev));
            output.set(prev, i);
        }
        return output;
    }
    static decrypt(m, ciper, blockSize, iv) {
        const output = new Uint8Array(m.length);
        let prev = iv;
        for(let i = 0; i < m.length; i += blockSize){
            const t = m.slice(i, Math.min(i + blockSize, m.length));
            output.set(xor(t, ciper.encrypt(prev)), i);
            prev = t;
        }
        return output;
    }
}
class CBC {
    static encrypt(m, ciper, blockSize, iv) {
        const output = new Uint8Array(m.length);
        let prev = iv;
        for(let i = 0; i < m.length; i += blockSize){
            prev = ciper.encrypt(xor(m.slice(i, i + blockSize), prev));
            output.set(prev, i);
        }
        return output;
    }
    static decrypt(m, ciper, blockSize, iv) {
        const output = new Uint8Array(m.length);
        let prev = iv;
        for(let i = 0; i < m.length; i += blockSize){
            const t = m.slice(i, i + blockSize);
            output.set(xor(ciper.decrypt(t), prev), i);
            prev = t;
        }
        return output;
    }
}
function pad(m) {
    const blockNumber = Math.ceil((m.length + 1) / 16);
    const paddedMessageLength = blockNumber * 16;
    const remainedLength = paddedMessageLength - m.length;
    const paddedMessage = new Uint8Array(paddedMessageLength);
    paddedMessage.set(m, 0);
    paddedMessage.set(new Array(remainedLength).fill(remainedLength), m.length);
    return paddedMessage;
}
function unpad(m) {
    const lastByte = m[m.length - 1];
    return new Uint8Array(m.slice(0, m.length - lastByte));
}
class BlockCiperOperation {
    static encrypt(m, ciper, blockSize, config) {
        const computedConfig = {
            mode: "cbc",
            padding: "pkcs5",
            ...config
        };
        const computedIV = typeof computedConfig.iv === "string" ? new TextEncoder().encode(computedConfig.iv) : computedConfig.iv;
        if (blockSize !== computedIV?.length) throw "Invalid IV size";
        if (computedConfig.mode === "ecb") {
            return ECB.encrypt(pad(m), ciper, 16);
        } else if (computedConfig.mode === "cbc") {
            return CBC.encrypt(pad(m), ciper, 16, computedIV);
        } else if (computedConfig.mode === "cfb") {
            return CFB.encrypt(m, ciper, 16, computedIV);
        } else throw "Not implemented";
    }
    static decrypt(m, ciper, blockSize, config) {
        const computedConfig = {
            mode: "cbc",
            padding: "pkcs5",
            ...config
        };
        const computedIV = typeof computedConfig.iv === "string" ? new TextEncoder().encode(computedConfig.iv) : computedConfig.iv;
        if (blockSize !== computedIV?.length) throw "Invalid IV size";
        let output;
        if (computedConfig.mode === "ecb") {
            output = ECB.decrypt(m, ciper, 16);
        } else if (computedConfig.mode === "cbc") {
            output = CBC.decrypt(m, ciper, 16, computedIV);
        } else if (computedConfig.mode === "cfb") {
            return CFB.decrypt(m, ciper, 16, computedIV);
        } else throw "Not implemented";
        return unpad(output);
    }
}
const SBOX = [
    99,
    124,
    119,
    123,
    242,
    107,
    111,
    197,
    48,
    1,
    103,
    43,
    254,
    215,
    171,
    118,
    202,
    130,
    201,
    125,
    250,
    89,
    71,
    240,
    173,
    212,
    162,
    175,
    156,
    164,
    114,
    192,
    183,
    253,
    147,
    38,
    54,
    63,
    247,
    204,
    52,
    165,
    229,
    241,
    113,
    216,
    49,
    21,
    4,
    199,
    35,
    195,
    24,
    150,
    5,
    154,
    7,
    18,
    128,
    226,
    235,
    39,
    178,
    117,
    9,
    131,
    44,
    26,
    27,
    110,
    90,
    160,
    82,
    59,
    214,
    179,
    41,
    227,
    47,
    132,
    83,
    209,
    0,
    237,
    32,
    252,
    177,
    91,
    106,
    203,
    190,
    57,
    74,
    76,
    88,
    207,
    208,
    239,
    170,
    251,
    67,
    77,
    51,
    133,
    69,
    249,
    2,
    127,
    80,
    60,
    159,
    168,
    81,
    163,
    64,
    143,
    146,
    157,
    56,
    245,
    188,
    182,
    218,
    33,
    16,
    255,
    243,
    210,
    205,
    12,
    19,
    236,
    95,
    151,
    68,
    23,
    196,
    167,
    126,
    61,
    100,
    93,
    25,
    115,
    96,
    129,
    79,
    220,
    34,
    42,
    144,
    136,
    70,
    238,
    184,
    20,
    222,
    94,
    11,
    219,
    224,
    50,
    58,
    10,
    73,
    6,
    36,
    92,
    194,
    211,
    172,
    98,
    145,
    149,
    228,
    121,
    231,
    200,
    55,
    109,
    141,
    213,
    78,
    169,
    108,
    86,
    244,
    234,
    101,
    122,
    174,
    8,
    186,
    120,
    37,
    46,
    28,
    166,
    180,
    198,
    232,
    221,
    116,
    31,
    75,
    189,
    139,
    138,
    112,
    62,
    181,
    102,
    72,
    3,
    246,
    14,
    97,
    53,
    87,
    185,
    134,
    193,
    29,
    158,
    225,
    248,
    152,
    17,
    105,
    217,
    142,
    148,
    155,
    30,
    135,
    233,
    206,
    85,
    40,
    223,
    140,
    161,
    137,
    13,
    191,
    230,
    66,
    104,
    65,
    153,
    45,
    15,
    176,
    84,
    187,
    22, 
];
const INV_SBOX = [
    82,
    9,
    106,
    213,
    48,
    54,
    165,
    56,
    191,
    64,
    163,
    158,
    129,
    243,
    215,
    251,
    124,
    227,
    57,
    130,
    155,
    47,
    255,
    135,
    52,
    142,
    67,
    68,
    196,
    222,
    233,
    203,
    84,
    123,
    148,
    50,
    166,
    194,
    35,
    61,
    238,
    76,
    149,
    11,
    66,
    250,
    195,
    78,
    8,
    46,
    161,
    102,
    40,
    217,
    36,
    178,
    118,
    91,
    162,
    73,
    109,
    139,
    209,
    37,
    114,
    248,
    246,
    100,
    134,
    104,
    152,
    22,
    212,
    164,
    92,
    204,
    93,
    101,
    182,
    146,
    108,
    112,
    72,
    80,
    253,
    237,
    185,
    218,
    94,
    21,
    70,
    87,
    167,
    141,
    157,
    132,
    144,
    216,
    171,
    0,
    140,
    188,
    211,
    10,
    247,
    228,
    88,
    5,
    184,
    179,
    69,
    6,
    208,
    44,
    30,
    143,
    202,
    63,
    15,
    2,
    193,
    175,
    189,
    3,
    1,
    19,
    138,
    107,
    58,
    145,
    17,
    65,
    79,
    103,
    220,
    234,
    151,
    242,
    207,
    206,
    240,
    180,
    230,
    115,
    150,
    172,
    116,
    34,
    231,
    173,
    53,
    133,
    226,
    249,
    55,
    232,
    28,
    117,
    223,
    110,
    71,
    241,
    26,
    113,
    29,
    41,
    197,
    137,
    111,
    183,
    98,
    14,
    170,
    24,
    190,
    27,
    252,
    86,
    62,
    75,
    198,
    210,
    121,
    32,
    154,
    219,
    192,
    254,
    120,
    205,
    90,
    244,
    31,
    221,
    168,
    51,
    136,
    7,
    199,
    49,
    177,
    18,
    16,
    89,
    39,
    128,
    236,
    95,
    96,
    81,
    127,
    169,
    25,
    181,
    74,
    13,
    45,
    229,
    122,
    159,
    147,
    201,
    156,
    239,
    160,
    224,
    59,
    77,
    174,
    42,
    245,
    176,
    200,
    235,
    187,
    60,
    131,
    83,
    153,
    97,
    23,
    43,
    4,
    126,
    186,
    119,
    214,
    38,
    225,
    105,
    20,
    99,
    85,
    33,
    12,
    125, 
];
const RCON = [
    0,
    1,
    2,
    4,
    8,
    16,
    32,
    64,
    128,
    27,
    54
];
function xtime(n, x) {
    if (x === 1) return n;
    let output = 0;
    let multiply = n;
    while(x > 0){
        if (x & 1) output ^= multiply;
        multiply = multiply & 128 ? multiply << 1 ^ 283 : multiply << 1;
        x = x >> 1;
    }
    return output & 255;
}
function rotWord(keySchedule, column) {
    const offset = column * 4;
    const tmp = keySchedule[offset];
    keySchedule[offset] = keySchedule[offset + 1];
    keySchedule[offset + 1] = keySchedule[offset + 2];
    keySchedule[offset + 2] = keySchedule[offset + 3];
    keySchedule[offset + 3] = tmp;
}
function subWord(keySchedule, column) {
    const offset = column * 4;
    for(let i = 0; i < 4; i++){
        keySchedule[offset + i] = SBOX[keySchedule[offset + i]];
    }
}
function keyExpansion(key1) {
    const Nb = 4;
    const Nk = key1.length / 4;
    const Nr = Nk + 6;
    const keySchedule = new Uint8Array(16 * (Nr + 1));
    keySchedule.set(key1, 0);
    for(let i = Nk; i < 4 * (Nr + 1); i++){
        const prevOffset = (i - Nk) * 4;
        const offset = i * 4;
        keySchedule[offset] = keySchedule[offset - 4];
        keySchedule[offset + 1] = keySchedule[offset - 3];
        keySchedule[offset + 2] = keySchedule[offset - 2];
        keySchedule[offset + 3] = keySchedule[offset - 1];
        if (i % Nk === 0) {
            rotWord(keySchedule, i);
            subWord(keySchedule, i);
            keySchedule[offset] ^= RCON[i / Nk];
        } else if (Nk > 6 && i % Nk === 4) {
            subWord(keySchedule, i);
        }
        keySchedule[offset] ^= keySchedule[prevOffset];
        keySchedule[offset + 1] ^= keySchedule[prevOffset + 1];
        keySchedule[offset + 2] ^= keySchedule[prevOffset + 2];
        keySchedule[offset + 3] ^= keySchedule[prevOffset + 3];
    }
    return keySchedule;
}
class AESBlockCiper {
    keySchedule;
    constructor(key1){
        this.keySchedule = keyExpansion(key1);
    }
    subBytes(block) {
        for(let i = 0; i < block.length; i++){
            block[i] = SBOX[block[i]];
        }
    }
    inverseSubBytes(block) {
        for(let i = 0; i < block.length; i++){
            block[i] = INV_SBOX[block[i]];
        }
    }
    shiftRow(block) {
        let t = block[1];
        block[1] = block[5];
        block[5] = block[9];
        block[9] = block[13];
        block[13] = t;
        t = block[10];
        block[10] = block[2];
        block[2] = t;
        t = block[14];
        block[14] = block[6];
        block[6] = t;
        t = block[15];
        block[15] = block[11];
        block[11] = block[7];
        block[7] = block[3];
        block[3] = t;
    }
    inverseShiftRow(block) {
        let t = block[13];
        block[13] = block[9];
        block[9] = block[5];
        block[5] = block[1];
        block[1] = t;
        t = block[10];
        block[10] = block[2];
        block[2] = t;
        t = block[14];
        block[14] = block[6];
        block[6] = t;
        t = block[3];
        block[3] = block[7];
        block[7] = block[11];
        block[11] = block[15];
        block[15] = t;
    }
    addRoundKey(state, round) {
        for(let i = 0; i < 16; i++){
            state[i] ^= this.keySchedule[round * 16 + i];
        }
    }
    mixColumn(block) {
        for(let i = 0; i < 4; i++){
            const offset = i * 4;
            const a = [
                block[offset],
                block[offset + 1],
                block[offset + 2],
                block[offset + 3], 
            ];
            block[offset] = xtime(a[0], 2) ^ xtime(a[1], 3) ^ xtime(a[2], 1) ^ xtime(a[3], 1);
            block[offset + 1] = xtime(a[0], 1) ^ xtime(a[1], 2) ^ xtime(a[2], 3) ^ xtime(a[3], 1);
            block[offset + 2] = xtime(a[0], 1) ^ xtime(a[1], 1) ^ xtime(a[2], 2) ^ xtime(a[3], 3);
            block[offset + 3] = xtime(a[0], 3) ^ xtime(a[1], 1) ^ xtime(a[2], 1) ^ xtime(a[3], 2);
        }
    }
    inverseMixColumn(block) {
        for(let i = 0; i < 4; i++){
            const offset = i * 4;
            const a = [
                block[offset],
                block[offset + 1],
                block[offset + 2],
                block[offset + 3], 
            ];
            block[offset] = xtime(a[0], 14) ^ xtime(a[1], 11) ^ xtime(a[2], 13) ^ xtime(a[3], 9);
            block[offset + 1] = xtime(a[0], 9) ^ xtime(a[1], 14) ^ xtime(a[2], 11) ^ xtime(a[3], 13);
            block[offset + 2] = xtime(a[0], 13) ^ xtime(a[1], 9) ^ xtime(a[2], 14) ^ xtime(a[3], 11);
            block[offset + 3] = xtime(a[0], 11) ^ xtime(a[1], 13) ^ xtime(a[2], 9) ^ xtime(a[3], 14);
        }
    }
    encrypt(m) {
        const nb = 4;
        const nr = this.keySchedule.length / 16 - 1;
        const state = new Uint8Array(m);
        this.addRoundKey(state, 0);
        for(let i = 1; i < nr; i++){
            this.subBytes(state);
            this.shiftRow(state);
            this.mixColumn(state);
            this.addRoundKey(state, i);
        }
        this.subBytes(state);
        this.shiftRow(state);
        this.addRoundKey(state, nr);
        return state;
    }
    decrypt(m) {
        const nb = 4;
        const nr = this.keySchedule.length / 16 - 1;
        const state = new Uint8Array(m);
        this.addRoundKey(state, nr);
        for(let i = nr - 1; i > 0; i--){
            this.inverseShiftRow(state);
            this.inverseSubBytes(state);
            this.addRoundKey(state, i);
            this.inverseMixColumn(state);
        }
        this.inverseShiftRow(state);
        this.inverseSubBytes(state);
        this.addRoundKey(state, 0);
        return state;
    }
}
class PureAES {
    ciper;
    config;
    constructor(key2, config2){
        this.ciper = new AESBlockCiper(key2);
        this.config = config2;
    }
    async encrypt(m) {
        return BlockCiperOperation.encrypt(m, this.ciper, 16, this.config);
    }
    async decrypt(m) {
        return BlockCiperOperation.decrypt(m, this.ciper, 16, this.config);
    }
}
function computeMessage(m) {
    return typeof m === "string" ? new TextEncoder().encode(m) : m;
}
class AES {
    ciper;
    constructor(key3, options){
        const computedKey = computeMessage(key3);
        const computedOption = {
            mode: "cbc",
            ...options,
            iv: options?.iv ? computeMessage(options.iv) : new Uint8Array(16)
        };
        if ([
            16,
            24,
            32
        ].indexOf(computedKey.length) < 0) {
            throw "Invalid key length";
        }
        if (crypto.subtle && options?.mode === "cbc") {
            this.ciper = new WebCryptoAES(computedKey, computedOption);
        } else {
            this.ciper = new PureAES(computedKey, computedOption);
        }
    }
    async encrypt(m) {
        return new RawBinary(await this.ciper.encrypt(computeMessage(m)));
    }
    async decrypt(m) {
        return new RawBinary(await this.ciper.decrypt(computeMessage(m)));
    }
}
const sizes = {
    x: 1,
    c: 1,
    b: 1,
    B: 1,
    h: 2,
    H: 2,
    i: 4,
    I: 4,
    l: 8,
    L: 8,
    f: 4,
    d: 8,
    s: 1,
    "?": 1
};
const types = Object.keys(sizes);
function parseFmt(fmt) {
    const info = {
        le: false,
        size: 0,
        seq: []
    };
    if (fmt.startsWith("<")) {
        info.le = true;
        fmt = fmt.slice(1);
    } else if (fmt.startsWith(">") || fmt.startsWith("!") || fmt.startsWith("@") || fmt.startsWith("=")) {
        fmt = fmt.slice(1);
    }
    fmt = fmt.trim();
    let type = "";
    let state = "";
    let rep = "";
    const endType = ()=>{
        if (type !== "type") return;
        let r = rep == "" ? 1 : parseInt(rep);
        if (!types.includes(state)) throw new Error("Invalid type: " + state);
        if (state == "s") {
            info.seq.push(`${r}s`);
            info.size += r;
        } else for(let i = 0; i < r; i++){
            info.size += sizes[state];
            info.seq.push(state);
        }
        state = "";
        rep = "";
        type = "";
    };
    fmt.split("").forEach((ch, i)=>{
        if (ch.match(/\d/)) {
            if (type == "type") {
                if (types.includes(state)) {
                    endType();
                    type = "rep";
                    rep += ch;
                } else state += ch;
            } else if (type == "rep" || type == "") {
                rep += ch;
            }
        } else if (ch.match(/(\w|\?)/)) {
            endType();
            type = "type";
            state += ch;
        } else if ([
            " ",
            ","
        ].includes(ch)) {
            if (state == "" || state == "rep") {
            } else {
                endType();
            }
            type = "";
            rep = "";
            state = "";
        } else {
            throw new Error(`Invalid token "${ch}" at position ${i + 1}`);
        }
    });
    if (type == "type") endType();
    return info;
}
class Struct {
    static pack(fmt, data) {
        const info = parseFmt(fmt);
        const result = new Uint8Array(info.size);
        const view = new DataView(result.buffer);
        let idx = 0;
        const le = info.le;
        let offset = 0;
        for(let _i in info.seq){
            let i = Number(_i);
            const ch = info.seq[i];
            if (ch == "x") continue;
            let val = data[idx];
            if (val == undefined) throw new Error("Expected data at index " + idx);
            if (ch == "?") {
                view.setUint8(offset, typeof val === "bigint" ? val === 0n ? 0 : 1 : typeof val === "number" ? val === 0 ? 0 : 1 : typeof val === "string" ? val === "0" ? 0 : 1 : typeof val === "boolean" ? val === true ? 1 : 0 : 0);
            } else if (ch == "b" || ch == "B" || ch == "c") {
                if (ch == "c") val = typeof val === "string" ? val.charCodeAt(0) : val;
                const u = ch == "b";
                const v = Number(val);
                if (u) view.setUint8(offset, v);
                else view.setInt8(offset, v);
            } else if (ch == "h" || ch == "H") {
                const u = ch == "h";
                const v = Number(val);
                if (u) view.setUint16(offset, v, le);
                else view.setInt16(offset, v, le);
            } else if (ch == "i" || ch == "I") {
                const u = ch == "i";
                const v = Number(val);
                if (u) view.setUint32(offset, v, le);
                else view.setInt32(offset, v, le);
            } else if (ch == "l" || ch == "L") {
                const u = ch == "l";
                const v = BigInt(val);
                if (u) view.setBigUint64(offset, v, le);
                else view.setBigInt64(offset, v, le);
            } else if (ch == "f") {
                const v = Number(val);
                view.setFloat32(offset, v, le);
            } else if (ch == "d") {
                const v = Number(val);
                view.setFloat64(offset, v, le);
            } else if (ch.endsWith("s")) {
                const size = Number(ch.substr(0, ch.length - 1));
                if (typeof val !== "string") throw new Error("Expected string");
                if (val.length !== size) throw new Error("Invalid string size");
                result.set(new TextEncoder().encode(val), offset);
                offset += size;
                idx += 1;
                continue;
            } else throw new Error("Invalid sequence: " + ch);
            idx += 1;
            offset += sizes[ch];
        }
        return result;
    }
    static unpack(fmt, data) {
        const info = parseFmt(fmt);
        const res = [];
        const view = data instanceof DataView ? data : data instanceof Uint8Array ? new DataView(data.buffer) : Array.isArray(data) ? new DataView(new Uint8Array(data).buffer) : new DataView(data);
        if (view.byteLength < info.size) throw new Error("Not enough bytes in Buffer");
        let offset = 0;
        for (const ch of info.seq){
            if (ch == "x") {
            } else if (ch == "b" || ch == "B") {
                const u = ch == "b";
                const v = u ? view.getUint8(offset) : view.getInt8(offset);
                res.push(v);
            } else if (ch == "c") {
                const v = view.getUint8(offset);
                res.push(String.fromCharCode(v));
            } else if (ch == "?") {
                const v = view.getUint8(offset) == 1;
                res.push(v);
            } else if (ch == "h" || ch == "H") {
                const u = ch == "h";
                const v = u ? view.getUint16(offset, info.le) : view.getInt16(offset, info.le);
                res.push(v);
            } else if (ch == "i" || ch == "I") {
                const u = ch == "i";
                const v = u ? view.getUint32(offset, info.le) : view.getInt32(offset, info.le);
                res.push(v);
            } else if (ch == "l" || ch == "L") {
                const u = ch == "l";
                const v = u ? view.getBigUint64(offset, info.le) : view.getBigInt64(offset, info.le);
                res.push(v);
            } else if (ch == "f") {
                const v = view.getFloat32(offset, info.le);
                res.push(v);
            } else if (ch == "d") {
                const v = view.getFloat64(offset, info.le);
                res.push(v);
            } else if (ch.endsWith("s")) {
                const size = Number(ch.substr(0, ch.length - 1));
                const bytes = new Uint8Array(view.buffer.slice(offset, offset + size));
                res.push(new TextDecoder("utf-8").decode(bytes));
                offset += size;
                continue;
            }
            offset += sizes[ch];
        }
        return res;
    }
}
function crc32(arr) {
    if (typeof arr === "string") {
        arr = new TextEncoder().encode(arr);
    }
    let crc = -1, i, j, l, temp, poly = 3988292384;
    for(i = 0, l = arr.length; i < l; i += 1){
        temp = (crc ^ arr[i]) & 255;
        for(j = 0; j < 8; j += 1){
            if ((temp & 1) === 1) {
                temp = temp >>> 1 ^ poly;
            } else {
                temp = temp >>> 1;
            }
        }
        crc = crc >>> 8 ^ temp;
    }
    return numberToHex(crc ^ -1);
}
class Crc32Stream {
    bytes = [];
    poly = 3988292384;
    crc = 0 ^ -1;
    encoder = new TextEncoder();
    #crc32 = "";
    constructor(){
        this.reset();
    }
    get crc32() {
        return this.#crc32;
    }
    reset() {
        this.#crc32 = "";
        this.crc = 0 ^ -1;
        for(let n = 0; n < 256; n += 1){
            let c = n;
            for(let k = 0; k < 8; k += 1){
                if (c & 1) {
                    c = this.poly ^ c >>> 1;
                } else {
                    c = c >>> 1;
                }
            }
            this.bytes[n] = c >>> 0;
        }
    }
    append(arr) {
        if (typeof arr === "string") {
            arr = this.encoder.encode(arr);
        }
        let crc = this.crc;
        for(let i = 0, l = arr.length; i < l; i += 1){
            crc = crc >>> 8 ^ this.bytes[(crc ^ arr[i]) & 255];
        }
        this.crc = crc;
        this.#crc32 = numberToHex(crc ^ -1);
        return this.#crc32;
    }
}
function numberToHex(n) {
    return (n >>> 0).toString(16);
}
const Services = {
    Main1: "0000fee0-0000-1000-8000-00805f9b34fb",
    Main2: "0000fee1-0000-1000-8000-00805f9b34fb",
    Alert: "00001802-0000-1000-8000-00805f9b34fb",
    AlertNotification: "00001811-0000-1000-8000-00805f9b34fb",
    HeartRate: "0000180d-0000-1000-8000-00805f9b34fb",
    DeviceInfo: "0000180a-0000-1000-8000-00805f9b34fb",
    DfuFirmware: "00001530-0000-3512-2118-0009af100700",
    Unknown1: "00003802-0000-1000-8000-00805f9b34fb",
    Unknown2: "00001801-0000-1000-8000-00805f9b34fb",
    Unknown3: "00001800-0000-1000-8000-00805f9b34fb"
};
const Chars = {
    Hz: "00000002-0000-3512-2118-0009af100700",
    Sensor: "00000001-0000-3512-2118-0009af100700",
    Auth: "00000009-0000-3512-2118-0009af100700",
    HeartRateMeasure: "00002a37-0000-1000-8000-00805f9b34fb",
    HeartRateControl: "00002a39-0000-1000-8000-00805f9b34fb",
    Alert: "00002a06-0000-1000-8000-00805f9b34fb",
    CustomAlert: "00002a46-0000-1000-8000-00805f9b34fb",
    Battery: "00000006-0000-3512-2118-0009af100700",
    Steps: "00000007-0000-3512-2118-0009af100700",
    ControlPoint: "0000ff05-0000-1000-8000-00805f9b34fb",
    FirmwareData: "0000ff08-0000-1000-8000-00805f9b34fb",
    LeParams: "0000ff09-0000-1000-8000-00805f9b34fb",
    Revision: 10792,
    Serial: 10789,
    HrdwRevision: 10791,
    Configuration: "00000003-0000-3512-2118-0009af100700",
    ChunkedTransfer: "00000020-0000-3512-2118-0009af100700",
    Events: "00000010-0000-3512-2118-0009af100700",
    UserSettings: "00000008-0000-3512-2118-0009af100700",
    ActivityData: "00000005-0000-3512-2118-0009af100700",
    Fetch: "00000004-0000-3512-2118-0009af100700",
    CurrentTime: "00002a2b-0000-1000-8000-00805f9b34fb",
    Age: "00002a80-0000-1000-8000-00805f9b34fb",
    DfuFirmware: "00001531-0000-3512-2118-0009af100700",
    DfuFirmwareWrite: "00001532-0000-3512-2118-0009af100700"
};
var AlertType;
(function(AlertType1) {
    AlertType1[AlertType1["None"] = 0] = "None";
    AlertType1[AlertType1["Email"] = 1] = "Email";
    AlertType1[AlertType1["Phone"] = 2] = "Phone";
    AlertType1[AlertType1["Call"] = 3] = "Call";
    AlertType1[AlertType1["CallNotif"] = 4] = "CallNotif";
    AlertType1[AlertType1["Message"] = 5] = "Message";
})(AlertType || (AlertType = {
}));
var MusicState;
(function(MusicState1) {
    MusicState1[MusicState1["Playing"] = 1] = "Playing";
    MusicState1[MusicState1["Paused"] = 0] = "Paused";
})(MusicState || (MusicState = {
}));
var WeekDay;
(function(WeekDay1) {
    WeekDay1[WeekDay1["Monday"] = 1] = "Monday";
    WeekDay1[WeekDay1["Tuesday"] = 2] = "Tuesday";
    WeekDay1[WeekDay1["Wednesday"] = 4] = "Wednesday";
    WeekDay1[WeekDay1["Thursday"] = 8] = "Thursday";
    WeekDay1[WeekDay1["Friday"] = 16] = "Friday";
    WeekDay1[WeekDay1["Saturday"] = 32] = "Saturday";
    WeekDay1[WeekDay1["Sunday"] = 64] = "Sunday";
    WeekDay1[WeekDay1["Everyday"] = 128] = "Everyday";
})(WeekDay || (WeekDay = {
}));
var AuthState;
(function(AuthState1) {
    AuthState1["None"] = "None";
    AuthState1["KeySendFail"] = "Key Send Failed";
    AuthState1["RequestRdnError"] = "Request Random Error";
    AuthState1["Success"] = "Success";
    AuthState1["EncryptionKeyFailed"] = "Encryption Key Failed";
    AuthState1["IncorrectKey"] = "Incorrect Auth Key";
    AuthState1["UnknownError"] = "Unknown Error";
})(AuthState || (AuthState = {
}));
var WorkoutType;
(function(WorkoutType1) {
    WorkoutType1[WorkoutType1["OutdoorRunning"] = 1] = "OutdoorRunning";
    WorkoutType1[WorkoutType1["Treadmill"] = 2] = "Treadmill";
    WorkoutType1[WorkoutType1["Cycling"] = 3] = "Cycling";
    WorkoutType1[WorkoutType1["Walking"] = 4] = "Walking";
    WorkoutType1[WorkoutType1["Freestyle"] = 5] = "Freestyle";
    WorkoutType1[WorkoutType1["PoolSwimming"] = 6] = "PoolSwimming";
})(WorkoutType || (WorkoutType = {
}));
var BatteryStatus;
(function(BatteryStatus1) {
    BatteryStatus1["Normal"] = "Normal";
    BatteryStatus1["Charging"] = "Charging";
})(BatteryStatus || (BatteryStatus = {
}));
function parseBatteryResponse(data) {
    const status = data.getInt8(2);
    const level = data.getInt8(1);
    const lastLevel = data.getInt8(19);
    const lastChange = parseDate(new DataView(data.buffer.slice(11, 18)));
    const lastOff = parseDate(new DataView(data.buffer.slice(3, 10)));
    return {
        level,
        lastLevel,
        status: status == 0 ? BatteryStatus.Normal : BatteryStatus.Charging,
        lastChange,
        lastOff
    };
}
function parseDate(data) {
    const year = data.getInt16(0, true);
    const month = data.getInt8(2);
    const date = data.getInt8(3);
    const hours = data.getInt8(4);
    const minutes = data.getInt8(5);
    const seconds = data.getInt8(6);
    let day = undefined;
    try {
        let v = data.getInt8(7);
        day = v;
    } catch (e) {
    }
    let fractions = undefined;
    try {
        let v1 = data.getInt8(8);
        fractions = v1;
    } catch (e) {
    }
    return {
        year,
        month,
        date,
        hours,
        minutes,
        seconds,
        day,
        fractions
    };
}
function packDate(date) {
    const buffer = new ArrayBuffer(7 + (date.day !== undefined ? date.fractions !== undefined ? 2 : 1 : 0));
    const data = new DataView(buffer);
    data.setInt16(0, date.year);
    data.setInt8(2, date.month);
    data.setInt8(3, date.date);
    data.setInt8(4, date.hours);
    data.setInt8(5, date.minutes);
    data.setInt8(6, date.seconds);
    if (date.day) data.setInt8(7, date.day);
    if (date.fractions) data.setInt8(8, date.fractions);
    return data;
}
function parseStatus(data) {
    const steps = data.getInt16(1, true);
    const meters = data.getInt16(5, true);
    const fatsBurned = data.getInt16(2, true);
    const calories = data.getInt8(9);
    return {
        steps,
        meters,
        fatsBurned,
        calories
    };
}
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
function timeToDate(time) {
    return new Date(`${time.month}/${time.date}/${time.year} ${time.hour}:${time.minute}`);
}
function dateToTime(date) {
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        date: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes()
    };
}
function chunk(arr, size) {
    const res = [];
    let idx = 0;
    arr.forEach((e)=>{
        if (!res[idx]) res[idx] = [];
        res[idx].push(e);
        if (res[idx].length >= size) idx++;
    });
    return res;
}
function byteq(left, right) {
    if (left.byteLength < right.length) return false;
    let match = true;
    right.forEach((e, i)=>{
        if (!match) return;
        if (e != left.getUint8(i)) match = false;
    });
    return match;
}
function bytesFromHex(hex) {
    return hex.split("").reduce((resultArray, item, index)=>{
        const chunkIndex = Math.floor(index / 2);
        if (!resultArray[chunkIndex]) {
            resultArray[chunkIndex] = [];
        }
        resultArray[chunkIndex].push(item);
        return resultArray;
    }, []).map((e)=>e.join("")
    ).map((e)=>parseInt(e, 16)
    );
}
console.log(new TextDecoder().decode(new Uint8Array(bytesFromHex(Deno.args[0]))));
class Base {
    band;
    constructor(band){
        Object.defineProperty(this, "band", {
            value: band
        });
    }
}
class BandServices extends Base {
    main1;
    main2;
    heartrate;
    dfuFirmware;
    alert;
    alertNotification;
    deviceInfo;
    unknown1;
    unknown2;
    unknown3;
    async init() {
        this.main1 = await this.band.gatt.getPrimaryService(Services.Main1);
        this.main2 = await this.band.gatt.getPrimaryService(Services.Main2);
        this.heartrate = await this.band.gatt.getPrimaryService(Services.HeartRate);
        this.dfuFirmware = await this.band.gatt.getPrimaryService(Services.DfuFirmware);
        this.alert = await this.band.gatt.getPrimaryService(Services.Alert);
        this.deviceInfo = await this.band.gatt.getPrimaryService(Services.DeviceInfo);
        this.alertNotification = await this.band.gatt.getPrimaryService(Services.AlertNotification);
        this.unknown1 = await this.band.gatt.getPrimaryService(Services.Unknown1);
        this.unknown2 = await this.band.gatt.getPrimaryService(Services.Unknown2);
        this.unknown3 = await this.band.gatt.getPrimaryService(Services.Unknown3);
    }
}
class BandCharacteristics extends Base {
    auth;
    heartCtrl;
    heartMeasure;
    fetch;
    activity;
    chunked;
    events;
    revision;
    hrdwRevision;
    battery;
    currentTime;
    config;
    alert;
    customAlert;
    steps;
    firm;
    firmWrite;
    hz;
    sensor;
    async init() {
        this.auth = await this.band.services.main2.getCharacteristic(Chars.Auth);
        this.heartCtrl = await this.band.services.heartrate.getCharacteristic(Chars.HeartRateControl);
        this.heartMeasure = await this.band.services.heartrate.getCharacteristic(Chars.HeartRateMeasure);
        this.fetch = await this.band.services.main1.getCharacteristic(Chars.Fetch);
        this.activity = await this.band.services.main1.getCharacteristic(Chars.ActivityData);
        this.chunked = await this.band.services.main1.getCharacteristic(Chars.ChunkedTransfer);
        this.events = await this.band.services.main1.getCharacteristic(Chars.Events);
        this.revision = await this.band.services.deviceInfo.getCharacteristic(Chars.Revision);
        this.hrdwRevision = await this.band.services.deviceInfo.getCharacteristic(Chars.HrdwRevision);
        this.battery = await this.band.services.main1.getCharacteristic(Chars.Battery);
        this.currentTime = await this.band.services.main1.getCharacteristic(Chars.CurrentTime);
        this.config = await this.band.services.main1.getCharacteristic(Chars.Configuration);
        this.steps = await this.band.services.main1.getCharacteristic(Chars.Steps);
        this.alert = await this.band.services.alert.getCharacteristic(Chars.Alert);
        this.customAlert = await this.band.services.alertNotification.getCharacteristic(Chars.CustomAlert);
        this.firm = await this.band.services.dfuFirmware.getCharacteristic(Chars.DfuFirmware);
        this.firmWrite = await this.band.services.dfuFirmware.getCharacteristic(Chars.DfuFirmwareWrite);
        this.hz = await this.band.services.main1.getCharacteristic(Chars.Hz);
        this.sensor = await this.band.services.main1.getCharacteristic(Chars.Sensor);
        this.auth.oncharacteristicvaluechanged = async ()=>{
            console.log("Auth Change", [
                ...new Uint8Array(this.auth.value?.buffer ?? new ArrayBuffer(0)), 
            ]);
            if (!this.auth.value) return;
            if (byteq(this.auth.value, [
                16,
                1,
                1
            ])) {
                await this.band.requestRandomNumber();
            } else if (byteq(this.auth.value, [
                16,
                1,
                4
            ])) {
                this.band.state = AuthState.KeySendFail;
                await this.band.emit("authStateChange", this.band.state);
            } else if (byteq(this.auth.value, [
                16,
                2,
                1
            ])) {
                const random = new Uint8Array(this.auth.value.buffer.slice(3));
                await this.band.emit("authRandomNumber", random);
                await this.band.sendEncryptedNumber(random);
            } else if (byteq(this.auth.value, [
                16,
                2,
                4
            ])) {
                this.band.state = AuthState.RequestRdnError;
                await this.band.emit("authStateChange", this.band.state);
            } else if (byteq(this.auth.value, [
                16,
                3,
                1
            ])) {
                this.band.state = AuthState.Success;
                await this.band.emit("authStateChange", this.band.state);
            } else if (byteq(this.auth.value, [
                16,
                3,
                4
            ])) {
                this.band.state = AuthState.EncryptionKeyFailed;
                await this.band.emit("authStateChange", this.band.state);
            } else if (byteq(this.auth.value, [
                16,
                3
            ])) {
                this.band.state = this.auth.value.byteLength >= 3 && new Uint8Array(this.auth.value.buffer)[2] == 8 ? AuthState.IncorrectKey : AuthState.UnknownError;
                await this.band.emit("authStateChange", this.band.state);
            }
        };
        this.events.oncharacteristicvaluechanged = async ()=>{
            console.log("Events Change", [
                ...new Uint8Array(this.events.value?.buffer ?? new ArrayBuffer(0)), 
            ]);
            if (!this.events.value) return;
            const bt = this.events.value.getUint8(0);
            if (bt == 8) {
                await this.band.emit("findDevice");
                await this.band.writeDisplayCommand(20, 0, 0);
            } else if (bt == 7) {
                await this.band.emit("callDismiss");
            } else if (bt == 9) {
                await this.band.emit("callSilent");
            } else if (bt == 15) {
                await this.band.emit("foundDevice");
                await this.band.writeDisplayCommand(20, 0, 1);
            } else if (bt == 22) {
            } else if (bt == 10) {
                await this.band.emit("alarmToggle");
            } else if (bt == 1) {
            } else if (bt == 20) {
                if (this.events.value.getUint8(1) == 0) await this.band.emit("workoutStart", this.events.value.getUint8(3), this.events.value.getUint8(2) == 1);
            } else if (bt == 254) {
                const cmd = this.events.value.byteLength > 1 ? this.events.value.getUint8(1) : undefined;
                if (cmd == 224) {
                    await this.band.emit("musicFocusIn");
                    await this.band.updateMusic();
                } else if (cmd == 225) {
                    await this.band.emit("musicFocusOut");
                } else if (cmd == 0) {
                    await this.band.emit("musicPlay");
                } else if (cmd == 1) {
                    await this.band.emit("musicPause");
                } else if (cmd == 3) {
                    await this.band.emit("musicForward");
                } else if (cmd == 4) {
                    await this.band.emit("musicBackward");
                } else if (cmd == 5) {
                    await this.band.emit("musicVolumeUp");
                } else if (cmd == 6) {
                    await this.band.emit("musicVolumeDown");
                }
            }
        };
        this.fetch.oncharacteristicvaluechanged = async ()=>{
            console.log("Fetch Change", [
                ...new Uint8Array(this.fetch.value?.buffer ?? new ArrayBuffer(0)), 
            ]);
            if (!this.fetch.value) return;
            const bytes = new Uint8Array(this.fetch.value.buffer);
            if (byteq(this.fetch.value, [
                16,
                1,
                1
            ])) {
                const [year] = Struct.unpack("<H", bytes.slice(7, 9));
                const [month, date, hour, minute] = bytes.slice(9, 13);
                const time = {
                    year,
                    minute,
                    month,
                    hour,
                    date
                };
                this.band.firstTimestamp = time;
                this.band.pkg = 0;
                await this.band.emit("fetchStart", time);
                await this.fetch.writeValueWithoutResponse(new Uint8Array([
                    2
                ]).buffer);
            } else if (byteq(this.fetch.value, [
                16,
                2,
                1
            ])) {
                await this.band.emit("fetchEnd");
                this.band._fetching = false;
            } else if (byteq(this.fetch.value, [
                16,
                1,
                2
            ])) {
                await this.band.emit("error", "Already fetching Activity Data");
            } else if (byteq(this.fetch.value, [
                16,
                2,
                4
            ])) {
                await this.band.emit("info", "No more activity fetch possible");
            }
        };
        this.activity.oncharacteristicvaluechanged = async ()=>{
            console.log("Activity Change", [
                ...new Uint8Array(this.activity.value?.buffer ?? new ArrayBuffer(0)), 
            ]);
            if (!this.activity.value) return;
            const bytes = new Uint8Array(this.activity.value.buffer);
            if (bytes.length % 4 === 1) {
                if (!this.band.pkg) this.band.pkg = 0;
                this.band.pkg++;
                let i = 1;
                while(i < bytes.length){
                    const index = this.band.pkg * 4 + (i - 1) / 4;
                    const ts = new Date(timeToDate(this.band.firstTimestamp).getTime() + 1000 * index);
                    this.band.lastTimestamp = dateToTime(ts);
                    const [category] = Struct.unpack("<B", [
                        ...bytes.slice(i, i + 1), 
                    ]);
                    const [intensity, steps, heartRate] = bytes.slice(i + 1, i + 4);
                    await this.band.emit("fetchData", {
                        category,
                        intensity,
                        heartRate,
                        steps
                    }, this.band.lastTimestamp);
                    i += 4;
                }
            }
        };
        this.steps.oncharacteristicvaluechanged = async ()=>{
            const status = parseStatus(this.steps.value);
            await this.band.emit("statusChange", status);
        };
        this.heartMeasure.oncharacteristicvaluechanged = async ()=>{
            if (!this.heartMeasure.value) return;
            const data = new Uint8Array(this.heartMeasure.value.buffer);
            await this.band.emit("heartRateMeasure", data[1] ?? 0);
        };
        await this.auth.startNotifications();
        await this.events.startNotifications();
        await this.steps.startNotifications();
        await this.fetch.startNotifications();
        await this.activity.startNotifications();
    }
}
class Band extends EventEmitter {
    device;
    gatt;
    key;
    static DEVICE_NAME = "Mi Smart Band 4";
    static async connect(key, gattConnect = true) {
        let device;
        const devices = await (navigator.bluetooth.getDevices || (()=>{
        }))() ?? [];
        if (devices.length) {
            const found = devices.find((e)=>e.name === Band.DEVICE_NAME
            );
            if (found) device = found;
        }
        if (!device) {
            const deviceReq = await navigator.bluetooth.requestDevice({
                filters: [
                    {
                        name: Band.DEVICE_NAME
                    }, 
                ],
                optionalServices: Object.values(Services)
            }).catch(()=>undefined
            );
            if (deviceReq) device = deviceReq;
        }
        const gatt = gattConnect ? await device?.gatt?.connect().catch(()=>undefined
        ) : device?.gatt;
        if (!gatt || !device) throw new Error("Failed to connect to Band");
        return new Band(device, gatt, key);
    }
    services;
    music = {
        state: MusicState.Paused,
        track: "Nothing playing",
        volume: 100
    };
    chars;
    state = AuthState.None;
    ready;
    constructor(device, gatt, key5){
        super();
        this.device = device;
        this.gatt = gatt;
        this.key = key5;
        this.services = new BandServices(this);
        this.chars = new BandCharacteristics(this);
        if (!this.gatt.connected) {
            this.ready = this.gatt.connect().then(()=>this.emit("connect")
            ).then(()=>this
            );
        } else {
            this.ready = Promise.resolve(this);
        }
        device.ongattserverdisconnected = async ()=>{
            await this.emit("disconnect");
        };
    }
    async init() {
        await this.services.init();
        await this.chars.init();
        this.emit("init");
    }
    async authorize() {
        if (!this.key) throw new Error("Auth Key not provided");
        const promise = new Promise((res, rej)=>{
            this.once("authStateChange", (state)=>{
                if (state == AuthState.Success) res(true);
                else rej("Auth State: " + state);
            });
        });
        await this.requestRandomNumber();
        return promise;
    }
    async requestRandomNumber() {
        await this.chars.auth.writeValueWithoutResponse(new Uint8Array([
            2,
            0
        ]).buffer);
    }
    async sendEncryptedNumber(data) {
        let encrypted = await this.encrypt(data);
        encrypted = [
            3,
            0,
            ...encrypted
        ].slice(0, 18);
        await this.chars.auth.writeValue(new Uint8Array(encrypted).buffer);
    }
    async encrypt(msg) {
        return await new AES(bytesFromHex(this.key), {
            mode: "ecb"
        }).encrypt(msg);
    }
    async getRevision() {
        const val = await this.chars.revision.readValue();
        return decoder.decode(val.buffer);
    }
    async getHrdwRevision() {
        const val = await this.chars.hrdwRevision.readValue();
        return decoder.decode(val.buffer);
    }
    async getBatteryInfo() {
        const data = await this.chars.battery.readValue();
        return parseBatteryResponse(data);
    }
    async getCurrentTime() {
        const data = await this.chars.currentTime.readValue();
        return parseDate(data);
    }
    async setEncoding(enc = "en_US") {
        await this.chars.config.writeValue(new Uint8Array([
            6,
            17,
            0,
            ...encoder.encode(enc)
        ]).buffer);
    }
    async sendAlert(...type) {
        await this.chars.alert.writeValue(new Uint8Array(type).buffer);
    }
    async setCurrentTime(date) {
        const d = new Date();
        date = date ?? {
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            date: d.getDate(),
            hours: d.getHours(),
            minutes: d.getMinutes(),
            seconds: d.getSeconds()
        };
        await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
    }
    async writeDisplayCommand(...cmd) {
        await this.chars.config.writeValue(new Uint8Array([
            6,
            ...cmd
        ]).buffer);
    }
    async sendCustomAlert(type = AlertType.None, title = "", msg = "") {
        await this.chars.customAlert.writeValue(new Uint8Array([
            type,
            1,
            ...encoder.encode(title),
            10,
            10,
            10,
            ...encoder.encode(type === AlertType.Call ? "" : chunk(msg.split(""), 10).map((e)=>e.join("")
            ).join("\n")), 
        ]).buffer);
    }
    async sendEmailNotification(title, msg) {
        await this.sendCustomAlert(AlertType.Email, title, msg);
    }
    async sendCallNotification(title, msg) {
        await this.sendCustomAlert(AlertType.CallNotif, title, msg);
    }
    async sendMessageNotification(title, msg) {
        await this.sendCustomAlert(AlertType.Message, title, msg);
    }
    async sendCall(name) {
        await this.sendCustomAlert(AlertType.Call, name, "");
    }
    async getStatus() {
        const value = await this.chars.steps.readValue();
        return parseStatus(value);
    }
    async writeChunked(type, data) {
        let remaining = data.length;
        let count = 0;
        while(remaining > 0){
            let copybytes = Math.min(remaining, 17);
            let chunk1 = [];
            let flag = 0;
            if (remaining <= 17) {
                flag |= 128;
                if (count == 0) {
                    flag |= 64;
                }
            } else if (count > 0) {
                flag |= 64;
            }
            chunk1.push(0);
            chunk1.push(flag | type);
            chunk1.push(count & 255);
            chunk1.push(...data.slice(count * 17, count * 17 + copybytes));
            count += 1;
            await this.chars.chunked.writeValueWithoutResponse(new Uint8Array(chunk1).buffer);
            remaining -= copybytes;
        }
    }
    async setMusic(music) {
        Object.assign(this.music, music);
        await this.updateMusic();
    }
    async updateMusic() {
        let flag = 0 | 1;
        let buf = [];
        if (this.music.artist) {
            flag |= 2;
            buf.push(...encoder.encode(this.music.artist), 0);
        }
        if (this.music.album) {
            flag |= 4;
            buf.push(...encoder.encode(this.music.album), 0);
        }
        if (this.music.track) {
            flag |= 8;
            buf.push(...encoder.encode(this.music.track), 0);
        }
        if (this.music.duration) {
            flag |= 16;
            const data = new Uint8Array(2);
            new DataView(data.buffer).setUint16(0, this.music.duration, true);
            buf.push(...data);
        }
        if (this.music.volume) {
            flag |= 64;
            buf.push(this.music.volume, 0);
        }
        const position = [];
        if (this.music.position) {
            const data = new Uint8Array(2);
            new DataView(data.buffer).setUint16(0, this.music.position, true);
            position.push(...data);
        } else {
            position.push(0, 0);
        }
        buf = [
            flag,
            this.music.state,
            0,
            ...position,
            ...buf
        ];
        await this.writeChunked(3, new Uint8Array(buf));
    }
    async setAlarm(hour, minute, days = [], enabled = true, snooze = true, id = 0) {
        let alarmTag = id;
        if (enabled) {
            alarmTag |= 128;
            if (!snooze) {
                alarmTag |= 64;
            }
        }
        let repitionMask = 0;
        days.forEach((day)=>{
            repitionMask |= day;
        });
        await this.chars.config.writeValue(Struct.pack("5B", [
            2,
            alarmTag,
            hour,
            minute,
            repitionMask
        ]).buffer);
    }
    async dfuUpdate(type, bin) {
        const crc = parseInt(crc32(bin), 16);
        await this.emit("dfuStart", type, bin.byteLength);
        await this.chars.firm.writeValueWithResponse(new Uint8Array([
            1,
            8,
            ...Struct.pack("<I", [
                bin.byteLength
            ]).slice(0, 3),
            0,
            ...Struct.pack("<I", [
                crc
            ]), 
        ]).buffer);
        await this.chars.firm.writeValueWithResponse(new Uint8Array([
            3,
            1
        ]).buffer);
        let offset = 0;
        while(offset < bin.byteLength){
            const end = offset + 20;
            const offsetEnd = end >= bin.byteLength ? bin.byteLength : end;
            const chunk1 = bin.slice(offset, offsetEnd);
            if (chunk1.length === 0) continue;
            await this.chars.firmWrite.writeValue(chunk1.buffer);
            const diff = offsetEnd - offset;
            offset += diff;
            this.emit("dfuProgress", offset, bin.byteLength);
        }
        await this.chars.firm.writeValueWithResponse(new Uint8Array([
            0
        ]).buffer);
        await this.chars.firm.writeValueWithResponse(new Uint8Array([
            4
        ]).buffer);
        if (type === "firmware") {
            await this.chars.firm.writeValueWithResponse(new Uint8Array([
                5
            ]).buffer);
        }
        this.emit("dfuEnd");
    }
    updateWatchface(bin) {
        return this.dfuUpdate("watchface", bin);
    }
    updateFirmware(bin) {
        return this.dfuUpdate("firmware", bin);
    }
    async setHeartRateMonitorSleep(enabled = true, interval = 1) {
        await this.chars.heartMeasure.startNotifications();
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            0,
            0
        ]).buffer);
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            20,
            0
        ]).buffer);
        if (enabled) {
            await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
                21,
                0,
                1
            ]).buffer);
            await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
                20,
                ...new TextEncoder().encode(String(interval))
            ]).buffer);
        }
        await this.chars.heartMeasure.stopNotifications();
    }
    async getHeartRateOneTime() {
        const promise = new Promise((res)=>{
            this.once("heartRateMeasure", async (v)=>{
                await this.stopHeartRateRealtime();
                res(v);
            });
        });
        await this.startHeartRateRealtime();
        return promise;
    }
    #heartRateRealtime = false;
    #heartRatePing;
    get heartRateRealtime() {
        return this.#heartRateRealtime;
    }
    async startHeartRateRealtime() {
        if (this.#heartRateRealtime) {
            throw new Error("Heart Rate realtime already started");
        }
        this.#heartRateRealtime = true;
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            2,
            0
        ]).buffer);
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            1,
            0
        ]).buffer);
        await this.chars.heartMeasure.startNotifications();
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            1,
            1
        ]).buffer);
        if (this.#heartRatePing) clearInterval(this.#heartRatePing);
        this.#heartRatePing = setInterval(()=>{
            if (this.#heartRateRealtime !== true && this.#heartRatePing) {
                return clearInterval(this.#heartRatePing);
            }
            this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
                22
            ]).buffer);
        }, 12000);
    }
    async stopHeartRateRealtime() {
        if (!this.#heartRateRealtime) {
            throw new Error("Heart Rate realtime not even started");
        }
        this.#heartRateRealtime = false;
        if (this.#heartRatePing) clearInterval(this.#heartRatePing);
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            1,
            0
        ]).buffer);
        await this.chars.heartCtrl.writeValueWithResponse(new Uint8Array([
            21,
            1,
            0
        ]).buffer);
        await this.chars.heartMeasure.stopNotifications();
        await this.chars.sensor.writeValueWithoutResponse(new Uint8Array([
            3
        ]).buffer);
        await this.chars.hz.stopNotifications();
    }
    #fetching = false;
    #fetchStart;
    firstTimestamp;
    lastTimestamp;
    pkg = 0;
    set _fetching(v) {
        this.#fetching = v;
    }
    get fetching() {
        return this.#fetching;
    }
    get fetchStart() {
        return this.#fetchStart;
    }
    get fetchStartDate() {
        const start = this.#fetchStart;
        if (!start) return;
        return timeToDate(start);
    }
    async startActivityFetch(start = {
    }) {
        this.pkg = 0;
        start = Object.assign({
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            date: new Date().getDate(),
            hour: 0,
            minute: 0
        }, start);
        const command = [
            1,
            1
        ];
        const offset = await this.chars.currentTime.readValue().then((e)=>new Uint8Array(e.buffer).slice(9, 11)
        );
        command.push(...Struct.pack("<H", [
            start.year
        ]), start.month, start.date, start.hour, start.minute, ...offset);
        await this.chars.fetch.writeValueWithoutResponse(new Uint8Array(command).buffer);
        this.#fetching = true;
        this.#fetchStart = start;
    }
}
const log = (title, color, msg)=>document.getElementById("logs").innerHTML += `<br/><span class="log-title" style="color: ${color}">[${title}]</span> <span>${msg}</span>`
;
const define = (name, value)=>{
    const obj = {
    };
    obj[name] = value;
    Object.assign(window, obj);
};
const dfu = document.getElementById("dfu");
const dfuProg = document.getElementById("dfu-prog");
const dfuText = document.getElementById("dfu-text");
function enableDfu() {
    dfu.style.display = "block";
}
function disableDfu() {
    dfu.style.display = "none";
    dfuText.innerText = "0%";
}
function setDfuProg(prog) {
    if (prog > 100) prog = 100;
    dfuProg.style.width = `${prog}%`;
    dfuText.innerText = `${Math.floor(prog)}%`;
}
const COLOR1 = "#0D993A";
const COLOR2 = "#519ABA";
const COLOR3 = "#CBBF38";
const COLOR4 = "#E37331";
const logs = {
    band: (msg)=>log("Band", COLOR1, msg)
    ,
    gatt: (msg)=>log("Gatt", COLOR2, msg)
    ,
    auth: (msg)=>log("Auth", COLOR4, msg)
    ,
    info: (msg)=>log("Info", COLOR3, msg)
    ,
    error: (msg)=>log("Error", "red", msg)
};
logs.info("Init logger");
async function init(n = false) {
    try {
        if (!n) logs.band("Connecting...");
        if (typeof AES1 !== "undefined") {
            window.AES = AES1;
        }
        const band1 = await Band.connect(localStorage.getItem("AUTH_KEY"), false);
        band1.on("connect", ()=>{
            logs.gatt("GATT Connected.");
        });
        await band1.ready;
        define("band", band1);
        logs.band("Connected to Band!");
        band1.on("disconnect", ()=>{
            logs.gatt("Disconnected");
        });
        band1.on("init", ()=>{
            logs.gatt("Initialized");
        });
        band1.on("musicFocusIn", ()=>{
            logs.info("Music Focus In");
        });
        band1.on("musicFocusOut", ()=>{
            logs.info("Music Focus Out");
        });
        band1.on("musicForward", ()=>{
            logs.info("Music Forward");
        });
        band1.on("musicBackward", ()=>{
            logs.info("Music Backward");
        });
        band1.on("musicPlay", ()=>{
            logs.info("Music Play");
            band1.music.state = MusicState.Playing;
            band1.updateMusic();
        });
        band1.on("musicPause", ()=>{
            logs.info("Music Pause");
            band1.music.state = MusicState.Paused;
            band1.updateMusic();
        });
        band1.on("musicVolumeUp", ()=>{
            band1.music.volume += 5;
            if (band1.music.volume > 100) band1.music.volume = 100;
            band1.updateMusic();
        });
        band1.on("musicVolumeDown", ()=>{
            band1.music.volume -= 5;
            if (band1.music.volume < 0) band1.music.volume = 0;
            band1.updateMusic();
        });
        band1.on("findDevice", ()=>{
            logs.info("Find device");
        });
        band1.on("foundDevice", ()=>{
            logs.info("Found device");
        });
        band1.on("alarmToggle", ()=>{
            logs.info("Alarm Toggle");
        });
        band1.on("workoutStart", (type, loc)=>{
            logs.info("Workout Start: " + WorkoutType[type] + (loc ? " (looking for location)" : ""));
        });
        band1.on("authStateChange", (s)=>{
            logs.auth("Auth State: " + s);
        });
        band1.on("fetchStart", (t)=>{
            logs.info(`Fetch Start (${timeToDate(t).toString()})`);
        });
        band1.on("fetchData", (d, t)=>{
            console.log("Fetch", t, d);
        });
        band1.on("fetchEnd", ()=>{
            logs.info("Fetch End");
        });
        band1.on("error", (e)=>{
            logs.info(`Error: ${e}`);
        });
        band1.on("info", (e)=>{
            logs.info(`Info: ${e}`);
        });
        band1.on("dfuStart", (type, len)=>{
            logs.info(`DFU Start: ${type} (${len} bytes)`);
            enableDfu();
        });
        band1.on("dfuProgress", (prog, total)=>{
            setDfuProg(prog / total * 100);
        });
        band1.on("dfuEnd", ()=>{
            disableDfu();
            logs.info("DFU End");
        });
        band1.on("callDismiss", ()=>{
            logs.info("Call Dismissed");
        });
        band1.on("callSilent", ()=>{
            logs.info("Call Silent");
        });
        await band1.init();
        logs.auth("Authorizing...");
        try {
            await band1.authorize();
        } catch (e) {
        }
        const revision = await band1.getRevision();
        const hrdwRevision = await band1.getHrdwRevision();
        logs.info(`Firmware ${revision}`);
        logs.info(`Hardware ${hrdwRevision}`);
        const battery = await band1.getBatteryInfo();
        logs.info(`Battery (${battery.status}): ${battery.level} (last level: ${battery.lastLevel})`);
    } catch (e) {
        if (!n) logs.error(e.toString());
    }
}
init(true).catch(()=>{
});
