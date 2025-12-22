import type { Environment } from "./Environment";

// Convert 32-bit float to 16-bit half float (IEEE 754 binary16)
function floatToHalf(val: number): number {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = val;
    const x = int32View[0];

    // Extract sign, exponent, and mantissa
    const sign = (x >> 16) & 0x8000;
    let exp = ((x >> 23) & 0xff) - 127 + 15;
    let mantissa = (x >> 13) & 0x3ff;

    if (exp <= 0) {
        // Subnormal or zero
        if (exp < -10) {
            return sign;  // Too small, flush to zero
        }
        mantissa = (mantissa | 0x400) >> (1 - exp);
        return sign | mantissa;
    } else if (exp === 0xff - 127 + 15) {
        // Infinity or NaN
        if (mantissa) {
            return sign | 0x7e00;  // NaN
        }
        return sign | 0x7c00;  // Infinity
    } else if (exp > 30) {
        // Overflow, clamp to infinity
        return sign | 0x7c00;
    }

    return sign | (exp << 10) | mantissa;
}

export class EnvironmentManager {
    private device: GPUDevice;

    // Compute pipelines
    private equirectToCubemapPipeline: GPUComputePipeline | null = null;
    private irradiancePipeline: GPUComputePipeline | null = null;
    private prefilterPipeline: GPUComputePipeline | null = null;
    private brdfPipeline: GPUComputePipeline | null = null;

    // Bind group layouts
    private equirectBindGroupLayout: GPUBindGroupLayout | null = null;
    private irradianceBindGroupLayout: GPUBindGroupLayout | null = null;
    private prefilterBindGroupLayout: GPUBindGroupLayout | null = null;
    private brdfBindGroupLayout: GPUBindGroupLayout | null = null;

    // Environment bind group for rendering
    private environmentBindGroupLayout: GPUBindGroupLayout | null = null;

    // Shared resources
    private brdfLUT: GPUTexture | null = null;
    public brdfLUTView: GPUTextureView | null = null;
    private brdfGenerated: boolean = false;

    // Dummy resources
    public dummyCubemapView: GPUTextureView | null = null;
    public cubemapSampler: GPUSampler | null = null;
    public brdfSampler: GPUSampler | null = null;

    // Environment params buffer
    private envParamsBuffer: GPUBuffer | null = null;

    // Bind group cache
    private environmentBindGroupCache = new Map<number, GPUBindGroup>();
    private dummyEnvironmentBindGroup: GPUBindGroup | null = null;

    constructor(device: GPUDevice) {
        this.device = device;
        this.createPipelines();
        this.createDummyResources();
        this.createEnvironmentBindGroupLayout();
        // Generate BRDF LUT immediately - it's reusable across all environments
        this.generateBRDFLUT();
    }

    private createPipelines(): void {
        this.createEquirectToCubemapPipeline();
        this.createIrradiancePipeline();
        this.createPrefilterPipeline();
        this.createBRDFPipeline();
    }

