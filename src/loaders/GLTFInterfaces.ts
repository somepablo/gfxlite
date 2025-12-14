export interface GLTF {
    asset: GLTFAsset;
    scene?: number;
    scenes?: GLTFScene[];
    nodes?: GLTFNode[];
    meshes?: GLTFMesh[];
    materials?: GLTFMaterial[];
    textures?: GLTFTexture[];
    images?: GLTFImage[];
    samplers?: GLTFSampler[];
    accessors?: GLTFAccessor[];
    bufferViews?: GLTFBufferView[];
    buffers?: GLTFBuffer[];
}

export interface GLTFAsset {
    version: string;
    generator?: string;
    minVersion?: string;
}

export interface GLTFScene {
    nodes?: number[];
    name?: string;
}

export interface GLTFNode {
    camera?: number;
    children?: number[];
    skin?: number;
    matrix?: number[]; // [16]
    mesh?: number;
    rotation?: number[]; // [4] quaternion
    scale?: number[]; // [3]
    translation?: number[]; // [3]
    weights?: number[];
    name?: string;
}

export interface GLTFMesh {
    primitives: GLTFPrimitive[];
    weights?: number[];
    name?: string;
}

export interface GLTFPrimitive {
    attributes: { [key: string]: number };
    indices?: number;
    material?: number;
    mode?: number; // default 4 (TRIANGLES)
    targets?: { [key: string]: number }[];
}

export interface GLTFMaterial {
    name?: string;
    pbrMetallicRoughness?: GLTFPbrMetallicRoughness;
    normalTexture?: GLTFTextureInfo;
    occlusionTexture?: GLTFTextureInfo;
    emissiveTexture?: GLTFTextureInfo;
    emissiveFactor?: number[]; // [3]
    alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    alphaCutoff?: number; // default 0.5
    doubleSided?: boolean;
}

export interface GLTFPbrMetallicRoughness {
    baseColorFactor?: number[]; // [4] default [1,1,1,1]
    baseColorTexture?: GLTFTextureInfo;
    metallicFactor?: number; // default 1
    roughnessFactor?: number; // default 1
    metallicRoughnessTexture?: GLTFTextureInfo;
}

export interface GLTFTextureInfo {
    index: number;
    texCoord?: number; // default 0
    scale?: number; // for normalTexture
    strength?: number; // for occlusionTexture
}

export interface GLTFTexture {
    sampler?: number;
    source?: number;
    name?: string;
}

export interface GLTFImage {
    uri?: string;
    mimeType?: string;
    bufferView?: number;
    name?: string;
}

export interface GLTFSampler {
    magFilter?: number;
    minFilter?: number;
    wrapS?: number; // default 10497 (REPEAT)
    wrapT?: number; // default 10497 (REPEAT)
    name?: string;
}

export interface GLTFAccessor {
    bufferView?: number;
    byteOffset?: number; // default 0
    componentType: number; // 5120(BYTE), 5121(UBYTE), 5122(SHORT), 5123(USHORT), 5125(UINT), 5126(FLOAT)
    normalized?: boolean; // default false
    count: number;
    type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
    max?: number[];
    min?: number[];
    sparse?: object;
    name?: string;
}

export interface GLTFBufferView {
    buffer: number;
    byteOffset?: number; // default 0
    byteLength: number;
    byteStride?: number;
    target?: number; // 34962(ARRAY_BUFFER), 34963(ELEMENT_ARRAY_BUFFER)
    name?: string;
}

export interface GLTFBuffer {
    uri?: string;
    byteLength: number;
    name?: string;
}

export const GLTFConstants = {
    // Primitive Modes
    POINTS: 0,
    LINES: 1,
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,

    // Component Types
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,

    // Buffer Targets
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,

    // Texture Filtering
    NEAREST: 9728,
    LINEAR: 9729,
    NEAREST_MIPMAP_NEAREST: 9984,
    LINEAR_MIPMAP_NEAREST: 9985,
    NEAREST_MIPMAP_LINEAR: 9986,
    LINEAR_MIPMAP_LINEAR: 9987,

    // Texture Wrapping
    CLAMP_TO_EDGE: 33071,
    MIRRORED_REPEAT: 33648,
    REPEAT: 10497,
};
