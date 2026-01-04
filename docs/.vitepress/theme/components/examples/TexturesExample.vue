<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

async function setup({ canvas, gfx }: ExampleContext) {
	const {
		Renderer,
		Scene,
		Mesh,
		BoxGeometry,
		PerspectiveCamera,
		Vector3,
		LambertMaterial,
		DirectionalLight,
		Texture,
	} = gfx;

	const renderer = new Renderer(canvas);

	const scene = new Scene();

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
	camera.position = new Vector3(1, 1, 2);
	camera.lookAt(new Vector3(0, 0, 0));

	const light = new DirectionalLight();
	light.position = new Vector3(5, 8, 5);
	light.lookAt(new Vector3(0, 0, 0));
	light.intensity = 2.0;
	scene.add(light);

	const texture = await Texture.load("/crate.gif");

	const geometry = new BoxGeometry({ width: 1, height: 1, depth: 1 });
	const material = new LambertMaterial({
		map: texture,
	});

	const cube = new Mesh(geometry, material);
	scene.add(cube);

	let animationId: number;
	const animate = () => {
		const t = performance.now() / 1000;

		cube.rotateX(0.01);
		cube.rotateY(0.01);

		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	};
	animate();

	return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample title="Textured Box" :setup="setup" />
</template>