    private createEquirectToCubemapPipeline(): void {
        const shader = /* wgsl */ `
const PI: f32 = 3.14159265359;

@group(0) @binding(0) var equirectMap: texture_2d<f32>;
@group(0) @binding(1) var equirectSampler: sampler;
@group(0) @binding(2) var outputCubemap: texture_storage_2d_array<rgba16float, write>;

fn getCubemapDirection(face: u32, uv: vec2<f32>) -> vec3<f32> {
    let u = uv.x * 2.0 - 1.0;
    let v = uv.y * 2.0 - 1.0;

    switch (face) {
        case 0u: { return normalize(vec3<f32>(1.0, -v, -u)); }  // +X
        case 1u: { return normalize(vec3<f32>(-1.0, -v, u)); }  // -X
        case 2u: { return normalize(vec3<f32>(u, 1.0, v)); }    // +Y
        case 3u: { return normalize(vec3<f32>(u, -1.0, -v)); }  // -Y
        case 4u: { return normalize(vec3<f32>(u, -v, 1.0)); }   // +Z
        default: { return normalize(vec3<f32>(-u, -v, -1.0)); } // -Z
    }
}

fn sampleEquirectangular(dir: vec3<f32>) -> vec4<f32> {
    let theta = atan2(dir.z, dir.x);
    let phi = asin(clamp(dir.y, -1.0, 1.0));
    let u = (theta / PI + 1.0) * 0.5;
    let v = 0.5 - phi / PI;  // V=0 at top (north pole), V=1 at bottom (south pole)
    return textureSampleLevel(equirectMap, equirectSampler, vec2<f32>(u, v), 0.0);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let faceSize = textureDimensions(outputCubemap).x;
    if (globalId.x >= faceSize || globalId.y >= faceSize) {
        return;
    }

    let uv = (vec2<f32>(globalId.xy) + 0.5) / f32(faceSize);
    let dir = getCubemapDirection(globalId.z, uv);
    let color = sampleEquirectangular(dir);

    textureStore(outputCubemap, globalId.xy, globalId.z, color);
}
        `;

        const shaderModule = this.device.createShaderModule({
            label: "Equirect to Cubemap Shader",
            code: shader,
        });

        this.equirectBindGroupLayout = this.device.createBindGroupLayout({
            label: "Equirect to Cubemap Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    sampler: { type: "filtering" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba16float",
                        viewDimension: "2d-array",
                    },
                },
            ],
        });

        this.equirectToCubemapPipeline = this.device.createComputePipeline({
            label: "Equirect to Cubemap Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.equirectBindGroupLayout],
            }),
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });
    }

    private createIrradiancePipeline(): void {
        const shader = /* wgsl */ `
const PI: f32 = 3.14159265359;
const SAMPLE_DELTA: f32 = 0.025;

@group(0) @binding(0) var envCubemap: texture_cube<f32>;
@group(0) @binding(1) var envSampler: sampler;
@group(0) @binding(2) var outputIrradiance: texture_storage_2d_array<rgba16float, write>;

fn getCubemapDirection(face: u32, uv: vec2<f32>) -> vec3<f32> {
    let u = uv.x * 2.0 - 1.0;
    let v = uv.y * 2.0 - 1.0;

    switch (face) {
        case 0u: { return normalize(vec3<f32>(1.0, -v, -u)); }
        case 1u: { return normalize(vec3<f32>(-1.0, -v, u)); }
        case 2u: { return normalize(vec3<f32>(u, 1.0, v)); }
        case 3u: { return normalize(vec3<f32>(u, -1.0, -v)); }
        case 4u: { return normalize(vec3<f32>(u, -v, 1.0)); }
        default: { return normalize(vec3<f32>(-u, -v, -1.0)); }
    }
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let faceSize = textureDimensions(outputIrradiance).x;
    if (globalId.x >= faceSize || globalId.y >= faceSize) {
        return;
    }

    let uv = (vec2<f32>(globalId.xy) + 0.5) / f32(faceSize);
    let N = getCubemapDirection(globalId.z, uv);

    // Build tangent frame
    var up = vec3<f32>(0.0, 1.0, 0.0);
    if (abs(N.y) > 0.999) {
        up = vec3<f32>(0.0, 0.0, 1.0);
    }
    let right = normalize(cross(up, N));
    up = cross(N, right);

    var irradiance = vec3<f32>(0.0);
    var sampleCount = 0.0;

    // Hemisphere sampling
    for (var phi = 0.0; phi < 2.0 * PI; phi += SAMPLE_DELTA) {
        for (var theta = 0.0; theta < 0.5 * PI; theta += SAMPLE_DELTA) {
            // Spherical to cartesian (in tangent space)
            let tangentSample = vec3<f32>(
                sin(theta) * cos(phi),
                sin(theta) * sin(phi),
                cos(theta)
            );

            // Tangent to world
            let sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * N;

            irradiance += textureSampleLevel(envCubemap, envSampler, sampleVec, 0.0).rgb * cos(theta) * sin(theta);
            sampleCount += 1.0;
        }
    }

    irradiance = PI * irradiance / sampleCount;
    textureStore(outputIrradiance, globalId.xy, globalId.z, vec4<f32>(irradiance, 1.0));
}
        `;

        const shaderModule = this.device.createShaderModule({
            label: "Irradiance Convolution Shader",
            code: shader,
        });

        this.irradianceBindGroupLayout = this.device.createBindGroupLayout({
            label: "Irradiance Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float", viewDimension: "cube" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    sampler: { type: "filtering" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba16float",
                        viewDimension: "2d-array",
                    },
                },
            ],
        });

        this.irradiancePipeline = this.device.createComputePipeline({
            label: "Irradiance Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.irradianceBindGroupLayout],
            }),
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });
    }

    private createPrefilterPipeline(): void {
        const shader = /* wgsl */ `
const PI: f32 = 3.14159265359;
const SAMPLE_COUNT: u32 = 1024u;

struct Params {
    roughness: f32,
    resolution: f32,
}

@group(0) @binding(0) var envCubemap: texture_cube<f32>;
@group(0) @binding(1) var envSampler: sampler;
@group(0) @binding(2) var outputPrefiltered: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(3) var<uniform> params: Params;

fn getCubemapDirection(face: u32, uv: vec2<f32>) -> vec3<f32> {
    let u = uv.x * 2.0 - 1.0;
    let v = uv.y * 2.0 - 1.0;

    switch (face) {
        case 0u: { return normalize(vec3<f32>(1.0, -v, -u)); }
        case 1u: { return normalize(vec3<f32>(-1.0, -v, u)); }
        case 2u: { return normalize(vec3<f32>(u, 1.0, v)); }
        case 3u: { return normalize(vec3<f32>(u, -1.0, -v)); }
        case 4u: { return normalize(vec3<f32>(u, -v, 1.0)); }
        default: { return normalize(vec3<f32>(-u, -v, -1.0)); }
    }
}

fn radicalInverse_VdC(bits_in: u32) -> f32 {
    var bits = bits_in;
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i: u32, N: u32) -> vec2<f32> {
    return vec2<f32>(f32(i) / f32(N), radicalInverse_VdC(i));
}

fn importanceSampleGGX(Xi: vec2<f32>, N: vec3<f32>, roughness: f32) -> vec3<f32> {
    let a = roughness * roughness;

    let phi = 2.0 * PI * Xi.x;
    let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    // Spherical to cartesian
    let H = vec3<f32>(
        cos(phi) * sinTheta,
        sin(phi) * sinTheta,
        cosTheta
    );

    // Tangent to world
    var up = vec3<f32>(0.0, 1.0, 0.0);
    if (abs(N.y) > 0.999) {
        up = vec3<f32>(0.0, 0.0, 1.0);
    }
    let tangent = normalize(cross(up, N));
    let bitangent = cross(N, tangent);

    return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

fn DistributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;

    let num = a2;
    var denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return num / denom;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let faceSize = textureDimensions(outputPrefiltered).x;
    if (globalId.x >= faceSize || globalId.y >= faceSize) {
        return;
    }

    let uv = (vec2<f32>(globalId.xy) + 0.5) / f32(faceSize);
    let N = getCubemapDirection(globalId.z, uv);
    let R = N;
    let V = R;

    var prefilteredColor = vec3<f32>(0.0);
    var totalWeight = 0.0;

    let roughness = max(params.roughness, 0.001);

    for (var i = 0u; i < SAMPLE_COUNT; i++) {
        let Xi = hammersley(i, SAMPLE_COUNT);
        let H = importanceSampleGGX(Xi, N, roughness);
        let L = normalize(2.0 * dot(V, H) * H - V);

        let NdotL = max(dot(N, L), 0.0);
        if (NdotL > 0.0) {
            // Sample with mip level based on roughness and PDF
            let D = DistributionGGX(N, H, roughness);
            let NdotH = max(dot(N, H), 0.0);
            let HdotV = max(dot(H, V), 0.0);
            let pdf = D * NdotH / (4.0 * HdotV) + 0.0001;

            let saTexel = 4.0 * PI / (6.0 * params.resolution * params.resolution);
            let saSample = 1.0 / (f32(SAMPLE_COUNT) * pdf + 0.0001);
            var mipLevel = 0.0;
            if (roughness > 0.0) {
                mipLevel = 0.5 * log2(saSample / saTexel);
            }

            prefilteredColor += textureSampleLevel(envCubemap, envSampler, L, mipLevel).rgb * NdotL;
            totalWeight += NdotL;
        }
    }

    prefilteredColor = prefilteredColor / max(totalWeight, 0.001);
    textureStore(outputPrefiltered, globalId.xy, globalId.z, vec4<f32>(prefilteredColor, 1.0));
}
        `;

        const shaderModule = this.device.createShaderModule({
            label: "Prefilter Shader",
            code: shader,
        });

        this.prefilterBindGroupLayout = this.device.createBindGroupLayout({
            label: "Prefilter Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float", viewDimension: "cube" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    sampler: { type: "filtering" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba16float",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this.prefilterPipeline = this.device.createComputePipeline({
            label: "Prefilter Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.prefilterBindGroupLayout],
            }),
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });
    }

    private createBRDFPipeline(): void {
        const shader = /* wgsl */ `
const PI: f32 = 3.14159265359;
const SAMPLE_COUNT: u32 = 1024u;

@group(0) @binding(0) var outputBRDF: texture_storage_2d<rgba16float, write>;

fn radicalInverse_VdC(bits_in: u32) -> f32 {
    var bits = bits_in;
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return f32(bits) * 2.3283064365386963e-10;
}

fn hammersley(i: u32, N: u32) -> vec2<f32> {
    return vec2<f32>(f32(i) / f32(N), radicalInverse_VdC(i));
}

fn importanceSampleGGX(Xi: vec2<f32>, N: vec3<f32>, roughness: f32) -> vec3<f32> {
    let a = roughness * roughness;

    let phi = 2.0 * PI * Xi.x;
    let cosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a * a - 1.0) * Xi.y));
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    let H = vec3<f32>(
        cos(phi) * sinTheta,
        sin(phi) * sinTheta,
        cosTheta
    );

    var up = vec3<f32>(0.0, 1.0, 0.0);
    if (abs(N.y) > 0.999) {
        up = vec3<f32>(0.0, 0.0, 1.0);
    }
    let tangent = normalize(cross(up, N));
    let bitangent = cross(N, tangent);

    return normalize(tangent * H.x + bitangent * H.y + N * H.z);
}

fn GeometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let a = roughness;
    let k = (a * a) / 2.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

fn GeometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2 = GeometrySchlickGGX(NdotV, roughness);
    let ggx1 = GeometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let size = textureDimensions(outputBRDF);
    if (globalId.x >= size.x || globalId.y >= size.y) {
        return;
    }

    let NdotV = (f32(globalId.x) + 0.5) / f32(size.x);
    let roughness = (f32(globalId.y) + 0.5) / f32(size.y);

    let V = vec3<f32>(sqrt(1.0 - NdotV * NdotV), 0.0, NdotV);
    let N = vec3<f32>(0.0, 0.0, 1.0);

    var A = 0.0;
    var B = 0.0;

    let r = max(roughness, 0.001);

    for (var i = 0u; i < SAMPLE_COUNT; i++) {
        let Xi = hammersley(i, SAMPLE_COUNT);
        let H = importanceSampleGGX(Xi, N, r);
        let L = normalize(2.0 * dot(V, H) * H - V);

        let NdotL = max(L.z, 0.0);
        let NdotH = max(H.z, 0.0);
        let VdotH = max(dot(V, H), 0.0);

        if (NdotL > 0.0) {
            let G = GeometrySmith(N, V, L, r);
            let G_Vis = (G * VdotH) / max(NdotH * NdotV, 0.001);
            let Fc = pow(1.0 - VdotH, 5.0);

            A += (1.0 - Fc) * G_Vis;
            B += Fc * G_Vis;
        }
    }

    A /= f32(SAMPLE_COUNT);
    B /= f32(SAMPLE_COUNT);

    textureStore(outputBRDF, globalId.xy, vec4<f32>(A, B, 0.0, 1.0));
}
        `;

        const shaderModule = this.device.createShaderModule({
            label: "BRDF LUT Shader",
            code: shader,
        });

        this.brdfBindGroupLayout = this.device.createBindGroupLayout({
            label: "BRDF Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba16float",
                    },
                },
            ],
        });

        this.brdfPipeline = this.device.createComputePipeline({
            label: "BRDF Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.brdfBindGroupLayout],
            }),
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });
    }

    private createDummyResources(): void {
        // Create dummy cubemap (1x1 black)
        const dummyCubemap = this.device.createTexture({
            label: "Dummy Cubemap",
            size: [1, 1, 6],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            dimension: "2d",
        });

        const blackPixel = new Float32Array([0, 0, 0, 1]);
        for (let face = 0; face < 6; face++) {
            this.device.queue.writeTexture(
                { texture: dummyCubemap, origin: [0, 0, face] },
                blackPixel,
                { bytesPerRow: 8 },
                [1, 1, 1]
            );
        }

        this.dummyCubemapView = dummyCubemap.createView({
            dimension: "cube",
        });

        // Create samplers
        this.cubemapSampler = this.device.createSampler({
            label: "Cubemap Sampler",
            minFilter: "linear",
            magFilter: "linear",
            mipmapFilter: "linear",
        });

        this.brdfSampler = this.device.createSampler({
            label: "BRDF Sampler",
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        // Create environment params buffer
        this.envParamsBuffer = this.device.createBuffer({
            label: "Environment Params Buffer",
            size: 16, // vec4 (intensity, hasEnvironment, pad, pad)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    private createEnvironmentBindGroupLayout(): void {
        this.environmentBindGroupLayout = this.device.createBindGroupLayout({
            label: "Environment Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float", viewDimension: "cube" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float", viewDimension: "cube" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" },
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" },
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });
    }

    private generateBRDFLUT(): void {
        if (this.brdfGenerated) return;

        const size = 256;
        this.brdfLUT = this.device.createTexture({
            label: "BRDF LUT",
            size: [size, size],
            format: "rgba16float",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING,
        });
        this.brdfLUTView = this.brdfLUT.createView();

        const bindGroup = this.device.createBindGroup({
            layout: this.brdfBindGroupLayout!,
            entries: [{ binding: 0, resource: this.brdfLUTView }],
        });

        const commandEncoder = this.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.brdfPipeline!);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(size / 8),
            Math.ceil(size / 8)
        );
        computePass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        this.brdfGenerated = true;
    }

    processEnvironment(environment: Environment): void {
        if (!environment.hdrData || !environment.needsUpdate) return;

        // Ensure BRDF LUT is generated
        this.generateBRDFLUT();

        const resolution = environment.resolution;
        const mipLevels = environment.specularMipLevels;

        // 1. Upload equirectangular HDR to texture
        environment.equirectTexture?.destroy();
        environment.equirectTexture = this.device.createTexture({
            label: "Equirectangular HDR",
            size: [environment.hdrWidth, environment.hdrHeight],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Convert Float32 HDR data to Float16 for GPU texture
        // WebGPU's writeTexture requires data format to match texture format
        const float32Data = environment.hdrData;
        const float16Data = new Uint16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
            float16Data[i] = floatToHalf(float32Data[i]);
        }

        this.device.queue.writeTexture(
            { texture: environment.equirectTexture },
            float16Data,
            { bytesPerRow: environment.hdrWidth * 8 },  // 4 channels × 2 bytes (half float) = 8 bytes/pixel
            [environment.hdrWidth, environment.hdrHeight]
        );

        // 2. Create cubemap with mipmaps
        environment.cubemap?.destroy();
        environment.cubemap = this.device.createTexture({
            label: "Environment Cubemap",
            size: [resolution, resolution, 6],
            format: "rgba16float",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING,
            mipLevelCount: Math.floor(Math.log2(resolution)) + 1,
            dimension: "2d",
        });
        environment.cubemapView = environment.cubemap.createView({
            dimension: "cube",
        });

        // 3. Create irradiance map (low-res)
        const irradianceSize = 32;
        environment.irradianceMap?.destroy();
        environment.irradianceMap = this.device.createTexture({
            label: "Irradiance Map",
            size: [irradianceSize, irradianceSize, 6],
            format: "rgba16float",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING,
            dimension: "2d",
        });
        environment.irradianceMapView = environment.irradianceMap.createView({
            dimension: "cube",
        });

        // 4. Create prefiltered map with mip levels
        environment.prefilteredMap?.destroy();
        environment.prefilteredMap = this.device.createTexture({
            label: "Prefiltered Map",
            size: [resolution, resolution, 6],
            format: "rgba16float",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING,
            mipLevelCount: mipLevels,
            dimension: "2d",
        });
        environment.prefilteredMapView = environment.prefilteredMap.createView({
            dimension: "cube",
        });

        const commandEncoder = this.device.createCommandEncoder({
            label: "Environment Processing",
        });

        // Step 1: Convert equirectangular to cubemap
        this.convertEquirectToCubemap(
            commandEncoder,
            environment.equirectTexture,
            environment.cubemap,
            resolution
        );

        // Generate cubemap mipmaps for prefilter sampling
        this.generateCubemapMipmaps(
            commandEncoder,
            environment.cubemap,
            resolution
        );

        // Step 2: Generate irradiance map
        this.generateIrradianceMap(
            commandEncoder,
            environment.cubemap,
            environment.irradianceMap,
            irradianceSize
        );

        // Step 3: Generate prefiltered specular map
        this.generatePrefilteredMap(
            commandEncoder,
            environment.cubemap,
            environment.prefilteredMap,
            resolution,
            mipLevels
        );

        this.device.queue.submit([commandEncoder.finish()]);

        environment.needsUpdate = false;

        // Invalidate bind group cache
        this.environmentBindGroupCache.delete(environment.id);
    }

    private convertEquirectToCubemap(
        commandEncoder: GPUCommandEncoder,
        equirectTexture: GPUTexture,
        cubemap: GPUTexture,
        resolution: number
    ): void {
        const equirectView = equirectTexture.createView();
        const cubemapView = cubemap.createView({
            dimension: "2d-array",
            baseMipLevel: 0,
            mipLevelCount: 1,
        });

        const sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
        });

        const bindGroup = this.device.createBindGroup({
            layout: this.equirectBindGroupLayout!,
            entries: [
                { binding: 0, resource: equirectView },
                { binding: 1, resource: sampler },
                { binding: 2, resource: cubemapView },
            ],
        });

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.equirectToCubemapPipeline!);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(resolution / 8),
            Math.ceil(resolution / 8),
            6
        );
        computePass.end();
    }

    private generateCubemapMipmaps(
        commandEncoder: GPUCommandEncoder,
        cubemap: GPUTexture,
        resolution: number
    ): void {
        // Simple box filter mipmap generation for cubemaps
        // Note: This is a simplified approach; for better quality, use proper cubemap filtering
        const mipLevels = Math.floor(Math.log2(resolution)) + 1;

        const mipmapShader = /* wgsl */ `
@group(0) @binding(0) var srcTexture: texture_2d_array<f32>;
@group(0) @binding(1) var dstTexture: texture_storage_2d_array<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let dstSize = textureDimensions(dstTexture);
    if (globalId.x >= dstSize.x || globalId.y >= dstSize.y) {
        return;
    }

    let srcCoord = globalId.xy * 2u;
    let layer = globalId.z;

    let s00 = textureLoad(srcTexture, srcCoord + vec2<u32>(0u, 0u), layer, 0);
    let s10 = textureLoad(srcTexture, srcCoord + vec2<u32>(1u, 0u), layer, 0);
    let s01 = textureLoad(srcTexture, srcCoord + vec2<u32>(0u, 1u), layer, 0);
    let s11 = textureLoad(srcTexture, srcCoord + vec2<u32>(1u, 1u), layer, 0);

    let avg = (s00 + s10 + s01 + s11) * 0.25;
    textureStore(dstTexture, globalId.xy, layer, avg);
}
        `;

        const shaderModule = this.device.createShaderModule({
            code: mipmapShader,
        });

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float", viewDimension: "2d-array" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba16float",
                        viewDimension: "2d-array",
                    },
                },
            ],
        });

        const pipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout],
            }),
            compute: { module: shaderModule, entryPoint: "main" },
        });

        let srcWidth = resolution;
        let srcHeight = resolution;

        for (let level = 1; level < mipLevels; level++) {
            const dstWidth = Math.max(1, srcWidth >> 1);
            const dstHeight = Math.max(1, srcHeight >> 1);

            const srcView = cubemap.createView({
                dimension: "2d-array",
                baseMipLevel: level - 1,
                mipLevelCount: 1,
            });

            const dstView = cubemap.createView({
                dimension: "2d-array",
                baseMipLevel: level,
                mipLevelCount: 1,
            });

            const bindGroup = this.device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: srcView },
                    { binding: 1, resource: dstView },
                ],
            });

            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(pipeline);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(
                Math.ceil(dstWidth / 8),
                Math.ceil(dstHeight / 8),
                6
            );
            computePass.end();

            srcWidth = dstWidth;
            srcHeight = dstHeight;
        }
    }

    private generateIrradianceMap(
        commandEncoder: GPUCommandEncoder,
        cubemap: GPUTexture,
        irradianceMap: GPUTexture,
        irradianceSize: number
    ): void {
        const cubemapView = cubemap.createView({ dimension: "cube" });
        const irradianceView = irradianceMap.createView({
            dimension: "2d-array",
        });

        const bindGroup = this.device.createBindGroup({
            layout: this.irradianceBindGroupLayout!,
            entries: [
                { binding: 0, resource: cubemapView },
                { binding: 1, resource: this.cubemapSampler! },
                { binding: 2, resource: irradianceView },
            ],
        });

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.irradiancePipeline!);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(irradianceSize / 8),
            Math.ceil(irradianceSize / 8),
            6
        );
        computePass.end();
    }

    private generatePrefilteredMap(
        commandEncoder: GPUCommandEncoder,
        cubemap: GPUTexture,
        prefilteredMap: GPUTexture,
        resolution: number,
        mipLevels: number
    ): void {
        const cubemapView = cubemap.createView({ dimension: "cube" });

        for (let mip = 0; mip < mipLevels; mip++) {
            const mipSize = Math.max(1, resolution >> mip);
            const roughness = mip / (mipLevels - 1);

            const prefilteredView = prefilteredMap.createView({
                dimension: "2d-array",
                baseMipLevel: mip,
                mipLevelCount: 1,
            });

            // Create params buffer for this mip level
            const paramsBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(
                paramsBuffer,
                0,
                new Float32Array([roughness, resolution])
            );

            const bindGroup = this.device.createBindGroup({
                layout: this.prefilterBindGroupLayout!,
                entries: [
                    { binding: 0, resource: cubemapView },
                    { binding: 1, resource: this.cubemapSampler! },
                    { binding: 2, resource: prefilteredView },
                    { binding: 3, resource: { buffer: paramsBuffer } },
                ],
            });

            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.prefilterPipeline!);
            computePass.setBindGroup(0, bindGroup);
            computePass.dispatchWorkgroups(
                Math.ceil(mipSize / 8),
                Math.ceil(mipSize / 8),
                6
            );
            computePass.end();
        }
    }

    getEnvironmentBindGroupLayout(): GPUBindGroupLayout {
        return this.environmentBindGroupLayout!;
    }

    getEnvironmentBindGroup(environment: Environment | null): GPUBindGroup {
        // Ensure BRDF LUT exists
        if (!this.brdfGenerated) {
            this.generateBRDFLUT();
        }

        if (!environment || !environment.irradianceMapView) {
            // Return dummy bind group
            if (!this.dummyEnvironmentBindGroup) {
                this.device.queue.writeBuffer(
                    this.envParamsBuffer!,
                    0,
                    new Float32Array([1.0, 0.0, 0.0, 0.0])
                );

                this.dummyEnvironmentBindGroup = this.device.createBindGroup({
                    layout: this.environmentBindGroupLayout!,
                    entries: [
                        { binding: 0, resource: this.dummyCubemapView! },
                        { binding: 1, resource: this.dummyCubemapView! },
                        { binding: 2, resource: this.brdfLUTView! },
                        { binding: 3, resource: this.cubemapSampler! },
                        { binding: 4, resource: this.brdfSampler! },
                        {
                            binding: 5,
                            resource: { buffer: this.envParamsBuffer! },
                        },
                    ],
                });
            }
            return this.dummyEnvironmentBindGroup;
        }

        let bindGroup = this.environmentBindGroupCache.get(environment.id);
        if (!bindGroup) {
            // Update params buffer
            this.device.queue.writeBuffer(
                this.envParamsBuffer!,
                0,
                new Float32Array([environment.intensity, 1.0, 0.0, 0.0])
            );

            bindGroup = this.device.createBindGroup({
                layout: this.environmentBindGroupLayout!,
                entries: [
                    { binding: 0, resource: environment.irradianceMapView! },
                    { binding: 1, resource: environment.prefilteredMapView! },
                    { binding: 2, resource: this.brdfLUTView! },
                    { binding: 3, resource: this.cubemapSampler! },
                    { binding: 4, resource: this.brdfSampler! },
                    {
                        binding: 5,
                        resource: { buffer: this.envParamsBuffer! },
                    },
                ],
            });

            this.environmentBindGroupCache.set(environment.id, bindGroup);
        }

        return bindGroup;
    }

    getSkyboxResources(environment: Environment | null): {
        cubemapView: GPUTextureView;
        sampler: GPUSampler;
        intensity: number;
    } {
        return {
            cubemapView: environment?.cubemapView ?? this.dummyCubemapView!,
            sampler: this.cubemapSampler!,
            intensity: environment?.intensity ?? 1.0,
        };
    }

    dispose(): void {
        this.brdfLUT?.destroy();
        this.envParamsBuffer?.destroy();
        this.environmentBindGroupCache.clear();
    }
}
