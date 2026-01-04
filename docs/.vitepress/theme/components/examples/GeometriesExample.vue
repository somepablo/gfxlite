<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

function setup({ canvas, gfx }: ExampleContext) {
	const {
		Renderer,
		Scene,
		Mesh,
		PerspectiveCamera,
		Vector3,
		Euler,
		BoxGeometry,
		SphereGeometry,
		CylinderGeometry,
		TorusGeometry,
		ConeGeometry,
		LambertMaterial,
		DirectionalLight,
	} = gfx;

	const renderer = new Renderer(canvas);

	const scene = new Scene();
	scene.ambientLight = new Vector3(0.5, 0.5, 0.5);
	const light = new DirectionalLight();
	light.position = new Vector3(1, 5, 2);
	light.lookAt(new Vector3(0, 0, 0));
	scene.add(light);

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
	camera.position = new Vector3(0, 0, 8);

	const geometries = [
		{
			geo: new BoxGeometry({
				width: 1.2,
				height: 1.2,
				depth: 1.2,
			}),
			color: new Vector3(0.9, 0.3, 0.3),
			x: -5,
		},
		{
			geo: new SphereGeometry({
				radius: 1,
				widthSegments: 32,
				heightSegments: 16,
			}),
			color: new Vector3(0.3, 0.9, 0.3),
			x: -2.5,
		},
		{
			geo: new CylinderGeometry({
				radiusTop: 0.8,
				radiusBottom: 0.8,
				height: 1.8,
				radialSegments: 32,
				heightSegments: 16,
				openEnded: false,
			}),
			color: new Vector3(0.3, 0.3, 0.9),
			x: 0,
		},
		{
			geo: new TorusGeometry({
				radius: 0.8,
				tube: 0.3,
				radialSegments: 16,
				tubularSegments: 32,
			}),
			color: new Vector3(0.9, 0.9, 0.3),
			x: 2.5,
		},
		{
			geo: new ConeGeometry({
				radius: 0.8,
				height: 1.8,
				radialSegments: 32,
				heightSegments: 16,
				openEnded: false,
			}),
			color: new Vector3(0.9, 0.3, 0.9),
			x: 5,
		},
	];

	const meshes: InstanceType<typeof Mesh>[] = [];
	for (const { geo, color, x } of geometries) {
		const material = new LambertMaterial({ color });
		const mesh = new Mesh(geo, material);
		mesh.position.x = x;
		scene.add(mesh);
		meshes.push(mesh);
	}

	let animationId: number;
	const animate = () => {
		const t = performance.now() / 1000;
		for (let i = 0; i < meshes.length; i++) {
			meshes[i].rotation.setFromEuler(new Euler(t + i, t * 1.5 + i, 0));
		}
		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	};
	animate();

	return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample title="Built-in Geometries" :setup="setup" />
</template>
