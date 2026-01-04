import type { Mesh } from "../object/Mesh";
import type { Camera } from "../camera/Camera";
import type { Geometry } from "../geometry/Geometry";
import type { Material } from "../material/Material";
import type { DirectionalLight } from "../light/DirectionalLight";
import { Matrix4 } from "../../math";

// Constants
// Layout: Model (16) + Normal (16) + Flags (4) = 36 floats per instance
const INSTANCE_STRIDE = 36;
const MIN_BUFFER_SIZE = 1024 * 1024; // 1MB minimum allocation
const MAX_CAMERAS = 5; // 1 main + 4 shadow lights
const STORAGE_BUFFER_ALIGNMENT = 256; // WebGPU requires 256-byte alignment for buffer offsets

export interface DrawBatch {
	key: string;
	geometry: Geometry;
	material: Material;
	meshes: Mesh[];
	instanceOffset: number;
	instanceCount: number;
	boundingSphereRadius: number;

	// Aligned stride for culled buffer (256-byte aligned)
	culledStridePerCamera: number;

	// GPU resources (shared across all cameras)
	batchInfoBuffer: GPUBuffer;

	// Per-camera culling outputs
	indirectBuffer: GPUBuffer; // Array of 5 indirect args (main + 4 lights)
	culledInstanceBuffer: GPUBuffer; // Segmented: [main region | light0 | light1 | ...]

	// Bind groups
	renderBindGroup: GPUBindGroup | null;
	cullBindGroup: GPUBindGroup | null;
}

export interface BatchStats {
	totalBatches: number;
	totalInstances: number;
	drawCalls: number;
	instanceBufferSize: number;
}

export interface GeometryData {
	vertexBuffer: GPUBuffer;
	normalBuffer: GPUBuffer | null;
	uvBuffer: GPUBuffer | null;
	tangentBuffer: GPUBuffer | null;
	indexBuffer: GPUBuffer | null;
	version: number;
}

export class BatchManager {
	private device: GPUDevice;

	// Global instance storage buffer
	private instanceBuffer: GPUBuffer | null = null;
	private instanceBufferCapacity: number = 0;

	// Reusable CPU arrays
	private instanceDataArray: Float32Array | null = null;

	// Batch cache (by geometry+material key)
	private batchCache = new Map<string, DrawBatch>();

	// Geometry buffer cache
	private geometryCache = new Map<number, GeometryData>();

	// Current frame data
	private batches: DrawBatch[] = [];
	private totalInstances: number = 0;

	// Unified camera buffer (main + shadow lights)
	private cameraBuffer: GPUBuffer | null = null;
	private cameraBindGroup: GPUBindGroup | null = null;
	private cameraBindGroupLayout: GPUBindGroupLayout | null = null;

	// Culling bind group layout
	private cullBindGroupLayout: GPUBindGroupLayout | null = null;

	// Render bind group layout
	private renderBindGroupLayout: GPUBindGroupLayout | null = null;

	// Temp matrix for normal matrix computation
	private _tempMatrix = new Matrix4();

	// Reusable buffer for batch info (16 bytes)
	// Layout: instanceOffset (u32), instanceCount (u32), boundingSphereRadius (f32), culledStridePerCamera (u32)
	private _batchInfoBuffer = new ArrayBuffer(16);
	private _batchInfoU32 = new Uint32Array(this._batchInfoBuffer);
	private _batchInfoF32 = new Float32Array(this._batchInfoBuffer);

	// Reusable buffer for camera uniforms
	// Layout per camera: VP (16) + frustum (24) = 40 floats
	// Total: 40 * 5 cameras + header (4 floats for counts) = 204 floats, round to 208
	private _cameraUniformData = new Float32Array(208);

	// Track active shadow lights for current frame
	private activeShadowLightCount: number = 0;

	constructor(device: GPUDevice) {
		this.device = device;
		this.initBindGroupLayouts();
		this.initCameraResources();
	}

