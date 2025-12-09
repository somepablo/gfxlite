import { RenderPhase } from "./RenderPhase";
import type { DrawBatch } from "./BatchManager";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";

const CULLING_WORKGROUP_SIZE = 64;

// Shader matching BatchManager's InstanceData layout
const MAIN_CULLING_SHADER = /* wgsl */ `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    frustum: array<vec4<f32>, 6>,
}

struct InstanceData {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    cameraPosAndFlags: vec4<f32>,
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
    padding: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> instances: array<InstanceData>;
@group(1) @binding(1) var<storage, read_write> culled: CulledInstances;
@group(1) @binding(2) var<storage, read_write> indirectArgs: IndirectArgs;
@group(1) @binding(3) var<uniform> batchInfo: BatchInfo;

fn isVisible(instanceIndex: u32) -> bool {
    let worldMatrix = instances[instanceIndex].modelMatrix;

    let worldPos = vec4<f32>(
        worldMatrix[3][0],
        worldMatrix[3][1],
        worldMatrix[3][2],
        1.0
    );

    let scaleX = length(vec3<f32>(worldMatrix[0][0], worldMatrix[0][1], worldMatrix[0][2]));
    let scaleY = length(vec3<f32>(worldMatrix[1][0], worldMatrix[1][1], worldMatrix[1][2]));
    let scaleZ = length(vec3<f32>(worldMatrix[2][0], worldMatrix[2][1], worldMatrix[2][2]));
    let maxScale = max(max(scaleX, scaleY), scaleZ);

    let radius = batchInfo.boundingSphereRadius * maxScale;

    for (var i = 0u; i < 6u; i++) {
        let plane = camera.frustum[i];
        if (dot(plane, worldPos) < -radius) {
            return false;
        }
    }

    return true;
}

@compute @workgroup_size(${CULLING_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let localIndex = globalId.x;
    if (localIndex >= batchInfo.instanceCount) {
        return;
    }

    let instanceIndex = batchInfo.instanceOffset + localIndex;

    if (!isVisible(instanceIndex)) {
        return;
    }

    let culledIndex = atomicAdd(&indirectArgs.instanceCount, 1u);
    culled.indices[culledIndex] = instanceIndex;
}
`;

// Shader matching ShadowRenderPhase's data layout (separate world matrices)
const SHADOW_CULLING_SHADER = /* wgsl */ `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    frustum: array<vec4<f32>, 6>,
}

struct ShadowInstanceData {
    mvpMatrix: mat4x4<f32>,
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
    padding: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<storage, read> instances: array<ShadowInstanceData>;
@group(1) @binding(1) var<storage, read_write> culled: CulledInstances;
@group(1) @binding(2) var<storage, read_write> indirectArgs: IndirectArgs;
@group(1) @binding(3) var<uniform> batchInfo: BatchInfo;
@group(1) @binding(4) var<storage, read> worldMatrices: array<mat4x4<f32>>;

fn isVisible(instanceIndex: u32) -> bool {
    let worldMatrix = worldMatrices[instanceIndex];

    let worldPos = vec4<f32>(
        worldMatrix[3][0],
        worldMatrix[3][1],
        worldMatrix[3][2],
        1.0
    );

    let scaleX = length(vec3<f32>(worldMatrix[0][0], worldMatrix[0][1], worldMatrix[0][2]));
    let scaleY = length(vec3<f32>(worldMatrix[1][0], worldMatrix[1][1], worldMatrix[1][2]));
    let scaleZ = length(vec3<f32>(worldMatrix[2][0], worldMatrix[2][1], worldMatrix[2][2]));
    let maxScale = max(max(scaleX, scaleY), scaleZ);

    let radius = batchInfo.boundingSphereRadius * maxScale;

    for (var i = 0u; i < 6u; i++) {
        let plane = camera.frustum[i];
        if (dot(plane, worldPos) < -radius) {
            return false;
        }
    }

    return true;
}

@compute @workgroup_size(${CULLING_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let localIndex = globalId.x;
    if (localIndex >= batchInfo.instanceCount) {
        return;
    }

    let instanceIndex = batchInfo.instanceOffset + localIndex;

    if (!isVisible(instanceIndex)) {
        return;
    }

    let culledIndex = atomicAdd(&indirectArgs.instanceCount, 1u);
    culled.indices[culledIndex] = instanceIndex;
}
`;

interface CullRequest {
    batch: DrawBatch;
    cameraBindGroup: GPUBindGroup;
    cullBindGroup: GPUBindGroup;
    indirectBuffer: GPUBuffer;
    type: "main" | "shadow";
}

