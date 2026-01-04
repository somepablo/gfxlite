import { Vector3 } from "../../math";
import { Material, MaterialType, BlendMode } from "./Material";
import type { Texture } from "./Texture";

export interface LambertMaterialOptions {
	color?: Vector3;
	opacity?: number;
	transparent?: boolean;
	map?: Texture;
}

export class LambertMaterial extends Material {
	public readonly materialType = MaterialType.Lambert;
	public readonly needsLighting = true;
	public readonly needsNormals = true;

	public map: Texture | null = null;

	constructor({
		color = new Vector3(1, 1, 1),
		opacity = 1.0,
		transparent,
		map,
	}: LambertMaterialOptions = {}) {
		super();
		this.uniforms.color = color;
		this.map = map ?? null;
		this.opacity = opacity;
		// Auto-enable transparency if opacity < 1
		this.transparent = transparent ?? opacity < 1.0;
		if (this.transparent) {
			this.blendMode = BlendMode.AlphaBlend;
			this.depthWrite = false;
		}
	}

	hasTextures(): boolean {
		return !!this.map;
	}

	getUniformBufferData(): Float32Array {
		const color = this.uniforms.color as Vector3;
		// Layout: color (vec3) + opacity (f32) + hasMap (f32) + padding (3 f32) = 32 bytes
		return new Float32Array([
			...color.toArray(),
			this.opacity,
			this.map ? 1.0 : 0.0,
			0.0,
			0.0,
			0.0, // padding to 32 bytes
		]);
	}

	getVertexShader(): string {
		const hasMap = !!this.map;
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
          @builtin(position) @invariant position: vec4<f32>,
          @location(0) vPosition: vec3<f32>,
          @location(1) vNormal: vec3<f32>,
          ${hasMap ? "@location(2) vUV: vec2<f32>," : ""}
          @location(${hasMap ? 3 : 2}) vReceiveShadow: f32,
      }

      @vertex
      fn main(
          @builtin(instance_index) instanceIndex: u32,
          @location(0) position: vec3<f32>,
          @location(1) normal: vec3<f32>${hasMap ? ",\n          @location(2) uv: vec2<f32>" : ""}
      ) -> VertexOutput {
          let actualIndex = culled.indices[instanceIndex];
          let instance = instances[actualIndex];

          let worldPos = instance.modelMatrix * vec4<f32>(position, 1.0);

          var output: VertexOutput;
          output.position = cameraUniforms.mainViewProjection * worldPos;
          output.vPosition = worldPos.xyz;
          output.vNormal = normalize((instance.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
          ${hasMap ? "output.vUV = uv;" : ""}
          output.vReceiveShadow = instance.flags.x;
          return output;
      }
    `;
	}

	getFragmentShader(): string {
		const hasMap = !!this.map;
		return /* wgsl */ `
      struct MaterialUniforms {
          color: vec3<f32>,
          opacity: f32,
          hasMap: f32,
          _pad0: f32,
          _pad1: f32,
          _pad2: f32,
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

      ${
				hasMap
					? `
      @group(3) @binding(0) var map: texture_2d<f32>;
      @group(3) @binding(1) var mapSampler: sampler;
      `
					: ""
			}

      @fragment
      fn main(
          @location(0) vPosition: vec3<f32>,
          @location(1) vNormal: vec3<f32>,
          ${hasMap ? "@location(2) vUV: vec2<f32>," : ""}
          @location(${hasMap ? 3 : 2}) vReceiveShadow: f32
      ) -> @location(0) vec4<f32> {
          let normal = normalize(vNormal);

          // Sample texture if present
          var baseColor = material.color;
          var alpha = material.opacity;
          ${
						hasMap
							? `
          let texColor = textureSample(map, mapSampler, vUV);
          baseColor *= texColor.rgb;
          alpha *= texColor.a;
          `
							: ""
					}

          // Ambient
          let ambient = lighting.ambientColor * baseColor;

          // Diffuse
          var diffuse = vec3<f32>(0.0);

          for (var i = 0u; i < lighting.lightCount; i++) {
              let light = lighting.lights[i];
              let lightDir = normalize(-light.direction);

              // Shadow Calculation
              var shadow = 1.0;

              // Transform position to light space
              let lightPos = light.viewProj * vec4<f32>(vPosition, 1.0);
              let shadowPos = vec3<f32>(
                  lightPos.x * 0.5 + 0.5,
                  -lightPos.y * 0.5 + 0.5,
                  lightPos.z
              );

              // Sample shadow map
              var shadowSample = 0.0;
              let layerIndex = light.shadowLayerIndex;
              let shadowType = light.shadowType;

              if (layerIndex >= 0) {
                  if (shadowType > 1.5) {
                      // PCFSoft (5x5)
                      var shadowSum = 0.0;
                      let texelSize = vec2<f32>(1.0 / light.shadowMapSize.x, 1.0 / light.shadowMapSize.y);
                      for (var x = -2; x <= 2; x++) {
                          for (var y = -2; y <= 2; y++) {
                              let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
                              shadowSum += textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy + offset, layerIndex, shadowPos.z - 0.005);
                          }
                      }
                      shadowSample = shadowSum / 25.0;
                  } else {
                      // PCF (Single sample, hardware filtering) or Basic
                      shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy, layerIndex, shadowPos.z - 0.005);
                  }
              } else {
                  // No shadow
                  shadowSample = 1.0;
              }

              // Apply shadow only if within light frustum
              if (shadowPos.x > 0.0 && shadowPos.x < 1.0 && shadowPos.y > 0.0 && shadowPos.y < 1.0 && shadowPos.z > 0.0 && shadowPos.z < 1.0) {
                  // Check receiveShadow flag from vertex output
                  if (vReceiveShadow > 0.5) {
                      shadow = shadowSample;
                  }
              }

              // Diffuse
              let diff = max(dot(normal, lightDir), 0.0);
              diffuse += diff * light.color * light.intensity * baseColor * shadow;
          }

          return vec4<f32>(ambient + diffuse, alpha);
      }
    `;
	}
}
