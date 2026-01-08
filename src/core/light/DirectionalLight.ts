import { Vector3 } from "../../math";
import { OrthographicCamera } from "../camera/OrthographicCamera";
import { Light } from "./Light";

export class DirectionalLight extends Light {
	constructor(color: Vector3 = new Vector3(1, 1, 1), intensity: number = 1) {
		super(color, intensity);
	}

	get direction(): Vector3 {
		const forward = new Vector3(0, 0, -1);
		forward.applyQuaternion(this.rotation);
		return forward.normalize();
	}

	shadow: {
		camera: OrthographicCamera;
		mapSize: { width: number; height: number };
		bias: number;
		map: GPUTexture | undefined;
		view: GPUTextureView | undefined;
		sampler: GPUSampler | undefined;
		autoUpdate: boolean;
	} = {
		camera: new OrthographicCamera(-5, 5, 5, -5, 0.5, 50),
		mapSize: { width: 2048, height: 2048 },
		bias: 0.005,
		map: undefined,
		view: undefined,
		sampler: undefined,
		autoUpdate: true,
	};
}
