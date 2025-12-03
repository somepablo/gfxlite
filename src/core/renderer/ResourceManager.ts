import type { Geometry } from "../geometry/Geometry";
import type { Material } from "../material/Material";
import type { Mesh } from "../object/Mesh";
import { Program } from "./Program";

export interface GeometryData {
    vertexBuffer: GPUBuffer;
    normalBuffer: GPUBuffer | null;
    indexBuffer: GPUBuffer | null;
}

export interface MaterialData {
    program: Program;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export interface MeshData {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

/**
 * Centralized resource management for GPU buffers, programs, and bind groups.
 * Handles caching and lifecycle management of rendering resources.
 */
export class ResourceManager {
    private device: GPUDevice;
    private sampleCount: number;

    private geometryCache = new Map<number, GeometryData>();
    private materialDataCache = new Map<number, MaterialData>();
    private programCache = new Map<string, Program>();
    private meshDataCache = new WeakMap<Mesh, MeshData>();

    constructor(device: GPUDevice, sampleCount: number = 1) {
        this.device = device;
        this.sampleCount = sampleCount;
    }

    getGeometryData(geometry: Geometry): GeometryData {
        if (this.geometryCache.has(geometry.id)) {
            return this.geometryCache.get(geometry.id)!;
        }

        const vertexBuffer = this.device.createBuffer({
            label: `Vertex Buffer for Geometry ${geometry.id}`,
            size: geometry.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices as GPUAllowSharedBufferSource);

        let normalBuffer: GPUBuffer | null = null;
        if (geometry.normals) {
            normalBuffer = this.device.createBuffer({
                label: `Normal Buffer for Geometry ${geometry.id}`,
                size: geometry.normals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, geometry.normals as GPUAllowSharedBufferSource);
        } else {
            const dummyNormals = new Float32Array(geometry.vertices.length);
            normalBuffer = this.device.createBuffer({
                label: `Dummy Normal Buffer for Geometry ${geometry.id}`,
                size: dummyNormals.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(normalBuffer, 0, dummyNormals);
        }

        let indexBuffer: GPUBuffer | null = null;
        if (geometry.indices) {
            indexBuffer = this.device.createBuffer({
                label: `Index Buffer for Geometry ${geometry.id}`,
                size: geometry.indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(indexBuffer, 0, geometry.indices as GPUAllowSharedBufferSource);
        }

        const data: GeometryData = { vertexBuffer, normalBuffer, indexBuffer };
        this.geometryCache.set(geometry.id, data);
        return data;
    }

    getMaterialData(material: Material): MaterialData {
        if (this.materialDataCache.has(material.id)) {
            return this.materialDataCache.get(material.id)!;
        }

        const vertexCode = material.getVertexShader();
        const fragmentCode = material.getFragmentShader();
        const cacheKey = vertexCode + fragmentCode;

        let program = this.programCache.get(cacheKey);
        if (!program) {
            program = new Program(this.device, {
                vertex: { code: vertexCode },
                fragment: { code: fragmentCode },
                multisample: { count: this.sampleCount },
            });
            this.programCache.set(cacheKey, program);
        }

        const uniformData = material.getUniformBufferData();
        const uniformBuffer = this.device.createBuffer({
            label: `Material Uniform Buffer for ${material.id}`,
            size: uniformData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as GPUAllowSharedBufferSource);

        const bindGroup = this.device.createBindGroup({
            layout: program.pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        const data = { program, uniformBuffer, bindGroup };
        this.materialDataCache.set(material.id, data);
        return data;
    }

    getMeshData(mesh: Mesh, pipeline: GPURenderPipeline): MeshData {
        let meshData = this.meshDataCache.get(mesh);
        if (!meshData) {
            const uniformBuffer = this.device.createBuffer({
                label: `MVP Buffer for Mesh ${mesh.id}`,
                size: 52 * 4, // MVP (16) + Model (16) + Normal (16) + CameraPos (4)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroup = this.device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
            });

            meshData = { uniformBuffer, bindGroup };
            this.meshDataCache.set(mesh, meshData);
        }
        return meshData;
    }

    updateMaterialUniforms(material: Material): void {
        if (material.needsUpdate) {
            const materialData = this.materialDataCache.get(material.id);
            if (materialData) {
                this.device.queue.writeBuffer(
                    materialData.uniformBuffer,
                    0,
                    material.getUniformBufferData() as GPUAllowSharedBufferSource
                );
                material.needsUpdate = false;
            }
        }
    }

    getStats() {
        return {
            geometries: this.geometryCache.size,
            programs: this.programCache.size,
        };
    }

    dispose(): void {
        this.geometryCache.clear();
        this.materialDataCache.clear();
        this.programCache.clear();
        this.meshDataCache = new WeakMap();
    }
}
