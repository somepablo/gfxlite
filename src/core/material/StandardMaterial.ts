import { Vector3 } from "../../math";
import { Material, MaterialType, BlendMode } from "./Material";
import type { Texture } from "./Texture";

export interface StandardMaterialOptions {
    // Base properties
    baseColor?: Vector3;
    alpha?: number;
    metallic?: number;
    roughness?: number;

    // Emissive
    emissive?: Vector3;
    emissiveFactor?: number;

    // Normal/occlusion
    normalScale?: number;
    occlusionStrength?: number;

    // Textures
    baseColorMap?: Texture;
    normalMap?: Texture;
    metallicRoughnessMap?: Texture;
    emissiveMap?: Texture;
    aoMap?: Texture;

    // Transparency
    transparent?: boolean;
    blendMode?: BlendMode;
    alphaCutoff?: number;
    doubleSided?: boolean;
}

export class StandardMaterial extends Material {
    public readonly materialType = MaterialType.Standard;
    public readonly needsLighting = true;
    public readonly needsNormals = true;

    // Textures
    public baseColorMap: Texture | null = null;
    public normalMap: Texture | null = null;
    public metallicRoughnessMap: Texture | null = null;
    public emissiveMap: Texture | null = null;
    public aoMap: Texture | null = null;

    constructor(options: StandardMaterialOptions = {}) {
        super();

        // Set defaults
        this.uniforms.baseColor = options.baseColor ?? new Vector3(1, 1, 1);
        this.uniforms.alpha = options.alpha ?? 1.0;
        this.uniforms.metallic = options.metallic ?? 0.0;
        this.uniforms.roughness = options.roughness ?? 0.5;
        this.uniforms.emissive = options.emissive ?? new Vector3(0, 0, 0);
        this.uniforms.emissiveFactor = options.emissiveFactor ?? 1.0;
        this.uniforms.normalScale = options.normalScale ?? 1.0;
        this.uniforms.occlusionStrength = options.occlusionStrength ?? 1.0;

        // Textures
        this.baseColorMap = options.baseColorMap ?? null;
        this.normalMap = options.normalMap ?? null;
        this.metallicRoughnessMap = options.metallicRoughnessMap ?? null;
        this.emissiveMap = options.emissiveMap ?? null;
        this.aoMap = options.aoMap ?? null;

        // Transparency
        this.transparent = options.transparent ?? false;
        this.blendMode = options.blendMode ?? BlendMode.Opaque;
        this.alphaCutoff = options.alphaCutoff ?? 0.5;
        this.doubleSided = options.doubleSided ?? false;
        this.depthWrite = !this.transparent;
    }

    hasTextures(): boolean {
        return !!(
            this.baseColorMap ||
            this.normalMap ||
            this.metallicRoughnessMap ||
            this.emissiveMap ||
            this.aoMap
        );
    }

    getUniformBufferData(): Float32Array {
        const baseColor = this.uniforms.baseColor as Vector3;
        const emissive = this.uniforms.emissive as Vector3;

        // Layout (80 bytes = 20 floats):
        // vec4 baseColor (RGB + alpha)         = 4 floats
        // vec4 emissive (RGB + emissiveFactor) = 4 floats
        // vec4 props (metallic, roughness, normalScale, occlusionStrength) = 4 floats
        // vec4 flags (hasBaseColorMap, hasNormalMap, hasMetallicRoughnessMap, hasEmissiveMap) = 4 floats
        // vec4 flags2 (hasAOMap, alphaCutoff, blendMode, pad) = 4 floats

        return new Float32Array([
            // baseColor (vec4)
            ...baseColor.toArray(),
            this.uniforms.alpha as number,
            // emissive (vec4)
            ...emissive.toArray(),
            this.uniforms.emissiveFactor as number,
            // props (vec4)
            this.uniforms.metallic as number,
            this.uniforms.roughness as number,
            this.uniforms.normalScale as number,
            this.uniforms.occlusionStrength as number,
            // flags (vec4) - texture presence flags
            this.baseColorMap ? 1.0 : 0.0,
            this.normalMap ? 1.0 : 0.0,
            this.metallicRoughnessMap ? 1.0 : 0.0,
            this.emissiveMap ? 1.0 : 0.0,
            // flags2 (vec4)
            this.aoMap ? 1.0 : 0.0,
            this.alphaCutoff,
            this.blendMode,
            0.0, // padding
        ]);
    }

