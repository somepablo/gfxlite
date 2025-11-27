import {
    BasicMaterial,
    BoxGeometry,
    Mesh,
    PerspectiveCamera,
    Renderer,
    Scene,
} from "../src";
import { Vector3 } from "../src/math";

const canvas = document.getElementById("gfx-canvas") as HTMLCanvasElement;

const renderer = new Renderer(canvas);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.resize();

const scene = new Scene();

// Create two different materials
const orangeMaterial = new BasicMaterial({ color: new Vector3(1.0, 0.5, 0.2) });
const purpleMaterial = new BasicMaterial({ color: new Vector3(0.6, 0.2, 0.9) });

const boxGeometry = new BoxGeometry({
    width: 1,
    height: 1,
    depth: 1,
});
const box = new Mesh(boxGeometry, orangeMaterial);
scene.add(box);

const smallBoxGeometry = new BoxGeometry({
    width: 2,
    height: 2,
    depth: 2,
});
const smallBox = new Mesh(smallBoxGeometry, purpleMaterial);
smallBox.position.x = 5; // Position it to the side of the main box
scene.add(smallBox);

const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
);
camera.position.set(0, 3, 10);
camera.lookAt(new Vector3(0, 0, 0));

window.addEventListener("resize", () => {
    renderer.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

function frame() {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
