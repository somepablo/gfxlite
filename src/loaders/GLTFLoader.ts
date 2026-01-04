import {
	type GLTF,
	type GLTFMesh,
	type GLTFAccessor,
	GLTFConstants,
} from "./GLTFInterfaces";
import { Object3D } from "../core/object/Object3D";
import { Mesh } from "../core/object/Mesh";
import { Geometry } from "../core/geometry/Geometry";
import { StandardMaterial } from "../core/material/StandardMaterial";
import { Texture } from "../core/material/Texture";
import { Vector3 } from "../math";

export class GLTFLoader {
	private json: GLTF | null = null;
	private bufferData: Map<number, ArrayBuffer> = new Map();
	private textures: Map<number, Texture> = new Map();
	private materials: Map<number, StandardMaterial> = new Map();
	private meshes: Map<number, Object3D> = new Map(); // Meshes can be shared, but in Scene graph they are nodes.
	// However, a GLTF mesh is a definition. A Node INSTANTIATES a mesh.
	// So we need to store geometries and materials, but Meshes (Nodes) are unique per node.
	// Actually, GLTF Mesh is a collection of Primitives.

	private geometries: Map<number, Geometry[]> = new Map(); // mesh index -> Array of Geometries (primitives)

	private baseURL: string = "";

	async load(url: string): Promise<Object3D> {
		this.baseURL = url.substring(0, url.lastIndexOf("/") + 1);

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to load GLTF file: ${url}`);
		}

		const buffer = await response.arrayBuffer();

		// Check for GLB magic number
		const magic = new DataView(buffer, 0, 4).getUint32(0, true);
		if (magic === 0x46546c67) {
			// 'glTF'
			return this.parseGLB(buffer);
		} else {
			// Assume JSON
			const text = new TextDecoder().decode(buffer);
			const json = JSON.parse(text);
			return this.parse(json);
		}
	}

	private async parseGLB(buffer: ArrayBuffer): Promise<Object3D> {
		const dataView = new DataView(buffer);
		// const version = dataView.getUint32(4, true); // Should be 2
		const length = dataView.getUint32(8, true);

		let json: GLTF | null = null;
		let binaryBuffer: ArrayBuffer | null = null;

		let offset = 12;
		while (offset < length) {
			const chunkLength = dataView.getUint32(offset, true);
			const chunkType = dataView.getUint32(offset + 4, true);
			offset += 8;

			if (chunkType === 0x4e4f534a) {
				// JSON
				const jsonChunk = new Uint8Array(buffer, offset, chunkLength);
				const jsonText = new TextDecoder().decode(jsonChunk);
				json = JSON.parse(jsonText);
			} else if (chunkType === 0x004e4942) {
				// BIN
				binaryBuffer = buffer.slice(offset, offset + chunkLength);
			}

			offset += chunkLength;
		}

		if (!json) throw new Error("GLB missing JSON chunk");

		// If we have a binary buffer, it corresponds to buffer index 0 if undefined uri
		this.json = json;
		this.bufferData.clear();
		this.textures.clear();
		this.materials.clear();
		this.geometries.clear();
		this.meshes.clear();

		if (binaryBuffer) {
			this.bufferData.set(0, binaryBuffer);
		}

		// Temporarily override loadBuffers to skip loading buffer 0 if it's already set?
		// Actually loadBuffers checks for uri. If uri is undefined, it errors currently.
		// We need to support undefined uri for GLB buffer 0.

		return this.parse(json, true);
	}

	async parse(json: GLTF, isGLB: boolean = false): Promise<Object3D> {
		this.json = json;
		if (!isGLB) {
			this.bufferData.clear();
			this.textures.clear();
			this.materials.clear();
			this.geometries.clear();
			this.meshes.clear();
		}

		// 1. Load Buffers
		await this.loadBuffers();

		// 2. Load Images & Textures
		await this.loadTextures();

		// 3. Load Materials
		this.loadMaterials();

		// 4. Load Meshes (Geometries)
		this.loadMeshes();

		// 5. Build Scene Graph
		const scene = this.buildScene();

		return scene;
	}

	private async loadBuffers() {
		if (!this.json?.buffers) return;

		const promises = this.json.buffers.map(async (buffer, index) => {
			let bufferUrl = buffer.uri;
			if (!bufferUrl) {
				// If existing buffer data (from GLB) exists for this index, valid.
				if (this.bufferData.has(index)) return;
				throw new Error("Embedded buffers (GLB) not found or supported.");
			}

			// Handle data URI
			if (bufferUrl.startsWith("data:")) {
				const response = await fetch(bufferUrl);
				const arrayBuffer = await response.arrayBuffer();
				this.bufferData.set(index, arrayBuffer);
				return;
			}

			// Handle relative URL
			bufferUrl = this.resolveURL(bufferUrl);
			const response = await fetch(bufferUrl);
			if (!response.ok) {
				throw new Error(`Failed to load buffer: ${bufferUrl}`);
			}
			const arrayBuffer = await response.arrayBuffer();
			this.bufferData.set(index, arrayBuffer);
		});

		await Promise.all(promises);
	}

	private resolveURL(url: string): string {
		if (url.startsWith("http") || url.startsWith("data:")) {
			return url;
		}
		return this.baseURL + url;
	}

	private async loadTextures() {
		if (!this.json?.textures) return;

		const imagePromises = (this.json.images || []).map(async (img, index) => {
			let source: ImageBitmap;
			if (img.uri) {
				const url = this.resolveURL(img.uri);
				const response = await fetch(url);
				const blob = await response.blob();
				source = await createImageBitmap(blob);
			} else if (img.bufferView !== undefined) {
				const bufferView = this.json!.bufferViews![img.bufferView];
				const buffer = this.bufferData.get(bufferView.buffer);
				if (!buffer)
					throw new Error(
						`Buffer ${bufferView.buffer} not found for image ${index}`,
					);

				const blob = new Blob(
					[
						new Uint8Array(
							buffer,
							bufferView.byteOffset || 0,
							bufferView.byteLength,
						),
					],
					{ type: img.mimeType },
				);
				source = await createImageBitmap(blob);
			} else {
				throw new Error(`Image ${index} has no uri or bufferView`);
			}
			return { index, source };
		});

		const loadedImages = await Promise.all(imagePromises);
		const imageMap = new Map<number, ImageBitmap>();
		loadedImages.forEach(({ index, source }) => {
			imageMap.set(index, source);
		});

		// Create Textures
		this.json.textures.forEach((tex, index) => {
			if (tex.source === undefined) return;
			const image = imageMap.get(tex.source);
			if (!image) return;

			const sampler =
				tex.sampler !== undefined && this.json!.samplers
					? this.json!.samplers[tex.sampler]
					: {};

			const texture = new Texture(image, {
				wrapS: this.convertWrapMode(sampler.wrapS),
				wrapT: this.convertWrapMode(sampler.wrapT),
				minFilter: this.convertMinFilter(sampler.minFilter),
				magFilter: this.convertMagFilter(sampler.magFilter),
				flipY: false,
			});

			this.textures.set(index, texture);
		});
	}

	private convertWrapMode(mode?: number): GPUAddressMode {
		switch (mode) {
			case GLTFConstants.CLAMP_TO_EDGE:
				return "clamp-to-edge";
			case GLTFConstants.MIRRORED_REPEAT:
				return "mirror-repeat";
			case GLTFConstants.REPEAT:
				return "repeat";
			default:
				return "repeat";
		}
	}

	private convertMinFilter(filter?: number): GPUFilterMode {
		// Simple mapping, might need more detail for mipmaps
		switch (filter) {
			case GLTFConstants.NEAREST:
			case GLTFConstants.NEAREST_MIPMAP_NEAREST:
			case GLTFConstants.NEAREST_MIPMAP_LINEAR:
				return "nearest";
			case GLTFConstants.LINEAR:
			case GLTFConstants.LINEAR_MIPMAP_NEAREST:
			case GLTFConstants.LINEAR_MIPMAP_LINEAR:
				return "linear";
			default:
				return "linear";
		}
	}

	private convertMagFilter(filter?: number): GPUFilterMode {
		switch (filter) {
			case GLTFConstants.NEAREST:
				return "nearest";
			case GLTFConstants.LINEAR:
				return "linear";
			default:
				return "linear";
		}
	}

	private loadMaterials() {
		if (!this.json?.materials) return;

		this.json.materials.forEach((mat, index) => {
			const material = new StandardMaterial({
				baseColor: mat.pbrMetallicRoughness?.baseColorFactor
					? new Vector3(
							mat.pbrMetallicRoughness.baseColorFactor[0],
							mat.pbrMetallicRoughness.baseColorFactor[1],
							mat.pbrMetallicRoughness.baseColorFactor[2],
						)
					: new Vector3(1, 1, 1),
				opacity: mat.pbrMetallicRoughness?.baseColorFactor
					? mat.pbrMetallicRoughness.baseColorFactor[3]
					: 1.0,
				metallic: mat.pbrMetallicRoughness?.metallicFactor ?? 1.0,
				roughness: mat.pbrMetallicRoughness?.roughnessFactor ?? 1.0,
				emissive: mat.emissiveFactor
					? new Vector3(
							mat.emissiveFactor[0],
							mat.emissiveFactor[1],
							mat.emissiveFactor[2],
						)
					: new Vector3(0, 0, 0),
				emissiveFactor: 1.0, // GLTF emissive factor is multiplied into the color, but our material splits them.
				// Actually in GLTF emissiveFactor IS the color. brightness is usually 1.
				// Our StandardMaterial uses emissive (color) and emissiveFactor (intensity).
				// We'll map GLTF emissiveFactor to material.emissive and set material.emissiveFactor to 1.

				doubleSided: mat.doubleSided ?? false,
				alphaCutoff: mat.alphaCutoff ?? 0.5,
				// GLTF alphaMode: "OPAQUE" (default), "MASK", "BLEND"
				blendMode:
					mat.alphaMode === "BLEND" ? 1 : mat.alphaMode === "MASK" ? 2 : 0,
				transparent: mat.alphaMode === "BLEND",
			});

			// Textures
			if (mat.pbrMetallicRoughness?.baseColorTexture) {
				material.baseColorMap =
					this.textures.get(mat.pbrMetallicRoughness.baseColorTexture.index) ||
					null;
			}
			if (mat.pbrMetallicRoughness?.metallicRoughnessTexture) {
				material.metallicRoughnessMap =
					this.textures.get(
						mat.pbrMetallicRoughness.metallicRoughnessTexture.index,
					) || null;
			}
			if (mat.normalTexture) {
				material.normalMap = this.textures.get(mat.normalTexture.index) || null;
				material.uniforms.normalScale = mat.normalTexture.scale ?? 1.0;
			}
			if (mat.emissiveTexture) {
				material.emissiveMap =
					this.textures.get(mat.emissiveTexture.index) || null;
			}
			if (mat.occlusionTexture) {
				material.aoMap = this.textures.get(mat.occlusionTexture.index) || null;
				material.uniforms.occlusionStrength =
					mat.occlusionTexture.strength ?? 1.0;
			}

			this.materials.set(index, material);
		});
	}

	private loadMeshes() {
		if (!this.json?.meshes) return;

		this.json.meshes.forEach((meshDef, index) => {
			const geometries: Geometry[] = [];

			meshDef.primitives.forEach((prim) => {
				const attributes = prim.attributes;

				// Position (required)
				if (attributes.POSITION === undefined) return;
				const positionAccessor = this.getAccessor(attributes.POSITION);
				const positions = this.getAccessorData(
					positionAccessor,
				) as Float32Array;

				// Normals
				let normals: Float32Array | undefined;
				if (attributes.NORMAL !== undefined) {
					const normalAccessor = this.getAccessor(attributes.NORMAL);
					normals = this.getAccessorData(normalAccessor) as Float32Array;
				}

				// UVs
				let uvs: Float32Array | undefined;
				if (attributes.TEXCOORD_0 !== undefined) {
					const uvAccessor = this.getAccessor(attributes.TEXCOORD_0);
					uvs = this.getAccessorData(uvAccessor) as Float32Array;
				}

				// Indices
				let indices: Uint32Array | undefined;
				if (prim.indices !== undefined) {
					const indexAccessor = this.getAccessor(prim.indices);
					const indexData = this.getAccessorData(indexAccessor);
					if (indexData instanceof Uint32Array) {
						indices = indexData;
					} else {
						// Convert to Uint32Array if it's Uint16
						indices = new Uint32Array(indexData);
					}
				}

				// Tangents
				let tangents: Float32Array | undefined;
				if (attributes.TANGENT !== undefined) {
					const tangentAccessor = this.getAccessor(attributes.TANGENT);
					tangents = this.getAccessorData(tangentAccessor) as Float32Array;
				}

				const geometry = new Geometry(
					positions,
					indices,
					normals,
					uvs,
					tangents,
				);
				geometries.push(geometry);
			});

			this.geometries.set(index, geometries);
		});
	}

	private getAccessor(index: number): GLTFAccessor {
		return this.json!.accessors![index];
	}

	private getAccessorData(accessor: GLTFAccessor): TypedArray {
		const bufferView = this.json!.bufferViews![accessor.bufferView!];
		const buffer = this.bufferData.get(bufferView.buffer);
		if (!buffer) throw new Error(`Buffer ${bufferView.buffer} not found`);

		const byteOffset =
			(bufferView.byteOffset || 0) + (accessor.byteOffset || 0);

		// Assume tightly packed for now or handle stride if needed.
		// GLTF buffers are usually tightly packed for simple attributes.
		// But stride can be present in bufferView.

		const componentType = accessor.componentType;
		const count = accessor.count;
		const numComponents = this.getNumComponents(accessor.type);
		const totalElements = count * numComponents;

		// If byteStride is defined and not equal to element size, we need to interleave/de-interleave.
		// For now simplest case:

		const elementSize = this.getComponentSize(componentType) * numComponents;
		const stride = bufferView.byteStride || elementSize;

		if (stride === elementSize) {
			// Tightly packed
			return this.createTypedArray(
				buffer,
				byteOffset,
				totalElements,
				componentType,
			);
		} else {
			// Strided data - copy to new tightly packed array
			const componentSize = this.getComponentSize(componentType);
			const outputBuffer = new ArrayBuffer(totalElements * componentSize);
			const outputView = new DataView(outputBuffer);
			const inputView = new DataView(buffer, byteOffset, count * stride);

			for (let i = 0; i < count; i++) {
				const inputOffset = i * stride;
				const outputOffset = i * numComponents * componentSize;

				for (let c = 0; c < numComponents; c++) {
					const offsetVal = c * componentSize;
					switch (componentType) {
						case GLTFConstants.BYTE:
							outputView.setInt8(
								outputOffset + offsetVal,
								inputView.getInt8(inputOffset + offsetVal),
							);
							break;
						case GLTFConstants.UNSIGNED_BYTE:
							outputView.setUint8(
								outputOffset + offsetVal,
								inputView.getUint8(inputOffset + offsetVal),
							);
							break;
						case GLTFConstants.SHORT:
							outputView.setInt16(
								outputOffset + offsetVal,
								inputView.getInt16(inputOffset + offsetVal, true),
							);
							break;
						case GLTFConstants.UNSIGNED_SHORT:
							outputView.setUint16(
								outputOffset + offsetVal,
								inputView.getUint16(inputOffset + offsetVal, true),
							);
							break;
						case GLTFConstants.UNSIGNED_INT:
							outputView.setUint32(
								outputOffset + offsetVal,
								inputView.getUint32(inputOffset + offsetVal, true),
							);
							break;
						case GLTFConstants.FLOAT:
							outputView.setFloat32(
								outputOffset + offsetVal,
								inputView.getFloat32(inputOffset + offsetVal, true),
							);
							break;
					}
				}
			}

			return this.createTypedArray(
				outputBuffer,
				0,
				totalElements,
				componentType,
			);
		}
	}

	private getNumComponents(type: string): number {
		switch (type) {
			case "SCALAR":
				return 1;
			case "VEC2":
				return 2;
			case "VEC3":
				return 3;
			case "VEC4":
				return 4;
			case "MAT2":
				return 4;
			case "MAT3":
				return 9;
			case "MAT4":
				return 16;
			default:
				return 0;
		}
	}

	private getComponentSize(componentType: number): number {
		switch (componentType) {
			case GLTFConstants.BYTE:
				return 1;
			case GLTFConstants.UNSIGNED_BYTE:
				return 1;
			case GLTFConstants.SHORT:
				return 2;
			case GLTFConstants.UNSIGNED_SHORT:
				return 2;
			case GLTFConstants.UNSIGNED_INT:
				return 4;
			case GLTFConstants.FLOAT:
				return 4;
			default:
				return 0;
		}
	}

	private createTypedArray(
		buffer: ArrayBuffer,
		byteOffset: number,
		length: number,
		componentType: number,
	): TypedArray {
		switch (componentType) {
			case GLTFConstants.BYTE:
				return new Int8Array(buffer, byteOffset, length);
			case GLTFConstants.UNSIGNED_BYTE:
				return new Uint8Array(buffer, byteOffset, length);
			case GLTFConstants.SHORT:
				return new Int16Array(buffer, byteOffset, length);
			case GLTFConstants.UNSIGNED_SHORT:
				return new Uint16Array(buffer, byteOffset, length);
			case GLTFConstants.UNSIGNED_INT:
				return new Uint32Array(buffer, byteOffset, length);
			case GLTFConstants.FLOAT:
				return new Float32Array(buffer, byteOffset, length);
			default:
				throw new Error(`Unknown component type ${componentType}`);
		}
	}

	private buildScene(): Object3D {
		// Create root from Default Scene
		const sceneIndex = this.json?.scene ?? 0;
		const sceneDef = this.json?.scenes
			? this.json.scenes[sceneIndex]
			: undefined;

		const root = new Object3D();
		root.name = "GLTF Root";

		if (sceneDef && sceneDef.nodes) {
			sceneDef.nodes.forEach((nodeIndex) => {
				const node = this.parseNode(nodeIndex);
				root.add(node);
			});
		}

		return root;
	}

	private parseNode(index: number): Object3D {
		const nodeDef = this.json!.nodes![index];
		const object = new Object3D();
		object.name = nodeDef.name || `Node_${index}`;

		// Transform
		if (nodeDef.matrix) {
			object.localMatrix.set(
				nodeDef.matrix[0],
				nodeDef.matrix[1],
				nodeDef.matrix[2],
				nodeDef.matrix[3],
				nodeDef.matrix[4],
				nodeDef.matrix[5],
				nodeDef.matrix[6],
				nodeDef.matrix[7],
				nodeDef.matrix[8],
				nodeDef.matrix[9],
				nodeDef.matrix[10],
				nodeDef.matrix[11],
				nodeDef.matrix[12],
				nodeDef.matrix[13],
				nodeDef.matrix[14],
				nodeDef.matrix[15],
			);
			object.localMatrix.decompose(
				object.position,
				object.rotation,
				object.scale,
			);
		} else {
			if (nodeDef.translation) {
				object.position.set(
					nodeDef.translation[0],
					nodeDef.translation[1],
					nodeDef.translation[2],
				);
			}
			if (nodeDef.rotation) {
				object.rotation.set(
					nodeDef.rotation[0],
					nodeDef.rotation[1],
					nodeDef.rotation[2],
					nodeDef.rotation[3],
				);
			}
			if (nodeDef.scale) {
				object.scale.set(nodeDef.scale[0], nodeDef.scale[1], nodeDef.scale[2]);
			}
			object.updateLocalMatrix();
		}

		// Mesh
		if (nodeDef.mesh !== undefined) {
			const geometries = this.geometries.get(nodeDef.mesh);
			const meshDef = this.json!.meshes![nodeDef.mesh];

			if (geometries) {
				// A node with a mesh can have multiple primitives.
				// If 1 primitive, just make this object a Mesh.
				// If multiple, make children Meshes.

				if (geometries.length === 1) {
					const primitiveDef = meshDef.primitives[0];
					const materialIndex = primitiveDef.material;
					let material = this.materials.get(materialIndex!);
					if (!material) material = new StandardMaterial(); // Default material

					// We need to upgrade Object3D to Mesh or create a Mesh and add it?
					// Object3D cannot become Mesh easily in JS usually unless we mixin or replace.
					// Easier: Create a Mesh instead of Object3D if it has a Mesh.
					// But we already created Object3D to handle children later.
					// Let's create the Mesh and copy transform, or add Mesh as child.
					// If we add as child, transform applies to it.
					// But typically the node ITSELF is the mesh.

					// Helper: actually create Mesh if nodeDef.mesh is present.
					const mesh = new Mesh(geometries[0], material);
					mesh.name = object.name;
					mesh.position.copy(object.position);
					mesh.rotation.copy(object.rotation);
					mesh.scale.copy(object.scale);
					mesh.localMatrix.copy(object.localMatrix);

					// Replace 'object' with 'mesh' for the return
					// But we need to handle children...
					// So let's re-assign 'object' reference? No, types.

					// Let's change the strategy: If node has mesh, creates Mesh(es).
					// If multiple primitives, create Group (Object3D) and add Meshes as children.

					// Re-do:
					return this.createMeshNode(geometries, meshDef, object);
				} else {
					// Multiple primitives -> Group
					geometries.forEach((geo, i) => {
						const primitiveDef = meshDef.primitives[i];
						const materialIndex = primitiveDef.material;
						let material = this.materials.get(materialIndex!);
						if (!material) material = new StandardMaterial();

						const subMesh = new Mesh(geo, material);
						subMesh.name = `${object.name}_Primitive_${i}`;
						object.add(subMesh);
					});
				}
			}
		}

		// Children
		if (nodeDef.children) {
			nodeDef.children.forEach((childIndex) => {
				const child = this.parseNode(childIndex);
				object.add(child);
			});
		}

		return object;
	}

	private createMeshNode(
		geometries: Geometry[],
		meshDef: GLTFMesh,
		originalObject: Object3D,
	): Object3D {
		if (geometries.length === 1) {
			const primitiveDef = meshDef.primitives[0];
			const materialIndex = primitiveDef.material;
			let material = this.materials.get(materialIndex!);
			if (!material) material = new StandardMaterial();

			const mesh = new Mesh(geometries[0], material);
			mesh.name = originalObject.name;
			mesh.position.copy(originalObject.position);
			mesh.rotation.copy(originalObject.rotation);
			mesh.scale.copy(originalObject.scale);
			// mesh.localMatrix.copy(originalObject.localMatrix); // updateLocalMatrix will overwrite anyway
			mesh.updateLocalMatrix();

			// Transfer children if any (rare for mesh node to have children but possible in GLTF)
			originalObject.children.forEach((c: Object3D) => {
				mesh.add(c);
			});

			return mesh;
		} else {
			// Already handled by adding to originalObject
			return originalObject;
		}
	}
}

type TypedArray =
	| Int8Array
	| Uint8Array
	| Int16Array
	| Uint16Array
	| Uint32Array
	| Float32Array;
