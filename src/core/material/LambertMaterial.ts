import { Vector3 } from "../../math";
import { Material } from "./Material";

export interface LambertMaterialOptions {
    color?: Vector3;
}

export class LambertMaterial extends Material {
    constructor({ color = new Vector3(1, 1, 1) }: LambertMaterialOptions = {}) {
        super();
        this.uniforms.color = color;
    }

    getUniformBufferData(): Float32Array {
        const color = this.uniforms.color as Vector3;
        return new Float32Array([...color.toArray(), 0]); // Color + padding
    }

    getVertexShader(): string {
        return /* wgsl */ `
      struct Uniforms {
        mvpMatrix : mat4x4<f32>,
        modelMatrix : mat4x4<f32>,
        normalMatrix : mat4x4<f32>,
        cameraPosition : vec4<f32>, // w contains receiveShadow flag
      };
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) vPosition : vec3<f32>,
        @location(1) vNormal : vec3<f32>,
      };

      @vertex
      fn main(@location(0) position : vec3<f32>, @location(1) normal : vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
        output.position = uniforms.mvpMatrix * vec4<f32>(position, 1.0);
        output.vPosition = (uniforms.modelMatrix * vec4<f32>(position, 1.0)).xyz;
        output.vNormal = normalize((uniforms.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
        return output;
      }
    `;
    }

    getFragmentShader(): string {
        return /* wgsl */ `
      struct Uniforms {
        mvpMatrix : mat4x4<f32>,
        modelMatrix : mat4x4<f32>,
        normalMatrix : mat4x4<f32>,
        cameraPosition : vec4<f32>, // w contains receiveShadow flag
      };
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;

      struct MaterialUniforms {
        color : vec3<f32>,
      };
      @group(1) @binding(0) var<uniform> material : MaterialUniforms;

      struct Light {
        direction : vec3<f32>,
        intensity : f32,
        color : vec3<f32>,
        shadowLayerIndex : i32,
        viewProj : mat4x4<f32>,
        shadowMapSize : vec2<f32>,
        shadowType : f32,
        padding : f32,
      };
      struct LightUniforms {
        ambientColor : vec3<f32>,
        lightCount : u32,
        lights : array<Light, 16>,
      };
      @group(2) @binding(0) var<uniform> lighting : LightUniforms;
      @group(2) @binding(1) var shadowMap: texture_depth_2d_array;
      @group(2) @binding(2) var shadowSampler: sampler_comparison;


      @fragment
      fn main(@location(0) vPosition : vec3<f32>, @location(1) vNormal : vec3<f32>) -> @location(0) vec4<f32> {
        let normal = normalize(vNormal);
        
        // Ambient
        let ambient = lighting.ambientColor * material.color;

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
                  // Check receiveShadow flag (packed in cameraPosition.w)
                  if (uniforms.cameraPosition.w > 0.5) {
                      shadow = shadowSample;
                  }
             }

            // Diffuse
            let diff = max(dot(normal, lightDir), 0.0);
            diffuse += diff * light.color * light.intensity * material.color * shadow;
        }

        return vec4<f32>(ambient + diffuse, 1.0);
      }
    `;
    }
}
