<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

async function setup({ canvas, gfx }: ExampleContext) {
	const {
		Renderer,
		Scene,
		Mesh,
		SphereGeometry,
		PerspectiveCamera,
		Vector3,
		BasicMaterial,
		LambertMaterial,
		PhongMaterial,
		StandardMaterial,
		DirectionalLight,
		Environment,
	} = gfx;

	const renderer = new Renderer(canvas);

	const scene = new Scene();

	const environment = await Environment.loadHDR("/env.hdr");
	scene.environment = environment;

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const camera = new PerspectiveCamera(45, width / height, 0.1, 1000);
	camera.position = new Vector3(0, 0, 6);

	const light = new DirectionalLight();
	light.position = new Vector3(5, 5, 5);
	light.intensity = 1.5;
	scene.add(light);

	const geometry = new SphereGeometry({
		radius: 0.8,
		widthSegments: 32,
		heightSegments: 16,
	});

	const materials = [
		{ mat: new BasicMaterial({ color: new Vector3(0.8, 0.2, 0.2) }), x: -3 },
		{
			mat: new LambertMaterial({ color: new Vector3(0.2, 0.8, 0.2) }),
			x: -1,
		},
		{
			mat: new PhongMaterial({
				color: new Vector3(0.2, 0.2, 0.8),
				shininess: 64,
			}),
			x: 1,
		},
		{
			mat: new StandardMaterial({
				baseColor: new Vector3(0.8, 0.6, 0.2),
				roughness: 0.3,
				metallic: 0.8,
			}),
			x: 3,
		},
	];

	for (const { mat, x } of materials) {
		const mesh = new Mesh(geometry, mat);
		mesh.position.x = x;
		scene.add(mesh);
	}

	let animationId: number;
	const animate = () => {
		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	};
	animate();

	return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample
    title="Material Types: Basic, Lambert, Phong, Standard"
    :setup="setup"
  />
</template>
