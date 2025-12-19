import { RenderPhase } from "./RenderPhase";
import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";
import { Mesh } from "../object/Mesh";
import { BasicMaterial } from "../material/BasicMaterial";
import { LambertMaterial } from "../material/LambertMaterial";
import { PhongMaterial } from "../material/PhongMaterial";
import { StandardMaterial } from "../material/StandardMaterial";
import { MaterialType } from "../material/Material";
import type { LightingManager } from "./LightingManager";
import type { BatchManager, DrawBatch } from "./BatchManager";
import type { TextureManager } from "../material/TextureManager";
import type { Material } from "../material/Material";
import { Program } from "./Program";
import { Vector3 } from "../../math";

interface IndirectPipelineData {
    program: Program;
    lightingBindGroup: GPUBindGroup | null;
}

// Alpha blend state for transparent materials
const ALPHA_BLEND_STATE: GPUBlendState = {
    color: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
    },
    alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
    },
};

export class MainRenderPhase extends RenderPhase {
    private lightingManager: LightingManager;
    private batchManager: BatchManager;
    private textureManager: TextureManager;
    private context: GPUCanvasContext;
    private depthTextureView: GPUTextureView;
    private msaaTextureView: GPUTextureView | null;
    private sampleCount: number;

    private renderList: Mesh[] = [];
    private batches: DrawBatch[] = [];

    // Camera position for transparent sorting
    private cameraPosition: Vector3 = new Vector3();

    // Indirect pipeline cache by material type + transparency
    private indirectPipelineCache = new Map<string, IndirectPipelineData>();

    // Bind group layouts for indirect rendering
    private materialBindGroupLayout: GPUBindGroupLayout | null = null;
    private lightingBindGroupLayout: GPUBindGroupLayout | null = null;
    private textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private simpleTextureBindGroupLayout: GPUBindGroupLayout | null = null;

    // Texture bind group cache
    private textureBindGroupCache = new Map<number, GPUBindGroup>();
    private simpleTextureBindGroupCache = new Map<number, GPUBindGroup>();

    public debugInfo = {
        calls: 0,
        triangles: 0,
        batches: 0,
    };

    constructor(
        device: GPUDevice,
        lightingManager: LightingManager,
        batchManager: BatchManager,
        textureManager: TextureManager,
        context: GPUCanvasContext,
        depthTextureView: GPUTextureView,
        msaaTextureView: GPUTextureView | null,
        sampleCount: number
    ) {
        super(device, "Main Render Phase");
        this.lightingManager = lightingManager;
        this.batchManager = batchManager;
        this.textureManager = textureManager;
        this.context = context;
        this.depthTextureView = depthTextureView;
        this.msaaTextureView = msaaTextureView;
        this.sampleCount = sampleCount;

        this.initBindGroupLayouts();
    }

    private initBindGroupLayouts(): void {
        // Material bind group layout (group 1)
        this.materialBindGroupLayout = this.device.createBindGroupLayout({
            label: "Material Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        // Lighting bind group layout (group 2)
        this.lightingBindGroupLayout = this.device.createBindGroupLayout({
            label: "Lighting Bind Group Layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "depth",
                        viewDimension: "2d-array",
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "comparison" },
                },
            ],
        });

        // Texture bind group layout (group 3) for PBR materials
        this.textureBindGroupLayout = this.device.createBindGroupLayout({
            label: "PBR Texture Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // baseColorMap
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // normalMap
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // metallicRoughnessMap
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // emissiveMap
                { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // aoMap
                { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },   // sampler
            ],
        });

