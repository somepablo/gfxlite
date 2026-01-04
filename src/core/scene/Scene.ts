import { Object3D } from "../object/Object3D";
import { Vector3 } from "../../math";
import type { Environment } from "../environment/Environment";

export type SceneBackground =
	| { type: "none" }
	| { type: "color"; color: Vector3 }
	| { type: "environment" };

export class Scene extends Object3D {
	public ambientLight: Vector3 = new Vector3(0.1, 0.1, 0.1);
	public environment: Environment | null = null;
	public background: SceneBackground = { type: "none" };
}
