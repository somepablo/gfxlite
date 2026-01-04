<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

function setup({ canvas, gfx }: ExampleContext) {
	const {
		Renderer,
		Scene,
		Mesh,
		SphereGeometry,
		PlaneGeometry,
		PerspectiveCamera,
		Vector3,
		Euler,
		PhongMaterial,
		DirectionalLight,
		ShadowType,
	} = gfx;

	const renderer = new Renderer(canvas, { shadowType: ShadowType.PCFSoft });

	const scene = new Scene();

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
	camera.position = new Vector3(1, 3, 5);
	camera.lookAt(new Vector3(0, 0, 0));

	const light = new DirectionalLight();
	light.position = new Vector3(5, 8, 5);
	light.lookAt(new Vector3(0, 0, 0));
	light.intensity = 2.0;
	light.castShadow = true;
	light.shadowMapSize = 2048;
	scene.add(light);

	const floorGeometry = new PlaneGeometry({
		width: 12,
		height: 12,
	});
	const floorMaterial = new PhongMaterial({
		color: new Vector3(0.3, 0.3, 0.35),
	});
	const floor = new Mesh(floorGeometry, floorMaterial);
	floor.position.y = -1;
	floor.receiveShadow = true;
	scene.add(floor);

	const sphereGeometry = new SphereGeometry({
		radius: 1,
		widthSegments: 32,
		heightSegments: 16,
	});
	const spheres: InstanceType<typeof Mesh>[] = [];

	const colors = [
		new Vector3(0.9, 0.2, 0.2),
		new Vector3(0.2, 0.9, 0.2),
		new Vector3(0.2, 0.2, 0.9),
	];

	for (let i = 0; i < 3; i++) {
		const material = new PhongMaterial({ color: colors[i], shininess: 64 });
		const sphere = new Mesh(sphereGeometry, material);
		sphere.position.x = (i - 1) * 2;
		sphere.position.y = 0;
		sphere.castShadow = true;
		sphere.receiveShadow = true;
		scene.add(sphere);
		spheres.push(sphere);
	}

	let animationId: number;
	const animate = () => {
		const t = performance.now() / 1000;

		for (let i = 0; i < spheres.length; i++) {
			spheres[i].position.y = Math.abs(Math.sin(t * 2 + i * 1.2)) * 1.5;
		}

		light.position.x = Math.sin(t * 0.5) * 6;
		light.position.z = Math.cos(t * 0.5) * 6;
		light.lookAt(new Vector3(0, 0, 0));

		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	};
	animate();

	return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample title="Directional Lighting with Soft Shadows" :setup="setup" />
</template>