        // Simple texture bind group layout for Basic/Lambert/Phong materials
        this.simpleTextureBindGroupLayout = this.device.createBindGroupLayout({
            label: "Simple Texture Bind Group Layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // map
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },   // sampler
            ],
        });
    }

    private getIndirectPipeline(material: Material): IndirectPipelineData {
        // Use cached pipeline key from material
        const cacheKey = material.getPipelineKey();

        let pipelineData = this.indirectPipelineCache.get(cacheKey);
        if (pipelineData) {
            return pipelineData;
        }

        const matType = material.materialType;
        const isStandard = matType === MaterialType.Standard;
        const isBasic = matType === MaterialType.Basic;
        const hasTextures = material.hasTextures();
        const needsLighting = material.needsLighting;
        const needsNormals = material.needsNormals;

        // Build bind group layouts array
        const bindGroupLayouts: GPUBindGroupLayout[] = [
            this.batchManager.getRenderBindGroupLayout(), // Group 0: instances + culled + camera
            this.materialBindGroupLayout!, // Group 1: material
        ];

        if (needsLighting) {
            bindGroupLayouts.push(this.lightingBindGroupLayout!); // Group 2: lighting
        }

        if (isStandard) {
            bindGroupLayouts.push(this.textureBindGroupLayout!); // Group 3: textures (PBR)
        } else if (hasTextures) {
            // Simple materials with textures
            if (isBasic) {
                bindGroupLayouts.push(this.simpleTextureBindGroupLayout!); // Group 2: textures (no lighting)
            } else {
                bindGroupLayouts.push(this.simpleTextureBindGroupLayout!); // Group 3: textures (after lighting)
            }
        }

        // Determine if UVs are needed
        const needsUVs = isStandard || hasTextures;

        // Create the program with appropriate options
        const program = new Program(this.device, {
            vertex: { code: material.getVertexShader() },
            fragment: { code: material.getFragmentShader() },
            multisample: { count: this.sampleCount },
            bindGroupLayouts,
            positionOnly: isBasic && !hasTextures,
            hasNormals: needsNormals,
            hasUVs: needsUVs,
            hasTangents: isStandard,
            blend: material.transparent ? ALPHA_BLEND_STATE : undefined,
            depthWrite: !material.transparent,
            depthCompare: "less-equal",
        });

        // Create lighting bind group if needed
        let lightingBindGroup: GPUBindGroup | null = null;
        if (needsLighting) {
            lightingBindGroup = this.createLightingBindGroup();
        }

        pipelineData = { program, lightingBindGroup };
        this.indirectPipelineCache.set(cacheKey, pipelineData);

        return pipelineData;
    }

    private createLightingBindGroup(): GPUBindGroup {
        const lightingBuffer = this.lightingManager.getLightingBuffer()!;
        const shadowMapView =
            this.lightingManager.shadowMapArrayView ||
            this.lightingManager.getDummyShadowMap();
        const shadowSampler = this.lightingManager.getShadowSampler();

        return this.device.createBindGroup({
            label: "Indirect Lighting Bind Group",
            layout: this.lightingBindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: lightingBuffer } },
                { binding: 1, resource: shadowMapView },
                { binding: 2, resource: shadowSampler },
            ],
        });
    }

    invalidateLightingBindGroups(): void {
        // Called when shadow map is recreated
        for (const [, data] of this.indirectPipelineCache) {
            if (data.lightingBindGroup) {
                data.lightingBindGroup = this.createLightingBindGroup();
            }
        }
    }

    prepare(scene: Scene, camera: Camera): void {
        this.renderList = [];
        this.debugInfo.calls = 0;
        this.debugInfo.triangles = 0;
        this.debugInfo.batches = 0;

        // Store camera position for transparent sorting
        this.cameraPosition.copy(camera.position);

        // Collect meshes
        scene.traverse((object) => {
            if (object instanceof Mesh) {
                this.renderList.push(object);
            }
        });

        // Prepare batches
        this.batches = this.batchManager.prepareBatches(this.renderList);
        this.debugInfo.batches = this.batches.length;
    }

    execute(commandEncoder: GPUCommandEncoder): void {
        if (this.batches.length === 0) return;

        // Separate batches into opaque and transparent
        const opaqueBatches: DrawBatch[] = [];
        const transparentBatches: DrawBatch[] = [];

        for (const batch of this.batches) {
            if (batch.material.transparent) {
                transparentBatches.push(batch);
            } else {
                opaqueBatches.push(batch);
            }
        }

        // Sort transparent batches back-to-front
        if (transparentBatches.length > 0) {
            this.sortTransparentBatches(transparentBatches);
        }

        const textureView = this.context.getCurrentTexture().createView();

        // Render all batches in a single pass (required for MSAA - can't load discarded MSAA buffer)
        // Opaque first, then transparent (already sorted back-to-front)
        const allBatchesOrdered = [...opaqueBatches, ...transparentBatches];

        // TODO: Change depthLoadOp back to "load" when re-enabling depth pre-pass
        this.renderBatches(commandEncoder, allBatchesOrdered, textureView, "clear", "clear");
    }

    private sortTransparentBatches(batches: DrawBatch[]): void {
        batches.sort((a, b) => {
            const distA = this.getBatchCentroidDistance(a);
            const distB = this.getBatchCentroidDistance(b);
            return distB - distA; // Back to front
        });
    }

    private getBatchCentroidDistance(batch: DrawBatch): number {
        // Average distance of all mesh centroids in batch
        let totalDist = 0;
        for (const mesh of batch.meshes) {
            const pos = mesh.worldMatrix.extractPosition();
            const dx = pos.x - this.cameraPosition.x;
            const dy = pos.y - this.cameraPosition.y;
            const dz = pos.z - this.cameraPosition.z;
            totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        return totalDist / batch.meshes.length;
    }

    private renderBatches(
        commandEncoder: GPUCommandEncoder,
        batches: DrawBatch[],
        textureView: GPUTextureView,
        colorLoadOp: "clear" | "load",
        depthLoadOp: "clear" | "load"
    ): void {
        if (batches.length === 0) return;

        const colorAttachment: GPURenderPassColorAttachment = {
            view: this.sampleCount > 1 ? this.msaaTextureView! : textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
            loadOp: colorLoadOp,
            storeOp: this.sampleCount > 1 ? "discard" : "store",
        };

        if (this.sampleCount > 1) {
            colorAttachment.resolveTarget = textureView;
        }

        const passEncoder = commandEncoder.beginRenderPass({
            label: `Main Render Pass (color: ${colorLoadOp}, depth: ${depthLoadOp})`,
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: depthLoadOp,
                depthStoreOp: "store",
            },
        });

        let currentPipeline: GPURenderPipeline | null = null;
        let currentPipelineKey: string | null = null;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const material = batch.material;

            // Use cached material properties instead of instanceof checks
            const matType = material.materialType;
            const isStandard = matType === MaterialType.Standard;
            const isBasic = matType === MaterialType.Basic;
            const hasTextures = material.hasTextures();
            const needsNormals = material.needsNormals;

            const pipelineKey = material.getPipelineKey();
            const pipelineData = this.getIndirectPipeline(material);
            const geometryData = this.batchManager.getGeometryData(batch.geometry);

            // Set pipeline if changed
            if (pipelineKey !== currentPipelineKey) {
                currentPipelineKey = pipelineKey;
                currentPipeline = pipelineData.program.pipeline;
                passEncoder.setPipeline(currentPipeline);

                // Set lighting bind group (group 2) if needed
                if (pipelineData.lightingBindGroup) {
                    passEncoder.setBindGroup(2, pipelineData.lightingBindGroup);
                }
            }

            // Set instance bind group (group 0) - camera index 0 for main camera
            const renderBindGroup = this.batchManager.getRenderBindGroup(batch, 0);
            passEncoder.setBindGroup(0, renderBindGroup);

            // Set material bind group (group 1)
            const materialBindGroup = this.getMaterialBindGroup(
                material,
                pipelineData.program
            );
            passEncoder.setBindGroup(1, materialBindGroup);

            // Set texture bind group for materials with textures
            if (isStandard) {
                const textureBindGroup = this.getTextureBindGroup(material as StandardMaterial);
                passEncoder.setBindGroup(3, textureBindGroup);
            } else if (hasTextures) {
                const textureBindGroup = this.getSimpleTextureBindGroup(material);
                // BasicMaterial uses group 2 (no lighting), others use group 3 (after lighting)
                const textureGroupIndex = isBasic ? 2 : 3;
                passEncoder.setBindGroup(textureGroupIndex, textureBindGroup);
            }

            // Set vertex buffers
            // Slot 0: position (always)
            passEncoder.setVertexBuffer(0, geometryData.vertexBuffer);

            // Determine buffer layout:
            // BasicMaterial: position only, or position + UV (no normals)
            // Others: position + normal, or position + normal + UV
            const needsUVs = isStandard || hasTextures;

            let nextSlot = 1;

            // Slot 1: normal (for non-Basic materials)
            if (needsNormals && geometryData.normalBuffer) {
                passEncoder.setVertexBuffer(nextSlot++, geometryData.normalBuffer);
            }

            // Slot 1 or 2: UV (depending on whether normals are present)
            if (needsUVs && geometryData.uvBuffer) {
                passEncoder.setVertexBuffer(nextSlot++, geometryData.uvBuffer);
            }

            // Slot 2 or 3: Tangent (for StandardMaterial)
            if (isStandard && geometryData.tangentBuffer) {
                passEncoder.setVertexBuffer(nextSlot++, geometryData.tangentBuffer);
            }

            // Draw using indirect buffer at offset 0 (main camera)
            const indirectOffset = this.batchManager.getIndirectBufferOffset(0);
            if (geometryData.indexBuffer) {
                passEncoder.setIndexBuffer(geometryData.indexBuffer, "uint32");
                passEncoder.drawIndexedIndirect(batch.indirectBuffer, indirectOffset);
            } else {
                passEncoder.drawIndirect(batch.indirectBuffer, indirectOffset);
            }

            this.debugInfo.calls++;
            this.debugInfo.triangles +=
                (batch.geometry.indexCount / 3) * batch.instanceCount;
        }

        passEncoder.end();
    }

    private getTextureBindGroup(material: StandardMaterial): GPUBindGroup {
        let bindGroup = this.textureBindGroupCache.get(material.id);

        if (!bindGroup || material.needsUpdate) {
            const tm = this.textureManager;

            bindGroup = this.device.createBindGroup({
                label: `PBR Texture Bind Group ${material.id}`,
                layout: this.textureBindGroupLayout!,
                entries: [
                    {
                        binding: 0,
                        resource: material.baseColorMap
                            ? tm.uploadTexture(material.baseColorMap)
                            : tm.dummyWhiteTexture,
                    },
                    {
                        binding: 1,
                        resource: material.normalMap
                            ? tm.uploadTexture(material.normalMap)
                            : tm.dummyNormalTexture,
                    },
                    {
                        binding: 2,
                        resource: material.metallicRoughnessMap
                            ? tm.uploadTexture(material.metallicRoughnessMap)
                            : tm.dummyWhiteTexture,
                    },
                    {
                        binding: 3,
                        resource: material.emissiveMap
                            ? tm.uploadTexture(material.emissiveMap)
                            : tm.dummyBlackTexture,
                    },
                    {
                        binding: 4,
                        resource: material.aoMap
                            ? tm.uploadTexture(material.aoMap)
                            : tm.dummyWhiteTexture,
                    },
                    { binding: 5, resource: tm.defaultSampler },
                ],
            });

            this.textureBindGroupCache.set(material.id, bindGroup);
        }

        return bindGroup;
    }

    private getSimpleTextureBindGroup(material: Material): GPUBindGroup {
        let bindGroup = this.simpleTextureBindGroupCache.get(material.id);

        if (!bindGroup || material.needsUpdate) {
            const tm = this.textureManager;

            // Get the map from the material (Basic, Lambert, or Phong)
            const map = (material as BasicMaterial | LambertMaterial | PhongMaterial).map;

            bindGroup = this.device.createBindGroup({
                label: `Simple Texture Bind Group ${material.id}`,
                layout: this.simpleTextureBindGroupLayout!,
                entries: [
                    {
                        binding: 0,
                        resource: map
                            ? tm.uploadTexture(map)
                            : tm.dummyWhiteTexture,
                    },
                    { binding: 1, resource: tm.defaultSampler },
                ],
            });

            this.simpleTextureBindGroupCache.set(material.id, bindGroup);
        }

        return bindGroup;
    }

    private materialBindGroupCache = new Map<number, GPUBindGroup>();
    private materialBufferCache = new Map<number, GPUBuffer>();

    private getMaterialBindGroup(
        material: Material,
        _program: Program
    ): GPUBindGroup {
        let bindGroup = this.materialBindGroupCache.get(material.id);

        if (!bindGroup || material.needsUpdate) {
            // Destroy old buffer if exists to prevent memory leak
            const oldBuffer = this.materialBufferCache.get(material.id);
            if (oldBuffer) {
                oldBuffer.destroy();
            }

            const uniformData = material.getUniformBufferData();
            const uniformBuffer = this.device.createBuffer({
                label: `Material Uniform Buffer ${material.id}`,
                size: Math.max(uniformData.byteLength, 16), // Minimum 16 bytes
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as GPUAllowSharedBufferSource);

            bindGroup = this.device.createBindGroup({
                label: `Material Bind Group ${material.id}`,
                layout: this.materialBindGroupLayout!,
                entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
            });

            this.materialBufferCache.set(material.id, uniformBuffer);
            this.materialBindGroupCache.set(material.id, bindGroup);
            material.needsUpdate = false;
        }

        return bindGroup;
    }

    dispose(): void {
        // Clean up material buffers
        for (const buffer of this.materialBufferCache.values()) {
            buffer.destroy();
        }
        this.materialBufferCache.clear();
        this.materialBindGroupCache.clear();
        this.textureBindGroupCache.clear();
        this.simpleTextureBindGroupCache.clear();
    }
}
