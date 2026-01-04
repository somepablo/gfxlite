import type { Scene } from "../scene/Scene";
import type { Camera } from "../camera/Camera";

export abstract class RenderPhase {
	protected device: GPUDevice;
	protected label: string;

	constructor(device: GPUDevice, label: string) {
		this.device = device;
		this.label = label;
	}

	abstract prepare(scene: Scene, camera: Camera): void;
	abstract execute(commandEncoder: GPUCommandEncoder): void;
	dispose?(): void;
}
