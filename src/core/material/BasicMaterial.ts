import { Vector3 } from "../../math";
import { BlendMode, Material, MaterialType } from "./Material";
import type { Texture } from "./Texture";

export interface BasicMaterialOptions {
	color?: Vector3;
	opacity?: number;
	transparent?: boolean;
	map?: Texture;
}

export class BasicMaterial extends Material {
	public readonly materialType = MaterialType.Basic;
	public readonly needsLighting = false;
	public readonly needsNormals = false;

	public map: Texture | null = null;

	constructor({
		color = new Vector3(1, 1, 1),
		opacity = 1.0,
		transparent,
		map,
	}: BasicMaterialOptions = {}) {
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
		// Layout: color (vec3) + opacity (f32) = 16 bytes
		return new Float32Array([...color.toArray(), this.opacity]);
	}

	getVertexShader(): string {
		const hasMap = !!this.map;

		if (hasMap) {
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
          flags: vec4<f32>,
      }

      struct CulledInstances {
          indices: array<u32>,
      }

      @group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
      @group(0) @binding(1) var<storage, read> culled: CulledInstances;
      @group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

      struct VertexOutput {
          @builtin(position) @invariant position: vec4<f32>,
          @location(0) vUV: vec2<f32>,
      }

      @vertex
      fn main(
          @builtin(instance_index) instanceIndex: u32,
          @location(0) position: vec3<f32>,
          @location(1) uv: vec2<f32>
      ) -> VertexOutput {
          let actualIndex = culled.indices[instanceIndex];
          let worldPos = instances[actualIndex].modelMatrix * vec4<f32>(position, 1.0);

          var output: VertexOutput;
          output.position = cameraUniforms.mainViewProjection * worldPos;
          output.vUV = uv;
          return output;
      }
    `;
		} else {
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
          flags: vec4<f32>,
      }

      struct CulledInstances {
          indices: array<u32>,
      }

      @group(0) @binding(0) var<storage, read> instances: array<InstanceData>;
      @group(0) @binding(1) var<storage, read> culled: CulledInstances;
      @group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

      @vertex
      fn main(
          @builtin(instance_index) instanceIndex: u32,
          @location(0) position: vec3<f32>
      ) -> @invariant @builtin(position) vec4<f32> {
          let actualIndex = culled.indices[instanceIndex];
          let worldPos = instances[actualIndex].modelMatrix * vec4<f32>(position, 1.0);
          return cameraUniforms.mainViewProjection * worldPos;
      }
    `;
		}
	}

	getFragmentShader(): string {
		const hasMap = !!this.map;

		if (hasMap) {
			return /* wgsl */ `
      struct MaterialUniforms {
          color: vec3<f32>,
          opacity: f32,
      }
      @group(1) @binding(0) var<uniform> material: MaterialUniforms;

      @group(2) @binding(0) var map: texture_2d<f32>;
      @group(2) @binding(1) var mapSampler: sampler;

      @fragment
      fn main(@location(0) vUV: vec2<f32>) -> @location(0) vec4<f32> {
          let texColor = textureSample(map, mapSampler, vUV);
          let color = material.color * texColor.rgb;
          return vec4<f32>(color, texColor.a * material.opacity);
      }
    `;
		} else {
			return /* wgsl */ `
      struct MaterialUniforms {
          color: vec3<f32>,
          opacity: f32,
      }
      @group(1) @binding(0) var<uniform> material: MaterialUniforms;

      @fragment
      fn main() -> @location(0) vec4<f32> {
          return vec4<f32>(material.color, material.opacity);
      }
    `;
		}
	}
}