    getVertexShader(): string {
        return /* wgsl */ `
const MAX_CAMERAS: u32 = 5u;

struct CameraData {
    viewProjection: mat4x4<f32>,
    frustum: array<vec4<f32>, 6>,
}

struct CameraUniforms {
    mainViewProjection: mat4x4<f32>,
    cameraPosition: vec3<f32>,
    activeLightCount: u32,
    cameras: array<CameraData, MAX_CAMERAS>,
}

struct InstanceData {
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    flags: vec4<f32>, // x: receiveShadow, y: castShadow
}

struct CulledInstances {
    indices: array<u32>,
}

@group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(0) @binding(1) var<storage, read> culled: CulledInstances;
@group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vPosition: vec3<f32>,
    @location(1) vNormal: vec3<f32>,
    @location(2) vUV: vec2<f32>,
    @location(3) vCameraPos: vec3<f32>,
    @location(4) vReceiveShadow: f32,
    @location(5) vTangent: vec4<f32>,
}

@vertex
fn main(
    @builtin(instance_index) instanceIndex: u32,
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) tangent: vec4<f32>
) -> VertexOutput {
    let actualIndex = culled.indices[instanceIndex];
    let instance = instances[actualIndex];

    let worldPos = instance.modelMatrix * vec4<f32>(position, 1.0);

    var output: VertexOutput;
    output.position = cameraUniforms.mainViewProjection * worldPos;
    output.vPosition = worldPos.xyz;
    output.vNormal = normalize((instance.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
    output.vUV = uv;
    output.vCameraPos = cameraUniforms.cameraPosition;
    output.vReceiveShadow = instance.flags.x;
    // Transform tangent to world space (using model matrix for direction)
    output.vTangent = vec4<f32>(normalize((instance.modelMatrix * vec4<f32>(tangent.xyz, 0.0)).xyz), tangent.w);
    return output;
}
        `;
    }

