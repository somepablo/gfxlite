import { RenderPhase } from "./RenderPhase";
import type { BatchManager } from "./BatchManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";

const CULLING_WORKGROUP_SIZE = 64;
const MAX_CAMERAS = 5; // 1 main + 4 shadow lights

// Unified culling shader that tests all cameras in one pass
const UNIFIED_CULLING_SHADER = /* wgsl */ `
const MAX_CAMERAS: u32 = 5u;
const WORKGROUP_SIZE: u32 = 64u;

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
    flags: vec4<f32>, // x: receiveShadow, y: castShadow, z: padding, w: padding
}

struct CulledInstances {
    indices: array<u32>,
}

struct IndirectArgs {
    indexCount: u32,
    instanceCount: atomic<u32>,
    firstIndex: u32,
    baseVertex: u32,
    firstInstance: u32,
}

struct BatchInfo {
    instanceOffset: u32,
    instanceCount: u32,
    boundingSphereRadius: f32,
    culledStridePerCamera: u32, // Aligned stride in u32 count (256-byte aligned / 4)
}

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(1) @binding(1) var<storage, read_write> culled: CulledInstances;
@group(1) @binding(2) var<storage, read_write> indirectArgs: array<IndirectArgs, MAX_CAMERAS>;
@group(1) @binding(3) var<uniform> batchInfo: BatchInfo;

fn testFrustum(worldPos: vec4<f32>, radius: f32, cameraIndex: u32) -> bool {
    let camera = cameraUniforms.cameras[cameraIndex];

    for (var i = 0u; i < 6u; i++) {
        let plane = camera.frustum[i];
        if (dot(plane, worldPos) < -radius) {
            return false;
        }
    }
    return true;
}

fn getScaledRadius(instanceIndex: u32) -> f32 {
    let worldMatrix = instances[instanceIndex].modelMatrix;

    // Extract scale from matrix basis vectors (squared lengths to avoid sqrt)
    let scaleXSq = dot(worldMatrix[0].xyz, worldMatrix[0].xyz);
    let scaleYSq = dot(worldMatrix[1].xyz, worldMatrix[1].xyz);
    let scaleZSq = dot(worldMatrix[2].xyz, worldMatrix[2].xyz);
    let maxScaleSq = max(max(scaleXSq, scaleYSq), scaleZSq);

    // Use sqrt only once for the max scale
    return batchInfo.boundingSphereRadius * sqrt(maxScaleSq);
}

@compute @workgroup_size(${CULLING_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let localIndex = globalId.x;
    if (localIndex >= batchInfo.instanceCount) {
        return;
    }

    let instanceIndex = batchInfo.instanceOffset + localIndex;
    let instance = instances[instanceIndex];

    // Extract world position from model matrix
    let worldPos = vec4<f32>(
        instance.modelMatrix[3][0],
        instance.modelMatrix[3][1],
        instance.modelMatrix[3][2],
        1.0
    );

    let radius = getScaledRadius(instanceIndex);
    let castShadow = instance.flags.y > 0.5;

    // Use aligned stride for buffer offsets (in u32 count)
    let slotsPerCamera = batchInfo.culledStridePerCamera;

    // Test main camera (camera 0) - all objects
    if (testFrustum(worldPos, radius, 0u)) {
        let culledIndex = atomicAdd(&indirectArgs[0].instanceCount, 1u);
        culled.indices[culledIndex] = instanceIndex;
    }

    // Test shadow light cameras (cameras 1-4) - only shadow casters
    if (castShadow) {
        let numLights = cameraUniforms.activeLightCount;
        for (var lightIdx = 0u; lightIdx < numLights; lightIdx++) {
            let cameraIdx = lightIdx + 1u;
            if (testFrustum(worldPos, radius, cameraIdx)) {
                let culledIndex = atomicAdd(&indirectArgs[cameraIdx].instanceCount, 1u);
                let bufferOffset = cameraIdx * slotsPerCamera;
                culled.indices[bufferOffset + culledIndex] = instanceIndex;
            }
        }
    }
}
`;

export class CullingComputePhase extends RenderPhase {
    private cullingPipeline: GPUComputePipeline | null = null;
    private batchManager: BatchManager | null = null;

    constructor(device: GPUDevice) {
        super(device, "Unified Culling Compute Phase");
    }

    setBatchManager(batchManager: BatchManager): void {
        this.batchManager = batchManager;
        this.initPipeline();
    }

    private initPipeline(): void {
        if (!this.batchManager) return;

        const shaderModule = this.device.createShaderModule({
            label: "Unified Culling Shader",
            code: UNIFIED_CULLING_SHADER,
        });

        this.cullingPipeline = this.device.createComputePipeline({
            label: "Unified Culling Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.batchManager.getCameraBindGroupLayout(),
                    this.batchManager.getCullBindGroupLayout(),
                ],
            }),
            compute: {
                module: shaderModule,
                entryPoint: "main",
            },
        });
    }

    prepare(_scene: Scene, _camera: Camera): void {
        // Nothing to do here - BatchManager handles preparation
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (!this.cullingPipeline || !this.batchManager) return;

        const batches = this.batchManager.getBatches();
        if (batches.length === 0) return;

        const cameraBindGroup = this.batchManager.getCameraBindGroup();
        if (!cameraBindGroup) return;

        // Clear all indirect buffer instanceCounts
        for (const batch of batches) {
            // Clear instanceCount for all cameras (offset 4 bytes into each 20-byte indirect args)
            for (let cam = 0; cam < MAX_CAMERAS; cam++) {
                const offset = cam * 20 + 4; // Skip indexCount (4 bytes), clear instanceCount (4 bytes)
                commandEncoder.clearBuffer(batch.indirectBuffer, offset, 4);
            }
        }

        // Single compute pass for all batches
        const computePass = commandEncoder.beginComputePass({
            label: "Unified Frustum Culling",
        });

        computePass.setPipeline(this.cullingPipeline);
        computePass.setBindGroup(0, cameraBindGroup);

        for (const batch of batches) {
            const cullBindGroup = this.batchManager.getCullBindGroup(batch);
            computePass.setBindGroup(1, cullBindGroup);

            const workgroupCount = Math.ceil(batch.instanceCount / CULLING_WORKGROUP_SIZE);
            computePass.dispatchWorkgroups(workgroupCount);
        }

        computePass.end();
    }
}
