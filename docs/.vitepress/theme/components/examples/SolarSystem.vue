<script setup lang="ts">
import BaseExample, { type ExampleContext } from "../BaseExample.vue";

function setup({ canvas, gfx }: ExampleContext) {
	const {
		Renderer,
		Scene,
		Mesh,
		SphereGeometry,
		BasicMaterial,
		PerspectiveCamera,
		Object3D,
		Vector3,
	} = gfx;

	const renderer = new Renderer(canvas);

	const scene = new Scene();

	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
	camera.position = new Vector3(0, 10, 15);
	camera.lookAt(new Vector3(0, 0, 0));

	// Create the sun (center of the system)
	const sun = new Mesh(
		new SphereGeometry(),
		new BasicMaterial({ color: new Vector3(1, 0.8, 0.2) }),
	);
	sun.scale.set(2, 2, 2);
	scene.add(sun);

	// Create an orbit pivot for Earth
	const earthOrbit = new Object3D();
	scene.add(earthOrbit);

	// Create Earth - offset from the orbit pivot
	const earth = new Mesh(
		new SphereGeometry(),
		new BasicMaterial({ color: new Vector3(0.2, 0.4, 1) }),
	);
	earth.position.x = 8; // 8 units from sun
	earthOrbit.add(earth);

	// Create Moon orbit (relative to Earth)
	const moonOrbit = new Object3D();
	earth.add(moonOrbit);

	// Create Moon
	const moon = new Mesh(
		new SphereGeometry(),
		new BasicMaterial({ color: new Vector3(0.7, 0.7, 0.7) }),
	);
	moon.position.x = 1.5; // 1.5 units from Earth
	moon.scale.set(0.5, 0.5, 0.5);
	moonOrbit.add(moon);

	let animationId: number;

	const animate = () => {
		// Rotate Earth's orbit around the sun
		earthOrbit.rotateY(0.01);

		// Rotate Moon's orbit around Earth
		moonOrbit.rotateY(0.03);

		// Spin the planets
		earth.rotateY(0.02);
		moon.rotateY(0.01);

		renderer.render(scene, camera);
		animationId = requestAnimationFrame(animate);
	};
	animate();

	return () => cancelAnimationFrame(animationId);
}
</script>

<template>
  <BaseExample title="Solar System" :setup="setup" />
</template>