    getFragmentShader(): string {
        return /* wgsl */ `
const PI: f32 = 3.14159265359;

struct MaterialUniforms {
    baseColor: vec4<f32>,      // RGB + alpha
    emissive: vec4<f32>,       // RGB + emissiveFactor
    props: vec4<f32>,          // metallic, roughness, normalScale, occlusionStrength
    flags: vec4<f32>,          // hasBaseColorMap, hasNormalMap, hasMetallicRoughnessMap, hasEmissiveMap
    flags2: vec4<f32>,         // hasAOMap, alphaCutoff, blendMode, pad
}
@group(1) @binding(0) var<uniform> material: MaterialUniforms;

struct Light {
    direction: vec3<f32>,
    intensity: f32,
    color: vec3<f32>,
    shadowLayerIndex: i32,
    viewProj: mat4x4<f32>,
    shadowMapSize: vec2<f32>,
    shadowType: f32,
    padding: f32,
}
struct LightUniforms {
    ambientColor: vec3<f32>,
    lightCount: u32,
    lights: array<Light, 16>,
}
@group(2) @binding(0) var<uniform> lighting: LightUniforms;
@group(2) @binding(1) var shadowMap: texture_depth_2d_array;
@group(2) @binding(2) var shadowSampler: sampler_comparison;

// Textures (group 3)
@group(3) @binding(0) var baseColorMap: texture_2d<f32>;
@group(3) @binding(1) var normalMap: texture_2d<f32>;
@group(3) @binding(2) var metallicRoughnessMap: texture_2d<f32>;
@group(3) @binding(3) var emissiveMap: texture_2d<f32>;
@group(3) @binding(4) var aoMap: texture_2d<f32>;
@group(3) @binding(5) var texSampler: sampler;

// PBR Helper Functions
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

fn GeometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = (roughness + 1.0);
    let k = (r * r) / 8.0;

    let num = NdotV;
    let denom = NdotV * (1.0 - k) + k;

    return num / denom;
}

fn GeometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2 = GeometrySchlickGGX(NdotV, roughness);
    let ggx1 = GeometrySchlickGGX(NdotL, roughness);

    return ggx1 * ggx2;
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn getNormalFromMap(normal: vec3<f32>, tangent: vec4<f32>, worldPos: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    if (material.flags.y < 0.5) {
        return normal;
    }

    let tangentNormal = textureSample(normalMap, texSampler, uv).xyz * 2.0 - 1.0;

    let N = normalize(normal);
    var T: vec3<f32>;
    var B: vec3<f32>;

    // Compute derivatives unconditionally to avoid "dpdx must only be called from uniform control flow" error
    let Q1 = dpdx(worldPos);
    let Q2 = dpdy(worldPos);
    let st1 = dpdx(uv);
    let st2 = dpdy(uv);

    // Use provided tangent if valid (w is +/- 1.0). BatchManager uses 0.0 for dummy tangents.
    // Note: This condition is non-uniform (varying), but since derivatives are now computed outside, it's safe.
    if (abs(tangent.w) > 0.5) {
        T = normalize(tangent.xyz);
        B = cross(N, T) * tangent.w;
    } else {
        // Fallback to derivative-based TBN
        T = normalize(Q1 * st2.y - Q2 * st1.y);
        B = -normalize(cross(N, T));
    }

    let TBN = mat3x3<f32>(T, B, N);

    return normalize(TBN * (tangentNormal * vec3<f32>(material.props.z, material.props.z, 1.0)));
}

fn calculateShadow(worldPos: vec3<f32>, light: Light, receiveShadow: f32) -> f32 {
    // Early return for no shadow layer (uniform condition)
    if (light.shadowLayerIndex < 0) {
        return 1.0;
    }

    let lightPos = light.viewProj * vec4<f32>(worldPos, 1.0);
    let shadowPos = vec3<f32>(
        lightPos.x * 0.5 + 0.5,
        -lightPos.y * 0.5 + 0.5,
        lightPos.z
    );

    // Always sample shadow map (uniform control flow for textureSampleCompare)
    var shadowSample = 0.0;
    let layerIndex = light.shadowLayerIndex;

    if (light.shadowType > 1.5) {
        // PCFSoft (5x5)
        let texelSize = vec2<f32>(1.0 / light.shadowMapSize.x, 1.0 / light.shadowMapSize.y);
        for (var x = -2; x <= 2; x++) {
            for (var y = -2; y <= 2; y++) {
                let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
                shadowSample += textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy + offset, layerIndex, shadowPos.z - 0.005);
            }
        }
        shadowSample = shadowSample / 25.0;
    } else {
        shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy, layerIndex, shadowPos.z - 0.005);
    }

    // Apply shadow only if within light frustum and receiveShadow is enabled
    if (shadowPos.x > 0.0 && shadowPos.x < 1.0 &&
        shadowPos.y > 0.0 && shadowPos.y < 1.0 &&
        shadowPos.z > 0.0 && shadowPos.z < 1.0 &&
        receiveShadow > 0.5) {
        return shadowSample;
    }

    return 1.0;
}

@fragment
fn main(
    @location(0) vPosition: vec3<f32>,
    @location(1) vNormal: vec3<f32>,
    @location(2) vUV: vec2<f32>,
    @location(3) vCameraPos: vec3<f32>,
    @location(4) vReceiveShadow: f32,
    @location(5) vTangent: vec4<f32>
) -> @location(0) vec4<f32> {
    // Sample textures
    var albedo = material.baseColor.rgb;
    var alpha = material.baseColor.a;
    if (material.flags.x > 0.5) {
        let texColor = textureSample(baseColorMap, texSampler, vUV);
        albedo *= texColor.rgb;
        alpha *= texColor.a;
    }

    // Alpha cutoff for masked materials (blendMode == 2)
    if (material.flags2.z > 1.5 && material.flags2.z < 2.5) {
        if (alpha < material.flags2.y) {
            discard;
        }
    }

    var metallic = material.props.x;
    var roughness = material.props.y;
    if (material.flags.z > 0.5) {
        let mrSample = textureSample(metallicRoughnessMap, texSampler, vUV);
        roughness *= mrSample.g; // G channel = roughness (glTF)
        metallic *= mrSample.b;  // B channel = metallic (glTF)
    }
    roughness = clamp(roughness, 0.04, 1.0);

    var emissive = material.emissive.rgb * material.emissive.w;
    if (material.flags.w > 0.5) {
        emissive *= textureSample(emissiveMap, texSampler, vUV).rgb;
    }

    var ao = 1.0;
    if (material.flags2.x > 0.5) {
        ao = mix(1.0, textureSample(aoMap, texSampler, vUV).r, material.props.w);
    }

    // Get normal
    let N = getNormalFromMap(vNormal, vTangent, vPosition, vUV);
    let V = normalize(vCameraPos - vPosition);

    // Calculate F0 (reflectance at normal incidence)
    let F0 = mix(vec3<f32>(0.04), albedo, metallic);

    // Reflectance equation
    var Lo = vec3<f32>(0.0);

    for (var i = 0u; i < lighting.lightCount; i++) {
        let light = lighting.lights[i];
        let L = normalize(-light.direction);
        let H = normalize(V + L);

        let shadow = calculateShadow(vPosition, light, vReceiveShadow);
        let radiance = light.color * light.intensity * shadow;

        // Cook-Torrance BRDF
        let NDF = DistributionGGX(N, H, roughness);
        let G = GeometrySmith(N, V, L, roughness);
        let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

        let kS = F;
        var kD = vec3<f32>(1.0) - kS;
        kD *= 1.0 - metallic;

        let numerator = NDF * G * F;
        let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
        let specular = numerator / denominator;

        let NdotL = max(dot(N, L), 0.0);
        Lo += (kD * albedo / PI + specular) * radiance * NdotL;
    }

    // Ambient lighting with metallic workflow
    // Metals have no diffuse, only specular from environment reflections
    // Without environment map, metals should appear darker
    var kD_ambient = vec3<f32>(1.0 - metallic);

    // Diffuse ambient (zero for pure metals)
    let ambient = lighting.ambientColor * albedo * kD_ambient * ao;

    let color = ambient + Lo + emissive;

    // Tone mapping (simple Reinhard)
    let mapped = color / (color + vec3<f32>(1.0));

    // Gamma correction
    let gammaCorrected = pow(mapped, vec3<f32>(1.0 / 2.2));

    return vec4<f32>(gammaCorrected, alpha);
}
        `;
    }
}