export class CullingComputePhase extends RenderPhase {
    private mainCullingPipeline: GPUComputePipeline | null = null;
    private shadowCullingPipeline: GPUComputePipeline | null = null;
    private requests: CullRequest[] = [];

    // Layouts stored here to be shared/accessed
    public cameraBindGroupLayout: GPUBindGroupLayout | null = null;
    public mainCullBindGroupLayout: GPUBindGroupLayout | null = null;
    public shadowCullBindGroupLayout: GPUBindGroupLayout | null = null;

    constructor(
        device: GPUDevice
    ) {
        super(device, "Culling Compute Phase");
        this.initPipelines();
    }

    private initPipelines(): void {
        this.cameraBindGroupLayout = this.device.createBindGroupLayout({
            label: "Culling Camera Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
            ],
        });

        // Main culling layout (matches current BatchManager layout)
        this.mainCullBindGroupLayout = this.device.createBindGroupLayout({
            label: "Main Cull Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }, // instances
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }, // culled instances
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }, // indirect args
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }, // batch info
                },
            ],
        });

        // Shadow culling layout (matches current ShadowRenderPhase layout)
        this.shadowCullBindGroupLayout = this.device.createBindGroupLayout({
            label: "Shadow Cull Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }, // instances
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }, // culled indices
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }, // indirect args
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }, // batch info
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }, // world matrices
                },
            ],
        });

        const mainShaderModule = this.device.createShaderModule({
            label: "Main Culling Shader",
            code: MAIN_CULLING_SHADER,
        });

        this.mainCullingPipeline = this.device.createComputePipeline({
            label: "Main Culling Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
                    this.mainCullBindGroupLayout,
                ],
            }),
            compute: {
                module: mainShaderModule,
                entryPoint: "main",
            },
        });

        const shadowShaderModule = this.device.createShaderModule({
            label: "Shadow Culling Shader",
            code: SHADOW_CULLING_SHADER,
        });

        this.shadowCullingPipeline = this.device.createComputePipeline({
            label: "Shadow Culling Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
                    this.shadowCullBindGroupLayout,
                ],
            }),
            compute: {
                module: shadowShaderModule,
                entryPoint: "main",
            },
        });
    }

    addCullPass(
        type: "main" | "shadow",
        batch: DrawBatch,
        cameraBindGroup: GPUBindGroup,
        cullBindGroup: GPUBindGroup,
        indirectBuffer: GPUBuffer
    ): void {
        this.requests.push({ type, batch, cameraBindGroup, cullBindGroup, indirectBuffer });
    }

    clear(): void {
        this.requests = [];
    }

    prepare(_scene: Scene, _camera: Camera): void {
        // Nothing to do here, prepare is done via addCullPass calls
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (this.requests.length === 0) return;

        // Sort requests by type to minimize pipeline switches (shadow first, then main)
        this.requests.sort((a, b) => {
            if (a.type === b.type) return 0;
            return a.type === "shadow" ? -1 : 1;
        });

        // 1. Clear Indirect Buffers (reset instanceCount)
        for (const req of this.requests) {
             // Clear instanceCount at offset 4 (after indexCount)
             // indirectBuffer struct: indexCount(4), instanceCount(4), ...
             commandEncoder.clearBuffer(req.indirectBuffer, 4, 4);
        }

        // 2. Dispatch Compute
        const computePass = commandEncoder.beginComputePass({
            label: "Frustum Culling Phase",
        });

        let currentPipeline: GPUComputePipeline | null = null;
        let currentType: string | null = null;
        let currentCameraBindGroup: GPUBindGroup | null = null;

        for (const req of this.requests) {
            // Switch pipeline if needed
            if (req.type !== currentType) {
                currentType = req.type;
                currentPipeline =
                    req.type === "main"
                        ? this.mainCullingPipeline
                        : this.shadowCullingPipeline;
                if (currentPipeline) {
                    computePass.setPipeline(currentPipeline);
                }
            }

            if (!currentPipeline) continue;

            // Update camera bind group if changed
            if (req.cameraBindGroup !== currentCameraBindGroup) {
                currentCameraBindGroup = req.cameraBindGroup;
                computePass.setBindGroup(0, currentCameraBindGroup);
            }

            computePass.setBindGroup(1, req.cullBindGroup);

            const workgroupCount = Math.ceil(
                req.batch.instanceCount / CULLING_WORKGROUP_SIZE
            );
            computePass.dispatchWorkgroups(workgroupCount);
        }

        computePass.end();
    }
}
