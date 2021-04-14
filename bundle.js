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
    constructor(key, config1){
        this.key = key;
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
const Services = {
    Main1: "0000fee0-0000-1000-8000-00805f9b34fb",
    Main2: "0000fee1-0000-1000-8000-00805f9b34fb",
    Alert: "00001802-0000-1000-8000-00805f9b34fb",
    AlertNotification: "00001811-0000-1000-8000-00805f9b34fb",
    HeartRate: "0000180d-0000-1000-8000-00805f9b34fb",
    DeviceInfo: "0000180a-0000-1000-8000-00805f9b34fb",
    DfuFirmware: "00001530-0000-3512-2118-0009af100700"
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
    LeParams: "0000FF09-0000-1000-8000-00805f9b34fb",
    Revision: 10792,
    Serial: 10789,
    HrdwRevision: 10791,
    Configuration: "00000003-0000-3512-2118-0009af100700",
    DeviceEvent: "00000010-0000-3512-2118-0009af100700",
    ChunkedTransfer: "00000020-0000-3512-2118-0009af100700",
    Music: "00000010-0000-3512-2118-0009af100700",
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
    AlertType1["None"] = "\x00";
    AlertType1["Message"] = "\x01";
    AlertType1["Phone"] = "\x02";
})(AlertType || (AlertType = {
}));
var MusicState;
(function(MusicState1) {
    MusicState1[MusicState1["Playing"] = 0] = "Playing";
    MusicState1[MusicState1["Paused"] = 1] = "Paused";
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
var BatteryStatus;
(function(BatteryStatus1) {
    BatteryStatus1["Normal"] = "normal";
    BatteryStatus1["Charging"] = "charging";
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
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
class Base {
    band;
    constructor(band){
        this.band = band;
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
    async init() {
        this.main1 = await this.band.gatt.getPrimaryService(Services.Main1);
        this.main2 = await this.band.gatt.getPrimaryService(Services.Main2);
        this.heartrate = await this.band.gatt.getPrimaryService(Services.HeartRate);
        this.dfuFirmware = await this.band.gatt.getPrimaryService(Services.DfuFirmware);
        this.alert = await this.band.gatt.getPrimaryService(Services.Alert);
        this.deviceInfo = await this.band.gatt.getPrimaryService(Services.DeviceInfo);
        this.alertNotification = await this.band.gatt.getPrimaryService(Services.AlertNotification);
    }
}
class BandCharacteristics extends Base {
    auth;
    heartCtrl;
    heartMeasure;
    fetch;
    acitvity;
    chunked;
    music;
    revision;
    hrdwRevision;
    battery;
    currentTime;
    config;
    alert;
    customAlert;
    steps;
    async init() {
        this.auth = await this.band.services.main2.getCharacteristic(Chars.Auth);
        this.heartCtrl = await this.band.services.heartrate.getCharacteristic(Chars.HeartRateControl);
        this.heartMeasure = await this.band.services.heartrate.getCharacteristic(Chars.HeartRateMeasure);
        this.fetch = await this.band.services.main1.getCharacteristic(Chars.Fetch);
        this.acitvity = await this.band.services.main1.getCharacteristic(Chars.ActivityData);
        this.chunked = await this.band.services.main1.getCharacteristic(Chars.ChunkedTransfer);
        this.music = await this.band.services.main1.getCharacteristic(Chars.Music);
        this.revision = await this.band.services.deviceInfo.getCharacteristic(Chars.Revision);
        this.hrdwRevision = await this.band.services.deviceInfo.getCharacteristic(Chars.HrdwRevision);
        this.battery = await this.band.services.main1.getCharacteristic(Chars.Battery);
        this.currentTime = await this.band.services.main1.getCharacteristic(Chars.CurrentTime);
        this.config = await this.band.services.main1.getCharacteristic(Chars.Configuration);
        this.steps = await this.band.services.main1.getCharacteristic(Chars.Steps);
        this.alert = await this.band.services.alert.getCharacteristic(Chars.Alert);
        this.auth.oncharacteristicvaluechanged = (evt)=>{
            console.log("Auth Change", evt);
        };
        this.music.oncharacteristicvaluechanged = (evt)=>{
            console.log("Music Change", evt);
        };
        await this.auth.startNotifications();
        await this.music.startNotifications();
    }
}
class Band extends EventEmitter {
    device;
    gatt;
    static DEVICE_NAME = "Mi Smart Band 4";
    static async connect() {
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
        const gatt = await device?.gatt?.connect().catch(()=>undefined
        );
        if (!gatt || !device) throw new Error("Failed to connect to Band");
        return new Band(device, gatt);
    }
    services;
    chars;
    constructor(device, gatt){
        super();
        this.device = device;
        this.gatt = gatt;
        this.services = new BandServices(this);
        this.chars = new BandCharacteristics(this);
        device.ongattserverdisconnected = ()=>{
            this.emit("disconnect");
        };
    }
    async init() {
        await this.services.init();
        await this.chars.init();
        this.emit("init");
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
    async sendAlert(type) {
        await this.chars.alert.writeValue(encoder.encode(type).buffer);
    }
    async setCurrentTime(date) {
        await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
    }
    async writeDisplayCommand(...cmd) {
        await this.chars.config.writeValue(new Uint8Array([
            6,
            ...cmd
        ]).buffer);
    }
    async sendCustomAlert(type, title, msg) {
        await this.chars.customAlert.writeValue(new Uint8Array([
            type,
            1,
            ...encoder.encode(`${title}\x0a\0x0a\x0a${msg}`)
        ]).buffer);
    }
}
const log = (title, color, msg)=>document.getElementById("logs").innerHTML += `<br/><span style="color: ${color}">[${title}]</span> <span>${msg}</span>`
;
const define = (name, value)=>Object.defineProperty(window, name, {
        value
    })
;
const COLOR1 = "#0D993A";
const COLOR2 = "#519ABA";
const COLOR3 = "#CBBF38";
const logs = {
    band: (msg)=>log("Band", COLOR1, msg)
    ,
    gatt: (msg)=>log("Gatt", COLOR2, msg)
    ,
    info: (msg)=>log("Info", COLOR3, msg)
    ,
    error: (msg)=>log("Error", "red", msg)
};
async function init(n = false) {
    try {
        if (!n) alert("Connecting");
        logs.band("Connecting...");
        const band1 = await Band.connect();
        define("band", band1);
        logs.band("Connected to Band!");
        band1.on("disconnect", ()=>{
            logs.gatt("Disconnected");
        });
        band1.on("init", ()=>{
            logs.gatt("Initialized");
        });
        await band1.init();
        const revision = await band1.getRevision();
        const hrdwRevision = await band1.getHrdwRevision();
        logs.info(`Firmware ${revision}`);
        logs.info(`Hardware ${hrdwRevision}`);
        const battery = await band1.getBatteryInfo();
        logs.info(`Battery (${battery.status}): ${battery.level} (last time charged: ${battery.lastLevel})`);
        const time = await band1.getCurrentTime();
        logs.info(`Current Time: ${time.hours}:${time.minutes}:${time.seconds} - ${time.date}/${time.month}/${time.year} (Day ${time.day})`);
    } catch (e) {
        if (!n) alert(e.toString());
    }
}
init(true).catch(()=>{
});
