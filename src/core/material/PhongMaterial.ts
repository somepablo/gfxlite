import { Vector3 } from "../../math";
import { Material } from "./Material";

export interface PhongMaterialOptions {
    color?: Vector3;
    specular?: Vector3;
    shininess?: number;
}

export class PhongMaterial extends Material {
    constructor({
        color = new Vector3(1, 1, 1),
        specular = new Vector3(1, 1, 1),
        shininess = 30,
    }: PhongMaterialOptions = {}) {
        super();
        this.uniforms.color = color;
        this.uniforms.specular = specular;
        this.uniforms.shininess = shininess;
    }

    getUniformBufferData(): Float32Array {
        const color = this.uniforms.color as Vector3;
        const specular = this.uniforms.specular as Vector3;
        const shininess = this.uniforms.shininess as number;

        return new Float32Array([
            ...color.toArray(), 0, // Color + padding
            ...specular.toArray(), shininess, // Specular + shininess
        ]);
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
        specular : vec3<f32>,
        shininess : f32,
      };
      @group(1) @binding(0) var<uniform> material : MaterialUniforms;

      struct Light {
        direction : vec3<f32>,
        intensity : f32,
        color : vec3<f32>,
        shadowType : f32, // Padding used for shadow type
        viewProj : mat4x4<f32>,
        shadowMapSize : vec2<f32>,
        padding : vec2<f32>,
      };
      struct LightUniforms {
        ambientColor : vec3<f32>,
        lightCount : u32,
        lights : array<Light, 1>,
      };
      @group(2) @binding(0) var<uniform> lighting : LightUniforms;
      @group(2) @binding(1) var shadowMap: texture_depth_2d;
      @group(2) @binding(2) var shadowSampler: sampler_comparison;

      @fragment
      fn main(@location(0) vPosition : vec3<f32>, @location(1) vNormal : vec3<f32>) -> @location(0) vec4<f32> {
        let normal = normalize(vNormal);
        let viewDir = normalize(uniforms.cameraPosition.xyz - vPosition);
        
        // Ambient
        let ambient = lighting.ambientColor * material.color;

        // Diffuse & Specular
        var diffuse = vec3<f32>(0.0);
        var specular = vec3<f32>(0.0);

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
             let shadowType = light.shadowType;

             if (shadowType > 1.5) {
                 // PCFSoft (5x5)
                 var shadowSum = 0.0;
                 let texelSize = vec2<f32>(1.0 / light.shadowMapSize.x, 1.0 / light.shadowMapSize.y);
                 for (var x = -2; x <= 2; x++) {
                     for (var y = -2; y <= 2; y++) {
                         let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
                         shadowSum += textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy + offset, shadowPos.z - 0.005);
                     }
                 }
                 shadowSample = shadowSum / 25.0;
             } else if (shadowType > 0.5) {
                 // PCF (Single sample, hardware filtering)
                 shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy, shadowPos.z - 0.005);
             } else if (shadowType > -0.5) {
                 // Basic (Single sample, hardware filtering if linear, or nearest if configured)
                 // Since we configure sampler based on type, this is just a single sample
                 shadowSample = textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy, shadowPos.z - 0.005);
             } else {
                 // No shadow (shouldn't happen if castShadow is checked, but safe fallback)
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

            // Specular (Blinn-Phong)
            if (diff > 0.0) {
                let halfDir = normalize(lightDir + viewDir);
                let specAngle = max(dot(normal, halfDir), 0.0);
                let spec = pow(specAngle, material.shininess);
                specular += spec * material.specular * light.color * light.intensity * shadow;
            }
        }

        return vec4<f32>(ambient + diffuse + specular, 1.0);
      }
    `;
    }
}