	private initBindGroupLayouts(): void {
		// Camera bind group layout (group 0 for culling)
		this.cameraBindGroupLayout = this.device.createBindGroupLayout({
			label: "Unified Camera Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
					buffer: { type: "uniform" },
				},
			],
		});

		// Culling bind group layout (group 1 for culling)
		this.cullBindGroupLayout = this.device.createBindGroupLayout({
			label: "Unified Cull Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "read-only-storage" }, // instances
				},
				{
					binding: 1,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" }, // culled instances (segmented)
				},
				{
					binding: 2,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "storage" }, // indirect args array
				},
				{
					binding: 3,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: "uniform" }, // batch info
				},
			],
		});

		// Render bind group layout (group 0 for render pass)
		this.renderBindGroupLayout = this.device.createBindGroupLayout({
			label: "Instance Render Bind Group Layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "read-only-storage" }, // instances
				},
				{
					binding: 1,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "read-only-storage" }, // culled indices
				},
				{
					binding: 2,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: "uniform" }, // camera uniforms (for VP matrix)
				},
			],
		});
	}

	private initCameraResources(): void {
		// Create unified camera buffer
		// Header: mainVP(16) + activeLightCount(1) + padding(3) = 20 floats
		// Per camera: VP(16) + frustum(24) = 40 floats
		// Total: 20 + 40*5 = 220 floats = 880 bytes, round to 896 for alignment
		this.cameraBuffer = this.device.createBuffer({
			label: "Unified Camera Buffer",
			size: 896,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		this.cameraBindGroup = this.device.createBindGroup({
			label: "Unified Camera Bind Group",
			layout: this.cameraBindGroupLayout!,
			entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
		});
	}

	getCameraBindGroupLayout(): GPUBindGroupLayout {
		return this.cameraBindGroupLayout!;
	}

	getCullBindGroupLayout(): GPUBindGroupLayout {
		return this.cullBindGroupLayout!;
	}

	getRenderBindGroupLayout(): GPUBindGroupLayout {
		return this.renderBindGroupLayout!;
	}

	getCameraBindGroup(): GPUBindGroup | null {
		return this.cameraBindGroup;
	}

	getCameraBuffer(): GPUBuffer | null {
		return this.cameraBuffer;
	}

	getActiveShadowLightCount(): number {
		return this.activeShadowLightCount;
	}

	getGeometryData(geometry: Geometry): GeometryData {
		const cached = this.geometryCache.get(geometry.id);

		// Check if we have cached data and it's still valid
		if (cached && cached.version === geometry.version) {
			return cached;
		}

		// If cached but version changed, we need to re-upload data to existing buffers
		// or recreate if sizes changed
		if (cached) {
			return this.updateGeometryBuffers(geometry, cached);
		}

		// Create new buffers
		return this.createGeometryBuffers(geometry);
	}

	private createGeometryBuffers(geometry: Geometry): GeometryData {
		const vertexBuffer = this.device.createBuffer({
			label: `Vertex Buffer for Geometry ${geometry.id}`,
			size: geometry.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(
			vertexBuffer,
			0,
			geometry.vertices as GPUAllowSharedBufferSource,
		);

		let normalBuffer: GPUBuffer | null = null;
		if (geometry.normals) {
			normalBuffer = this.device.createBuffer({
				label: `Normal Buffer for Geometry ${geometry.id}`,
				size: geometry.normals.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(
				normalBuffer,
				0,
				geometry.normals as GPUAllowSharedBufferSource,
			);
		} else {
			const dummyNormals = new Float32Array(geometry.vertices.length);
			normalBuffer = this.device.createBuffer({
				label: `Dummy Normal Buffer for Geometry ${geometry.id}`,
				size: dummyNormals.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(normalBuffer, 0, dummyNormals);
		}

		let uvBuffer: GPUBuffer | null = null;
		if (geometry.uvs) {
			uvBuffer = this.device.createBuffer({
				label: `UV Buffer for Geometry ${geometry.id}`,
				size: geometry.uvs.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(
				uvBuffer,
				0,
				geometry.uvs as GPUAllowSharedBufferSource,
			);
		}

		let tangentBuffer: GPUBuffer | null = null;
		if (geometry.tangents) {
			tangentBuffer = this.device.createBuffer({
				label: `Tangent Buffer for Geometry ${geometry.id}`,
				size: geometry.tangents.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(
				tangentBuffer,
				0,
				geometry.tangents as GPUAllowSharedBufferSource,
			);
		} else {
			// Dummy tangents (vec4)
			const dummyTangents = new Float32Array(
				(geometry.vertices.length / 3) * 4,
			); // 4 components per vertex
			tangentBuffer = this.device.createBuffer({
				label: `Dummy Tangent Buffer for Geometry ${geometry.id}`,
				size: dummyTangents.byteLength,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(tangentBuffer, 0, dummyTangents);
		}

		let indexBuffer: GPUBuffer | null = null;
		if (geometry.indices) {
			indexBuffer = this.device.createBuffer({
				label: `Index Buffer for Geometry ${geometry.id}`,
				size: geometry.indices.byteLength,
				usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
			});
			this.device.queue.writeBuffer(
				indexBuffer,
				0,
				geometry.indices as GPUAllowSharedBufferSource,
			);
		}

		const data: GeometryData = {
			vertexBuffer,
			normalBuffer,
			uvBuffer,
			tangentBuffer,
			indexBuffer,
			version: geometry.version,
		};
		this.geometryCache.set(geometry.id, data);
		return data;
	}

	private updateGeometryBuffers(
		geometry: Geometry,
		cached: GeometryData,
	): GeometryData {
		// Check if sizes changed - if so, need to recreate buffers
		const vertexSizeChanged =
			cached.vertexBuffer.size !== geometry.vertices.byteLength;
		const indexSizeChanged =
			cached.indexBuffer &&
			geometry.indices &&
			cached.indexBuffer.size !== geometry.indices.byteLength;

		if (vertexSizeChanged || indexSizeChanged) {
			// Sizes changed, destroy old buffers and recreate
			cached.vertexBuffer.destroy();
			cached.normalBuffer?.destroy();
			cached.uvBuffer?.destroy();
			cached.tangentBuffer?.destroy();
			cached.indexBuffer?.destroy();
			this.geometryCache.delete(geometry.id);
			return this.createGeometryBuffers(geometry);
		}

		// Sizes match, just re-upload data
		this.device.queue.writeBuffer(
			cached.vertexBuffer,
			0,
			geometry.vertices as GPUAllowSharedBufferSource,
		);

		if (cached.normalBuffer && geometry.normals) {
			this.device.queue.writeBuffer(
				cached.normalBuffer,
				0,
				geometry.normals as GPUAllowSharedBufferSource,
			);
		}

		if (cached.uvBuffer && geometry.uvs) {
			this.device.queue.writeBuffer(
				cached.uvBuffer,
				0,
				geometry.uvs as GPUAllowSharedBufferSource,
			);
		}

		if (cached.tangentBuffer && geometry.tangents) {
			this.device.queue.writeBuffer(
				cached.tangentBuffer,
				0,
				geometry.tangents as GPUAllowSharedBufferSource,
			);
		}

		if (cached.indexBuffer && geometry.indices) {
			this.device.queue.writeBuffer(
				cached.indexBuffer,
				0,
				geometry.indices as GPUAllowSharedBufferSource,
			);
		}

		// Update cached version
		cached.version = geometry.version;
		return cached;
	}

	private getBatchKey(mesh: Mesh): string {
		return `${mesh.geometry.id}_${mesh.material.id}`;
	}

	private computeBoundingSphereRadius(geometry: Geometry): number {
		const bbox = geometry.boundingBox;
		if (!bbox) return 1.0;

		const dx = bbox.max.x - bbox.min.x;
		const dy = bbox.max.y - bbox.min.y;
		const dz = bbox.max.z - bbox.min.z;

		return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
	}

	prepareBatches(meshes: Mesh[]): DrawBatch[] {
		const batchMap = new Map<string, Mesh[]>();

		// Group meshes by geometry+material
		for (const mesh of meshes) {
			const key = this.getBatchKey(mesh);
			if (!batchMap.has(key)) {
				batchMap.set(key, []);
			}
			batchMap.get(key)!.push(mesh);
		}

		this.batches = [];
		this.totalInstances = 0;

		for (const [key, batchMeshes] of batchMap) {
			let batch = this.batchCache.get(key);

			if (!batch) {
				batch = this.createBatch(
					key,
					batchMeshes[0].geometry,
					batchMeshes[0].material,
				);
				this.batchCache.set(key, batch);
			}

			batch.meshes = batchMeshes;
			batch.instanceOffset = this.totalInstances;
			batch.instanceCount = batchMeshes.length;

			// Ensure GPU resources are sized correctly
			this.ensureBatchResources(batch);

			this.batches.push(batch);
			this.totalInstances += batchMeshes.length;
		}

		return this.batches;
	}

	private createBatch(
		key: string,
		geometry: Geometry,
		material: Material,
	): DrawBatch {
		const indexCount = geometry.indexCount;
		const boundingSphereRadius = this.computeBoundingSphereRadius(geometry);

		// Create indirect args buffer (5 cameras × 5 u32 = 100 bytes)
		const indirectBuffer = this.device.createBuffer({
			label: `Indirect Args Buffer [${key}]`,
			size: 20 * MAX_CAMERAS,
			usage:
				GPUBufferUsage.INDIRECT |
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});

		// Initialize indirect args for all cameras
		const indirectArgs = new Uint32Array(indirectBuffer.getMappedRange());
		for (let i = 0; i < MAX_CAMERAS; i++) {
			const offset = i * 5;
			indirectArgs[offset + 0] = indexCount; // indexCount
			indirectArgs[offset + 1] = 0; // instanceCount (written by compute)
			indirectArgs[offset + 2] = 0; // firstIndex
			indirectArgs[offset + 3] = 0; // baseVertex
			indirectArgs[offset + 4] = 0; // firstInstance
		}
		indirectBuffer.unmap();

		// Create batch info buffer (16 bytes)
		const batchInfoBuffer = this.device.createBuffer({
			label: `Batch Info Buffer [${key}]`,
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// Culled instance buffer: segmented for all cameras
		// Each camera region needs 256-byte alignment
		const initialCapacity = 1024;
		// Round up to 256-byte boundary (64 u32s)
		const alignedCapacity =
			Math.ceil((initialCapacity * 4) / STORAGE_BUFFER_ALIGNMENT) *
			STORAGE_BUFFER_ALIGNMENT;
		const culledInstanceBuffer = this.device.createBuffer({
			label: `Culled Instance Buffer [${key}]`,
			size: alignedCapacity * MAX_CAMERAS,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});

		return {
			key,
			geometry,
			material,
			meshes: [],
			instanceOffset: 0,
			instanceCount: 0,
			boundingSphereRadius,
			culledStridePerCamera: alignedCapacity,
			indirectBuffer,
			culledInstanceBuffer,
			batchInfoBuffer,
			renderBindGroup: null,
			cullBindGroup: null,
		};
	}

	private ensureBatchResources(batch: DrawBatch): void {
		// Each camera region needs 256-byte alignment
		const bytesPerCamera = batch.instanceCount * 4;
		const alignedBytesPerCamera =
			Math.ceil(bytesPerCamera / STORAGE_BUFFER_ALIGNMENT) *
			STORAGE_BUFFER_ALIGNMENT;
		const requiredCulledSize = alignedBytesPerCamera * MAX_CAMERAS;

		if (batch.culledInstanceBuffer.size < requiredCulledSize) {
			batch.culledInstanceBuffer.destroy();

			// Double the aligned size for growth
			const newAlignedBytesPerCamera =
				Math.ceil((bytesPerCamera * 2) / STORAGE_BUFFER_ALIGNMENT) *
				STORAGE_BUFFER_ALIGNMENT;
			const newSize = Math.max(
				newAlignedBytesPerCamera * MAX_CAMERAS,
				STORAGE_BUFFER_ALIGNMENT * MAX_CAMERAS,
			);

			batch.culledInstanceBuffer = this.device.createBuffer({
				label: `Culled Instance Buffer [${batch.key}]`,
				size: newSize,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			});

			batch.culledStridePerCamera = newAlignedBytesPerCamera;

			// Invalidate bind groups
			batch.cullBindGroup = null;
			batch.renderBindGroup = null;
		} else {
			// Update stride even if buffer didn't resize
			batch.culledStridePerCamera = alignedBytesPerCamera;
		}
	}

	private ensureInstanceBufferCapacity(requiredInstances: number): void {
		const requiredSize = requiredInstances * INSTANCE_STRIDE * 4;

		if (!this.instanceBuffer || this.instanceBufferCapacity < requiredSize) {
			if (this.instanceBuffer) {
				this.instanceBuffer.destroy();
			}

			this.instanceBufferCapacity = Math.max(requiredSize * 2, MIN_BUFFER_SIZE);

			this.instanceBuffer = this.device.createBuffer({
				label: "Instance Storage Buffer",
				size: this.instanceBufferCapacity,
				usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			});

			// Invalidate all batch bind groups since instance buffer changed
			for (const batch of this.batchCache.values()) {
				batch.cullBindGroup = null;
				batch.renderBindGroup = null;
			}
		}

		// Ensure CPU array is large enough
		const requiredArrayLength = requiredInstances * INSTANCE_STRIDE;
		if (
			!this.instanceDataArray ||
			this.instanceDataArray.length < requiredArrayLength
		) {
			this.instanceDataArray = new Float32Array(requiredArrayLength * 2);
		}
	}

	updateInstanceBuffer(batches: DrawBatch[]): void {
		if (this.totalInstances === 0) return;

		this.ensureInstanceBufferCapacity(this.totalInstances);

		const data = this.instanceDataArray!;
		let offset = 0;

		for (const batch of batches) {
			for (const mesh of batch.meshes) {
				// Model matrix (world matrix)
				const modelMatrix = mesh.worldMatrix;
				data.set(modelMatrix.toArray(), offset);
				offset += 16;

				// Normal matrix: (inverse(model))^T
				const normalMatrix = this._tempMatrix
					.copy(modelMatrix)
					.invert()
					.transpose();
				data.set(normalMatrix.toArray(), offset);
				offset += 16;

				// Flags: receiveShadow, castShadow, padding, padding
				data[offset++] = mesh.receiveShadow ? 1.0 : 0.0;
				data[offset++] = mesh.castShadow ? 1.0 : 0.0;
				data[offset++] = 0.0; // padding
				data[offset++] = 0.0; // padding
			}

			// Update batch info buffer
			// Layout: instanceOffset (u32), instanceCount (u32), boundingSphereRadius (f32), culledStridePerCamera (u32)
			this._batchInfoU32[0] = batch.instanceOffset;
			this._batchInfoU32[1] = batch.instanceCount;
			this._batchInfoF32[2] = batch.boundingSphereRadius;
			// culledStridePerCamera is in bytes, convert to u32 count
			this._batchInfoU32[3] = batch.culledStridePerCamera / 4;
			this.device.queue.writeBuffer(
				batch.batchInfoBuffer,
				0,
				this._batchInfoBuffer,
			);
		}

		// Write all instance data to GPU
		this.device.queue.writeBuffer(
			this.instanceBuffer!,
			0,
			data as GPUAllowSharedBufferSource,
			0,
			this.totalInstances * INSTANCE_STRIDE,
		);
	}

	updateCameraUniforms(camera: Camera, shadowLights: DirectionalLight[]): void {
		if (!this.cameraBuffer) return;

		const data = this._cameraUniformData;
		data.fill(0);

		// Header section (first 20 floats)
		// Layout: mainViewProjection (16) + cameraPosition (3) + activeLightCount (1) = 20 floats

		// Main camera VP matrix (precomputed on camera)
		data.set(camera.viewProjectionMatrix.elements, 0);

		// Camera position (for fragment shader lighting)
		data[16] = camera.position.x;
		data[17] = camera.position.y;
		data[18] = camera.position.z;

		// Active light count
		const activeLights = Math.min(shadowLights.length, MAX_CAMERAS - 1);
		this.activeShadowLightCount = activeLights;
		new Uint32Array(data.buffer, 19 * 4, 1)[0] = activeLights;

		// Per-camera data starts at offset 20
		// Each CameraData: VP (16) + frustum (24) = 40 floats
		// Camera 0 = main camera
		// Camera 1-4 = shadow lights

		let cameraOffset = 20;

		// Main camera (camera 0): VP + frustum (use precomputed values)
		data.set(camera.viewProjectionMatrix.elements, cameraOffset);
		data.set(camera.frustumPlanes, cameraOffset + 16);
		cameraOffset += 40;

		// Shadow light cameras (cameras 1-4) - use precomputed values from shadow cameras
		for (let i = 0; i < activeLights; i++) {
			const light = shadowLights[i];
			if (light.castShadow && light.shadow.camera) {
				const shadowCam = light.shadow.camera;
				// Write light VP (precomputed on shadow camera)
				data.set(shadowCam.viewProjectionMatrix.elements, cameraOffset);
				// Write light frustum planes (precomputed on shadow camera)
				data.set(shadowCam.frustumPlanes, cameraOffset + 16);
			}
			cameraOffset += 40;
		}

		this.device.queue.writeBuffer(this.cameraBuffer, 0, data);
	}

	getCullBindGroup(batch: DrawBatch): GPUBindGroup {
		if (!batch.cullBindGroup) {
			batch.cullBindGroup = this.device.createBindGroup({
				label: `Cull Bind Group [${batch.key}]`,
				layout: this.cullBindGroupLayout!,
				entries: [
					{ binding: 0, resource: { buffer: this.instanceBuffer! } },
					{ binding: 1, resource: { buffer: batch.culledInstanceBuffer } },
					{ binding: 2, resource: { buffer: batch.indirectBuffer } },
					{ binding: 3, resource: { buffer: batch.batchInfoBuffer } },
				],
			});
		}
		return batch.cullBindGroup;
	}

	getRenderBindGroup(batch: DrawBatch, cameraIndex: number): GPUBindGroup {
		// Calculate offset into culled buffer for this camera (256-byte aligned)
		const culledOffset = cameraIndex * batch.culledStridePerCamera;
		// Size should be the minimum of actual instances needed or the stride
		const culledSize = Math.min(
			batch.instanceCount * 4,
			batch.culledStridePerCamera,
		);

		// For camera 0, we can cache the bind group
		if (cameraIndex === 0) {
			if (!batch.renderBindGroup) {
				batch.renderBindGroup = this.device.createBindGroup({
					label: `Render Bind Group [${batch.key}] Camera 0`,
					layout: this.renderBindGroupLayout!,
					entries: [
						{ binding: 0, resource: { buffer: this.instanceBuffer! } },
						{
							binding: 1,
							resource: {
								buffer: batch.culledInstanceBuffer,
								offset: 0,
								size: culledSize,
							},
						},
						{ binding: 2, resource: { buffer: this.cameraBuffer! } },
					],
				});
			}
			return batch.renderBindGroup;
		}

		// For other cameras, create bind group on demand
		return this.device.createBindGroup({
			label: `Render Bind Group [${batch.key}] Camera ${cameraIndex}`,
			layout: this.renderBindGroupLayout!,
			entries: [
				{ binding: 0, resource: { buffer: this.instanceBuffer! } },
				{
					binding: 1,
					resource: {
						buffer: batch.culledInstanceBuffer,
						offset: culledOffset,
						size: culledSize,
					},
				},
				{ binding: 2, resource: { buffer: this.cameraBuffer! } },
			],
		});
	}

	getIndirectBufferOffset(cameraIndex: number): number {
		return cameraIndex * 20; // 5 u32s × 4 bytes = 20 bytes per camera
	}

	getBatches(): DrawBatch[] {
		return this.batches;
	}

	getTotalInstances(): number {
		return this.totalInstances;
	}

	getStats(): BatchStats {
		return {
			totalBatches: this.batches.length,
			totalInstances: this.totalInstances,
			drawCalls: this.batches.length,
			instanceBufferSize: this.instanceBufferCapacity,
		};
	}

	dispose(): void {
		if (this.instanceBuffer) {
			this.instanceBuffer.destroy();
			this.instanceBuffer = null;
		}

		if (this.cameraBuffer) {
			this.cameraBuffer.destroy();
			this.cameraBuffer = null;
		}

		for (const batch of this.batchCache.values()) {
			batch.indirectBuffer.destroy();
			batch.culledInstanceBuffer.destroy();
			batch.batchInfoBuffer.destroy();
		}

		this.batchCache.clear();
		this.geometryCache.clear();
		this.batches = [];
		this.totalInstances = 0;
	}
}
